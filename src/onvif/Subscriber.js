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
  }) {
    this.logger = logger.child({ name: `ONVIF/${name}`, hostname });

    this.onEvent = onEvent;
    this.name = name;
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
    } else {
      this.logger.info(`Successfully connected.`);
      this.cam.on('event', this.onCameraEvent); 
    }
  };

  unsubscribe = () => {
    // todo по хорошему нужно дисконнектится от камеры. Без этого могут быть проблемы
    this.cam.removeListener('event', this.onCameraEvent);
  }
}