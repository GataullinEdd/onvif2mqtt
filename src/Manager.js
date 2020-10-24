import config from './Config';
import logger from './Logger';
import OnvifSubscriberGroup from './onvif/SubscriberGroup';
import MqttPublisher from './mqtt/Publisher';
import { CALLBACK_TYPES } from "./onvif/SubscriberGroup";
import debounceStateUpdate from "./utils/debounceStateUpdate";
import interpolateTemplateValues from './utils/interpolateTemplateValues';
import OnvifDevicesStore from './OnvifDevidesStore';
import Ping from './Ping';

const convertBooleanToSensorState = bool => bool ? 'ON' : 'OFF';

export default class Manager {
  constructor() {
    this.logger = logger.child({ name: 'Manager' });
    
    this.init();
  }

  init = async () => {
    this.logger.info('Beginning initialization...');

    this.publisher = new MqttPublisher(config.get('mqtt'));
    await this.publisher.connect();
    this.subscriber = new OnvifSubscriberGroup([], this.onError);

    this.ping = new Ping(this);

    const configPath = config.get('onvifDevicesJson');
    let devices = []
    if (configPath) {
      devices = await OnvifDevicesStore.init(configPath, this.onConfigUpdated)
    } else {
      devices = config.get('onvif');
    }
    this.initializeOnvifDevices(devices);
    this.subscriber.withCallback(CALLBACK_TYPES.motion, this.onMotionDetected); 
  };

  onConfigUpdated = diff => {
    this.finalizeOnvifDevices(diff.removed);
    this.initializeOnvifDevices(diff.added);
    this.updateOnvifDevice(diff.updated);
  };

  initializeOnvifDevices = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name } = onvifDevice;
      await this.subscriber.addSubscriber(onvifDevice);
      this.ping.add(onvifDevice);
      this.onAdded(name);
    });
  };

  updateOnvifDevice = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name: deviceName } = onvifDevice;

      this.subscriber.removeSubscribers(({name}) => {
        return deviceName === name;
      });
      await this.subscriber.addSubscriber(onvifDevice);
      this.ping.update(onvifDevice);
      this.onUpdate(deviceName);
    });
  }

  finalizeOnvifDevices = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name: deviceName } = onvifDevice;

      this.subscriber.removeSubscribers(({name}) => {
        return deviceName === name;
      });
      this.ping.remove(onvifDevice);
      this.onRemoved(deviceName);
    });
  }

  publishTemplates = (onvifDeviceId, eventType, eventState, timestamp) => {
    const templates = config.get('api.templates');

    if (!templates) {
      return;
    }

    templates.forEach(({
      subtopic, template, retain
    }) => {
      const interpolationValues = {
        onvifDeviceId,
        eventType,
        eventState, 
        timestamp
      };
      const interpolatedSubtopic = interpolateTemplateValues(subtopic, interpolationValues);
      const interpolatedTemplate = interpolateTemplateValues(template, interpolationValues);

      this.publisher.publish(onvifDeviceId, interpolatedSubtopic, interpolatedTemplate, retain);
    });
  };
  
  /* Event Callbacks */
  onMotionDetected = (onvifDeviceId, boolMotionState, timestamp) => {
    const topicKey = 'motion';
    this.publishTemplates(onvifDeviceId, topicKey, boolMotionState, timestamp);
    this.publisher.publish(onvifDeviceId, topicKey, convertBooleanToSensorState(boolMotionState));
  };

  onError = (onvifDeviceId, err) => {
    this.publish(onvifDeviceId, 'error', err.code);
  };
  
  publish = (onvifDeviceId, topicKey, state, timest) => {
    this.publishTemplates(
      onvifDeviceId,
      topicKey,
      state !== undefined ? state : '',
      timest || Date.now()
    );

    // пока убрал. Не понятно зачем, если строка выше тоже публикует событие по шаблону
    //this.publisher.publish(onvifDeviceId, topicKey, true, Date.now() );
  };

  // TODO подумать над тем, чтобы массово отправлять сообщения для всех добавленных, удаленных, обновленных камерах
  // позволит разгрузить mqtt
  onAdded = onvifDeviceId => {
    this.publish(onvifDeviceId, 'subscribe');
  };

  onRemoved = onvifDeviceId => {
    this.publish(onvifDeviceId, 'unsubscride');
  };

  onUpdate = onvifDeviceId => {
    this.publish(onvifDeviceId, 'update');
  };
}