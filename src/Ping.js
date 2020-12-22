import logger from './Logger';
import ping from 'ping';
import { exec } from 'child_process'


export default class Ping {
    /**
     * Ping hosts
     * @param {
     *    handlers: Collback functions list. Arguments - device and result of ping
     *    timeinterval: Number. Seconds for ping interval
     * } options
     */
    constructor(options) {
      this.logger = logger.child({ name: 'Ping' });

      this.handlers = options.handlers;
      this.timeinterval = (options.timeinterval * 1000) || 10000;

      this.devices = [];
      this.init();
    }

    init = () => {
        this.logger.info('Ping initialization...', this.timeinterval);
        setInterval(() => {
            this.pingAll();
        }, this.timeinterval);
    };

    /**
     * Ping all devices
     */
    pingAll = () => {
        this.devices.forEach( (device) => {
            this.pingCmd(device);
        });
    };

    pingCmd = (device) => {
        if (device.stream_url) {
            exec(`curl --head --connect-timeout 2 -i -X OPTIONS "${device.stream_url}"`,
                {shell: true, encoding: 'utf8'},
                (error, stdout, stderr) => {
                    if (stdout && stdout.includes('RTSP/1.0 200 OK')) {
                        // this.logger.info('Ping curl ', device.name, device.stream_url, stdout);
                        this.setDeviceAlive(device, true);
                    } else {
                        if (device.online) {
                            this.logger.error('Ping curl error ', device.name, device.stream_url, error, stdout, stderr);
                        }
                        this.setDeviceAlive(device, false);
                    }
            });
        } else {
            this.ping(device)
        }
    };

    /**
     * Ping device
     * @param {*} device
     */
    ping = async (device) => {
        let res = await ping.promise.probe(device.hostname);
        this.setDeviceAlive(device, res.alive);
        // this.logger.debug('Ping ', device.name, device.hostname, device.online, device.stateTS);
    };

    setDeviceAlive = (device, is_alive) => {
        if (device.online !== is_alive) {
            device.stateTS = Date.now();
            this.handlers.forEach((fn) => fn(device, is_alive));
        }
        device.online = is_alive;
    };

    /**
     * Get device object by name
     * @param {String} name
     */
    getDeviceByName = (name) => {
        return this.devices.find( (device) => device.name === name ) || {};
    };

    /**
     * Update device params
     * @param {*} device
     */
    update = (device) => {
        let old = this.getDeviceByName(device.name);
        old =  { ...old, ...device };
        this.logger.debug('Ping update', device.name, device.hostname);
    };

    /**
     * Add new device for ping
     * @param {*} device
     */
    add = (device) => {
        this.devices.push({
            online: true,
            stateTS: Date.now(),
            ...device
        });
        this.ping(this.devices[this.devices.length - 1]);
        this.logger.debug('Ping add', device.name, device.hostname);
    };

    /**
     * Remove device by name from device list
     * @param {*} device
     */
    remove = (device) => {
        this.devices = this.devices.filter( (dev) => dev.name !== device.name );
        this.logger.debug('Ping remove', device.name, device.hostname);
    };
}
