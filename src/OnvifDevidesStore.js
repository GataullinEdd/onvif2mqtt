import fs from 'fs';
import path from 'path';
import util from 'util';
import compareArrays from './utils/compareArrays';
import Logger from './Logger';

const readFile = util.promisify(fs.readFile);

const logger = Logger.child({ name: 'OnvifDevidesStore' });

let devices;

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
            return JSON.parse(json);
        } catch (e) {
            logger.error(`Error while reading config file ${configPath}`, e);
            logger.error(e);
            throw e;
        }
    }
}