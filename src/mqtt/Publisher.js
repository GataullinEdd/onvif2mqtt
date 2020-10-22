import MQTT from 'async-mqtt';
import logger from '../Logger';

const HOMEASSISTANT_PREFIX = 'homeassistant/';

const DEFAULT_OPTIONS = {
};

export default class MqttPublisher {
  client;

  constructor(userOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...userOptions };

    const { host, port, clientId } = this.options;
    this.logger = logger.child({ name: 'MQTT', hostname: `${host}:${port} as ${clientId}` });
  }

  connect = async () => {
    this.logger.info('Connecting.');

    this.client = await MQTT.connectAsync(this.options);

    this.logger.info('Successfully connected.');
  };

  publish = async (onvifId, event, value, retain = true) => {
    if (onvifId) {
      const topic = `onvif2mqtt/${onvifId}/${event}`;

      try {
        this.logger.debug('Publishing.', { topic, value, retain });
        await this.client.publish(`onvif2mqtt/${onvifId}/${event}`, value, { retain });
      } catch (e) {
        this.logger.error('Failed to publish', { error: e, topic, value, retain });
      }
    }
  };
}