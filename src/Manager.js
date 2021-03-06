import config from './Config';
import logger from './Logger';
import OnvifSubscriberGroup from './onvif/SubscriberGroup';
import MqttPublisher from './mqtt/Publisher';
import { CALLBACK_TYPES } from "./onvif/SubscriberGroup";
import debounceStateUpdate from "./utils/debounceStateUpdate";
import interpolateTemplateValues from './utils/interpolateTemplateValues';
import OnvifDevicesStore from './OnvifDevidesStore';
import Ping from './Ping';
import redis from 'redis';

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

    // инфа по составу камер для статистики и триггеров
    // "cameras:onvif:success - количество подключенных по onvif
    // cameras:onvif:failed - количество не подключенных
    // cameras:online - количество онлайн камер (у которых статус положительный)
    // cameras:offline - количество оффлайн (которые не але по пингу) если это вообще сохраняется где-то
    // cameras:total - общее число камер из конфига"
    this.info = {
         onvif: {
            total: 0,
            success: 0,
            failed: 0
         },
         online: 0,
         offline: 0,
         total: 0
    };

    this.ping = new Ping({
      handlers: [
        this.onPing.bind(this)
      ],
      timeinterval: config.get('timeouts.ping')
    });

    const configPath = config.get('onvifDevicesJson');
    let devices = [];
    if (configPath) {
      devices = await OnvifDevicesStore.init(configPath, this.onConfigUpdated);
    } else {
      devices = config.get('onvif');
    }

    this.info.total = devices.length;

    this.initializeOnvifDevices(devices);
    this.subscriber.withCallback(CALLBACK_TYPES.motion, this.onMotionDetected);
    this.subscriber.withCallback(CALLBACK_TYPES.silence, this.onSilent);

    // keepalive
    this._keepAliveTrigger();
  };

  _keepAliveTrigger = () => {
    const timeinterval = config.get('timeouts.ping') || 60;
    const rclient = redis.createClient(config.get('redis'));

    rclient.on("error", (error) => {
        this.logger.error('Redis error', error);
    });

    setInterval(() => {
      this._checkInfo();
      // this.logger.info('Info cameras', this.info);

      rclient.set('onvif:subscriber:alive', '1', (err) => {
        if (err) {
            this.logger.debug('Redis set onvif:subscriber:alive', { err });
        }
      });
      rclient.expire('onvif:subscriber:alive', timeinterval*2);

      rclient.set('cameras:total', this.info.total.toString());
      rclient.set('cameras:onvif:total', this.info.onvif.total.toString());
      rclient.set('cameras:onvif:success', this.info.onvif.success.toString());
      rclient.set('cameras:onvif:failed', this.info.onvif.failed.toString());
      rclient.set('cameras:online', this.info.online.toString());
      rclient.set('cameras:offline', this.info.offline.toString());

    }, timeinterval*1000);
  };

  _checkInfo = () => {
      this.info.onvif.success = 0;
      this.info.online = 0;
      this.info.offline = 0;

      this.info.onvif.total = this.subscriber.subscribers.length;
      this.subscriber.subscribers.forEach((sub) => {
         if (sub.subscribed) {
            this.info.onvif.success += 1;
         }

         if (sub.online) {
            this.info.online += 1;
         } else {
            this.info.offline += 1;
         }
      });

      this.info.onvif.failed = this.info.onvif.total - this.info.onvif.success;
  };

  onConfigUpdated = diff => {
    this.finalizeOnvifDevices(diff.removed);
    this.initializeOnvifDevices(diff.added);
    this.updateOnvifDevice(diff.updated);

    this.info.total = (diff.added || []).length + (diff.updated || []).length;
  };

  initializeOnvifDevices = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name } = onvifDevice;

      this._addSubscriber(onvifDevice);
      this.ping.add(onvifDevice);
      this.onAdded(name);
    });
  };

  updateOnvifDevice = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name: deviceName } = onvifDevice;

      this.subscriber.removeSubscribers(({ name }) => {
        return deviceName === name;
      });

      this._addSubscriber(onvifDevice);
      this.ping.update(onvifDevice);
      this.onUpdate(deviceName);
    });
  };

  _addSubscriber = (onvifDevice) => {
    onvifDevice.reconnect = config.get('timeouts.subscribe');
    return this.subscriber.addSubscriber(onvifDevice);
  };

  finalizeOnvifDevices = devices => {
    devices.forEach(async (onvifDevice) => {
      const { name: deviceName } = onvifDevice;

      this.subscriber.removeSubscribers(({ name }) => {
        return deviceName === name;
      });
      this.ping.remove(onvifDevice);
      this.onRemoved(deviceName);
    });
  };

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
  onMotionDetected = (onvifDeviceId, motionState, timestamp) => {
    const topicKey = 'motion';

    const boolMotionState = motionState.IsMotion !== undefined ? motionState.IsMotion : motionState.State;

    this.publishTemplates(onvifDeviceId, topicKey, boolMotionState, timestamp);
    // this.publisher.publish(onvifDeviceId, topicKey, convertBooleanToSensorState(boolMotionState));
  };

  /* Event Silent Callbacks */
  onSilent = (onvifDeviceId) => {
    this.publish(onvifDeviceId, 'silence', true, Date.now());
  };


  onError = (onvifDeviceId, err) => {
    this.publish(onvifDeviceId, 'error', err.code);
  };

  publish = (onvifDeviceId, topicKey, state, timest) => {
    const MS_IN_HOUR = 3600000;
    timest = timest || Date.now();

    // если время события отличается от текущего больше чем на час, посылаем события рассинхрона
    if (Math.abs(timest - Date.now()) > MS_IN_HOUR) {
      this.publishTemplates(onvifDeviceId, 'desynchronization', timest, Date.now());
    }

    this.publishTemplates(
      onvifDeviceId,
      topicKey,
      state !== undefined ? state : '',
      timest
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

  onPing = (device, is_alive) => {
    this.publish(device.name, 'online', is_alive, device.stateTS);
  };
}
