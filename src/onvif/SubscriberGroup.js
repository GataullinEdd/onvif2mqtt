import logger from '../Logger';
import Subscriber from './Subscriber';

const NO_OP = () => {};

const NAMESPACE_DELIMITER = ':';

export const CALLBACK_TYPES = {
  motion: 'onMotionDetected',
  silence: 'onSilence'
};

const EVENTS = {
  'RuleEngine/CellMotionDetector/Motion': CALLBACK_TYPES.motion
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
    this.subscribers.push(new Subscriber({
      ...subscriberConfig,
      onEvent: this.onSubscriberEvent
    }));

    // this._addSilentTimer(subscriberConfig.name);
  };

  _sendSilence = (name) => {
    {
      this.logger.trace(`ONVIF no events on ${name}`);
      this.callbacks[CALLBACK_TYPES.silence](name);
    }
  };

  _addSilentTimer = (name) => {
    const DAY_IN_MS = 86400000;
    this._removeSilentTimer(name);

    this.silentTimers[name] = setInterval(
      this._sendSilence.bind(this, name)
      , DAY_IN_MS
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
      // this._removeSilentTimer(subscriber.name);
    });

    this.subscribers = this.subscribers.filter((subscriber) => {
      return !targets.includes(subscriber);
    });
  };

  onSubscriberEvent = (subscriberName, error, event) => {
    if (error) {
      this.logger.trace('ONVIF received failed', { subscriberName });
      //this.logger.debug('ONVIF error', { error });
      this.errorCallBack(subscriberName, error);
    } else {
      //this.logger.debug('ONVIF event', { event });
      const [namespace, eventType] = event.topic._.split(NAMESPACE_DELIMITER);
      const callbackType = EVENTS[eventType];
      const utcTime = event.message.message.$.UtcTime;
      const timestamp = utcTime.getTime();
      const eventValue = event.message.message.data.simpleItem.$.Value;

      this.logger.trace('ONVIF received', { subscriberName, eventType, eventValue });
      this.callbacks[callbackType](subscriberName, eventValue, timestamp);

      /*
      if (callbackType) {
        this._addSilentTimer(subscriberName);
      }
      */
    }
  };
}
