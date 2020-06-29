import logger from '../Logger';
import Subscriber from './Subscriber';

const NO_OP = () => {};

const NAMESPACE_DELIMITER = ':';

export const CALLBACK_TYPES = {
  motion: 'onMotionDetected'
};

const EVENTS = {
  'RuleEngine/CellMotionDetector/Motion': CALLBACK_TYPES.motion
};

const DEFAULT_CALLBACKS = {
  [CALLBACK_TYPES.motion]: NO_OP, 
};

export default class SubscriberGroup {
  subscribers = [];
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
      onEvent: this.onSubscriberEvent,
    }));
  };

  removeSubscribers = (predicate) => {
    const targets = this.subscribers.filter(predicate);
    targets.forEach((subscriber) => {
      subscriber.unsubscribe();
    });

    this.subscribers = this.subscribers.filter((subscriber) => {
      return !targets.includes(subscriber);
    });
  };

  onSubscriberEvent = (subscriberName, error, event) => {
    if (error) {
      this.logger.trace('ONVIF received failed', { subscriberName });
      this.errorCallBack(subscriberName, error);
    } else {   
      const [namespace, eventType] = event.topic._.split(NAMESPACE_DELIMITER);
      const callbackType = EVENTS[eventType];
      const utcTime = event.message.message.$.UtcTime;
      const timestamp = utcTime.getTime();
      const eventValue = event.message.message.data.simpleItem.$.Value;
  
      this.logger.trace('ONVIF received', { subscriberName, eventType, eventValue });
      this.callbacks[callbackType](subscriberName, eventValue, timestamp);
    }
  };
}