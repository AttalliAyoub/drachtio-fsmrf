"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const drachtio_modesl_1 = __importDefault(require("drachtio-modesl"));
const assert_1 = __importDefault(require("assert"));
const mediaserver_1 = __importDefault(require("./mediaserver"));
const events_1 = require("events");
const os_1 = __importDefault(require("os"));
const utils_1 = require("./utils");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('drachtio:fsmrf');
class Mrf extends events_1.EventEmitter {
    _srf;
    debugDir;
    debugSendonly;
    localAddresses;
    customEvents;
    static utils = { parseBodyText: utils_1.parseBodyText };
    constructor(srf, opts) {
        super();
        opts = opts || {};
        this._srf = srf;
        this.debugDir = opts.debugDir;
        this.debugSendonly = opts.sendonly;
        this.localAddresses = [];
        this.customEvents = opts.customEvents || [];
        const interfaces = os_1.default.networkInterfaces();
        for (const k in interfaces) {
            if (interfaces.hasOwnProperty(k)) {
                for (const k2 in interfaces[k]) {
                    const address = interfaces[k][k2];
                    if (address.family === 'IPv4' && !address.internal) {
                        this.localAddresses.push(address.address);
                    }
                }
            }
        }
    }
    get srf() {
        return this._srf;
    }
    connect(opts, callback) {
        assert_1.default.strictEqual(typeof opts, 'object', "argument 'opts' must be provided with connection options");
        assert_1.default.strictEqual(typeof opts.address, 'string', "argument 'opts.address' containing media server address is required");
        const address = opts.address;
        const port = opts.port || 8021;
        const secret = opts.secret || 'ClueCon';
        const listenPort = opts.listenPort || 0; // 0 means any available port
        const listenAddress = opts.listenAddress || this.localAddresses[0] || '0.0.0.0';
        const profile = opts.profile || 'drachtio_mrf';
        const _onError = (cb, err) => {
            cb(err);
        };
        const __x = (cb) => {
            const listener = _onError.bind(this, cb);
            debug(`Mrf#connect - connecting to ${address}:${port} with secret: ${secret}`);
            const conn = new drachtio_modesl_1.default.Connection(address, port, secret, () => {
                debug('initial connection made');
                conn.removeListener('error', listener);
                const ms = new mediaserver_1.default(conn, this, listenAddress, listenPort, opts.advertisedAddress, opts.advertisedPort, profile);
                ms.once('ready', () => {
                    debug('Mrf#connect - media server is ready for action!');
                    cb(null, ms);
                });
                ms.once('error', (err) => {
                    debug(`Mrf#connect - error event emitted from media server: ${err}`);
                    cb(err);
                });
            });
            conn.on('error', listener);
            conn.on('esl::event::raw::text/rude-rejection', _onError.bind(this, cb, new Error('acl-error')));
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, mediaserver) => {
                if (err)
                    return reject(err);
                resolve(mediaserver);
            });
        });
    }
}
module.exports = Mrf;
