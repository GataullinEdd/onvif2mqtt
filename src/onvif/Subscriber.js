import { Cam } from 'onvif';
import logger from '../Logger';

export default class OnvifSubscriber {
  constructor({
    onEvent,
    onConnect,
    hostname,
    username,
    password,
    port,
    name,
    reconnect,
  }) {
    this.logger = logger.child({ name: `ONVIF/${name}`, hostname });

    this.onEvent = onEvent;
    this.name = name;
    this.reconnect = reconnect || 10;
    this.onConnect = onConnect;
    this.onCameraEvent = this.onCameraEvent.bind(this);

    this.logger.info(`Attempting connection.`);

    this.cam = new Cam({
      hostname,
      username,
      password,
      port,
      preserveAddress: true
    }, this.onSubscribe);

    this.logger.info(`Attempting create cam: ${this.cam.hostname}:${this.cam.port}`);

    this.subscribed = false;
  };

  onCameraEvent = camMessage => {
    this.onEvent(this.name, null, camMessage);
  };

  onSubscribe = (err) => {
    this.subscribed = true;
    if (err) {
      this.logger.error(`Failed to connect to ${this.name} ${this.cam.hostname}:${this.cam.port}`, err);
      this.onEvent(this.name, err);
      this._reConnectTry();
    } else {
      this.logger.info(`Successfully connected ONVIF ${this.name} on ${this.cam.hostname}:${this.cam.port}`);
      this.unsubscribe();
      this.subscribe();
    }
  };

  _reConnectTry = () => {
    if (!this.cam.subTimeout) {
      this.reconnectTimeout = setTimeout( () => {
        this.logger.info(`Try reconnect to ${this.name}`);
        this.reconnectTimeout = undefined;
        this.cam.connect(this.onSubscribe);
      }, this.reconnect * 1000);
    } else {
      this.logger.debug(`Cam has timeout for reconnect ${this.name}`, this.reconnectTimeout);
    }
  };

   subscribe = () => {
      if (this.handler) {
         this.unsubscribe();
      }

      this.handler = this.onCameraEvent.bind(this)

      this.logger.info(`Subscribe ${this.cam.hostname}:${this.cam.port}`);

      this._createPullPointSubscription();
   };

   _createPullPointSubscription = () => {
      // Решение проблемы с исключением при подписке на CreatePullPointSubscription
      // https://github.com/agsh/onvif/issues/76
      this._timeoutsub = setTimeout(() => {
         this.cam.createPullPointSubscription((err, subscription, xml) => {
            if (!err) {
               this.logger.info(`CreatePullPointSubscription ${this.cam.hostname}:${this.cam.port}`);
               this.cam.on('event', this.handler);
            } else {
               this.logger.error(`CreatePullPointSubscription ${this.cam.hostname}:${this.cam.port}`);
               this._createPullPointSubscription();
            }
         });
      }, Math.floor(Math.random() * Math.floor(5000)))
   };

  unsubscribe = () => {
    // todo по хорошему нужно дисконнектится от камеры. Без этого могут быть проблемы
    if (this._timeoutsub) {
      clearTimeout(this._timeoutsub);
    }
    if (this.handler) {
      this.logger.info(`Unsubscribe ${this.cam.hostname}:${this.cam.port}`);
      this.cam.removeListener('event', this.handler);
      this.handler = undefined;
    }
  };

  destroy = () => {
      this.unsubscribe();
      if (this.reconnectTimeout) {
         clearTimeout(this.reconnectTimeout)
      }
      this.onEvent = undefined;
      this.onConnect = undefined;
      this.onCameraEvent = undefined;
      this.logger = undefined;
      delete this.cam;
  };
}
