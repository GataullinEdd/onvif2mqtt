import logger from './Logger';
import ping from 'ping';

export default class Ping {
    constructor(manager, timeinterval) {
      this.logger = logger.child({ name: 'Ping' });
      
      this.manager = manager;
      this.timeinterval = (timeinterval * 1000) || 10000;
      this.devices = [];
      this.init();
    }

    init = () => {
        this.logger.info('Ping initialization...');
        setInterval(() => {
            this.pingAll();
        }, this.timeinterval);
    }

    pingAll = () => {
        this.devices.forEach( (device) => {
            this.ping(device);
        });
    }

    ping = async (device) => {
        let res = await ping.promise.probe(device.hostname);
        if (device.online !== res.alive) {
            device.stateTS = Date.now();
            this.manager.publish(device.name, res.alive ? 'online' : 'offline', res.alive, device.stateTS);
        }
        device.online = res.alive;
        //this.logger.debug('Ping ', device.name, device.hostname, device.online, device.stateTS);
    }

    getDeviceByName = (name) => {
        return this.devices.find( (device) => device.name === name ) || {};
    }
  
    update = (device) => {
        let old = this.getDeviceByName(device.name);
        old =  {...old, ...device};
        this.logger.debug('Ping update', device.name, device.hostname);
    }

    add = (device) => {
        this.devices.push({
            online: true,
            stateTS: Date.now(),
            ...device 
        });
        this.ping(this.devices[this.devices.length - 1]);
        this.logger.debug('Ping add', device.name, device.hostname);
    }

    remove = (device) => {
        this.devices = this.devices.filter( (dev) => dev.name !== device.name );
        this.logger.debug('Ping remove', device.name, device.hostname);
    }
}
