import fs from 'fs';
import path from 'path';
import util from 'util';
import compareArrays from './utils/compareArrays';
import Logger from './Logger';
import Schema from 'validate';

const readFile = util.promisify(fs.readFile);

const logger = Logger.child({ name: 'OnvifDevidesStore' });

let devices;

const schema = new Schema({
    name: {
      type: String,
      required: true,
    },
    hostname: {
      type: String,
      required: true,
      match: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    },
    port: {
      type: Number,
      required: true,
    },
    username: String,
    password: String,
    stream_url: String
  });

export default class OnvifDevidesStore {
    static async init (fileName, onUpdated) {
        devices = await OnvifDevidesStore._readConfig(fileName);
        OnvifDevidesStore._runWatcher(fileName, onUpdated);

        return devices;
    }

    static _runWatcher (targetFile, onUpdated) {
        logger.info('Onvif devices config is watching....');
        fs.watchFile(targetFile, async () => {
          logger.info('Onvif devices config changed');
          const newConfig = await OnvifDevidesStore._readConfig(targetFile);
          const diff = compareArrays(devices, newConfig, 'name');
          devices = newConfig;
          onUpdated(diff);
        });
    }

    static async _readConfig (configPath) {
        try {
            const json = await readFile(path.resolve(configPath), 'utf8');
            const config = JSON.parse(json);
            const validConfig = config.filter(OnvifDevidesStore._validate);

            return validConfig;
        } catch (e) {
            logger.error(`Error while reading config file ${configPath}`, e);
            logger.error(e);
            throw e;
        }
    }

    static _validate (config, index) {
        const errors =  schema.validate(
          config
        );

        if (errors.length) {
            logger.error(`Config onvif device with index=${index} validation failed...`);
            errors.forEach(({ path, message }) => {
              logger.error(message, { path });
            });
            return undefined;
        }

        return config;
    }
}
