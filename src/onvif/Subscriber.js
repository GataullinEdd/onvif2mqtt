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
  }

  onCameraEvent = camMessage => {
    this.onEvent(this.name, null, camMessage);
  };

  onSubscribe = (err) => {
    if (err) {
      this.logger.error(`Failed to connect to ${this.name}`, err);
      this.onEvent(this.name, err);
      this._reConnectTry();
    } else {
      this.cam.on('event', this.onCameraEvent);
      this.logger.info(`Successfully connected ONVIF.`);
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

  unsubscribe = () => {
    // todo по хорошему нужно дисконнектится от камеры. Без этого могут быть проблемы
    this.cam.removeListener('event', this.onCameraEvent);
  };
}
