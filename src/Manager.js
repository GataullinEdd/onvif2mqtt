import config from './Config';
import validator from './ConfigValidator';
import logger from './Logger';
import OnvifSubscriberGroup from './onvif/SubscriberGroup';
import MqttPublisher from './mqtt/Publisher';

import fs from 'fs';
import path from 'path';
import util from 'util';
import { CALLBACK_TYPES } from "./onvif/SubscriberGroup";
import debounceStateUpdate from "./utils/debounceStateUpdate";
import interpolateTemplateValues from './utils/interpolateTemplateValues';
import compareArrays from './utils/compareArrays';

const convertBooleanToSensorState = bool => bool ? 'ON' : 'OFF';

const readFile = util.promisify(fs.readFile);

export default class Manager {
  devices = [];
  constructor() {
    this.logger = logger.child({ name: 'Manager' });
    
    this.init();
  }

  init = async () => {
    this.logger.info('Beginning initialization...');

    this.publisher = new MqttPublisher(config.get('mqtt'));
    await this.publisher.connect();
    this.subscriber = new OnvifSubscriberGroup([], this.onError);

    // TODO нет валидации конфига
    const configPath = config.get('onvifDevicesJson');
    if (configPath) {
      this.devices = await this.readOnvifConfig(configPath);
      this.initializeOnvifDevices(this.devices);
      this.runOnvifDevicesWatcher(configPath);
    } else {
      this.initializeOnvifDevices(config.get('onvif'));
    }
    this.subscriber.withCallback(CALLBACK_TYPES.motion, this.onMotionDetected); 
  };

  readOnvifConfig = async (configPath) => {
    const json = await readFile(path.resolve(configPath), 'utf8');
    return JSON.parse(json);
  };

  runOnvifDevicesWatcher = targetFile => {
    this.logger.info('Onvif devices config is watching....');
    fs.watchFile(targetFile, async () => {
      this.logger.info('Onvif devices config changed');
      const newConfig = await this.readOnvifConfig(targetFile);
      const diff = compareArrays(this.devices, newConfig, 'name');
      this.devices = newConfig;
      this.finalizeOnvifDevices(diff.removed);
      this.initializeOnvifDevices(diff.added);
      this.updateOnvifDevice(diff.updated);
    });
  };

  initializeOnvifDevices = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name } = onvifDevice;
      await this.subscriber.addSubscriber(onvifDevice);
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
      this.onUpdate(deviceName);
    });
  }

  finalizeOnvifDevices = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name: deviceName } = onvifDevice;

      this.subscriber.removeSubscribers(({name}) => {
        return deviceName === name;
      });
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

  onError = (onvifDeviceId) => {
    this.publish(onvifDeviceId, 'disconnected');
  };
  
  publish = (onvifDeviceId, topicKey) => {
    this.publishTemplates(onvifDeviceId, topicKey);
    this.publisher.publish(onvifDeviceId, topicKey);
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