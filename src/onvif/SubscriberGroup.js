import logger from '../Logger';
import Subscriber from './Subscriber';

const NO_OP = () => {};

const NAMESPACE_DELIMITER = ':';

const SILENCE_TIMEOUT = 86400000;

export const CALLBACK_TYPES = {
  motion: 'onMotionDetected',
  silence: 'onSilence'
};

const EVENTS = {
  'RuleEngine/CellMotionDetector/Motion': CALLBACK_TYPES.motion,
  'RuleEngine/CellMotionDetector/Motion//.': CALLBACK_TYPES.motion,
  'VideoSource/MotionAlarm': CALLBACK_TYPES.motion
};

const DEFAULT_CALLBACKS = {
  [CALLBACK_TYPES.motion]: NO_OP,
};

export default class SubscriberGroup {
  subscribers = [];

  // no events checker object
  silentTimers = {};
  errorCallBack = () => {};

  constructor(callbacks, errorCallBack) {
    this.callbacks = {
      ...DEFAULT_CALLBACKS,
      ...callbacks
    };

    if (errorCallBack) {
      this.errorCallBack = errorCallBack;
    }
    this.logger = logger.child({ name: 'ONVIF' });
  }

  withCallback = (callbackType, callback) => {
    this.callbacks = {
      ...this.callbacks,
      [callbackType]: callback,
    };
  };

  addSubscriber = (subscriberConfig) => {
      let subscr = new Subscriber({
         ...subscriberConfig,
         onEvent: this.onSubscriberEvent
      })
      this.subscribers.push(subscr);
      this._addSilentTimer(subscriberConfig.name);

      return subscr
  };

  _sendSilence = (name) => {
    {
      this.logger.trace(`ONVIF no events on ${name}`);
      this.callbacks[CALLBACK_TYPES.silence](name);
    }
  };

  _addSilentTimer = (name) => {
    this._removeSilentTimer(name);

    this.silentTimers[name] = setInterval(
      this._sendSilence.bind(this, name)
      , SILENCE_TIMEOUT
    );
  };

  _removeSilentTimer = (name) => {
    if (this.silentTimers[name]) {
      clearInterval(this.silentTimers[name]);
      delete this.silentTimers[name];
    }
  };


  removeSubscribers = (predicate) => {
    const targets = this.subscribers.filter(predicate);
    targets.forEach((subscriber) => {
      subscriber.destroy();
      this._removeSilentTimer(subscriber.name);
    });

    this.subscribers = this.subscribers.filter((subscriber) => {
      return !targets.includes(subscriber);
    });
  };

  _simpleItemsToObject = (items) => {
    return items.reduce((out, item) => { out[item.$.Name] = item.$.Value; return out; }, {});
  };

  _getEventTimestamp = (utcTime) => {
    let utcTimeDate = utcTime;
    if (!(utcTime instanceof Date)) {
       try {
         utcTimeDate = new Date(utcTime+'.000Z');
       } catch (error) {
         utcTimeDate = new Date();
         this.logger.error('getEventTimestamp ', { utcTime });
       }
    }

    return utcTimeDate.getTime();
  };

  onSubscriberEvent = (subscriberName, error, event) => {
    if (error) {
      this.logger.trace('ONVIF received failed', { subscriberName });
      this.errorCallBack(subscriberName, error);
    } else {
      const [namespace, eventType] = event.topic._.split(NAMESPACE_DELIMITER);
      const callbackType = EVENTS[eventType];
      if (callbackType) {
         // если есть callbackType, но нет дальше отправки события, то что-то не то обработчиках
         // для отлова проблем и ошибок
         this.logger.debug('Wait for publish eventtype', { subscriberName, eventType });
      }

      const timestamp = this._getEventTimestamp(event.message.message.$.UtcTime);
      const simpleItem = event.message.message.data.simpleItem;
      const eventValue = this._simpleItemsToObject(simpleItem instanceof(Array) ? simpleItem : [simpleItem]);

      this.logger.trace('ONVIF received', { subscriberName, eventType, eventValue });
      this.callbacks[callbackType](subscriberName, eventValue, timestamp);

      if (callbackType) {
        this._addSilentTimer(subscriberName);
      }
    }
  };
}
