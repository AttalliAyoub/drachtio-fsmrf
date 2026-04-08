"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const endpoint_1 = __importDefault(require("./endpoint"));
const conference_1 = __importDefault(require("./conference"));
const drachtio_modesl_1 = __importDefault(require("drachtio-modesl"));
const assert_1 = __importDefault(require("assert"));
const mediaserver_1 = __importDefault(require("./mediaserver"));
const events_1 = require("events");
const os_1 = __importDefault(require("os"));
const utils_1 = require("./utils");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('drachtio:fsmrf');
/**
 * Creates an instance of the MRF (Media Resource Function) manager.
 * This class coordinates with the drachtio-srf framework and manages
 * connections to one or more FreeSWITCH media servers.
 *
 * @example
 * ```typescript
 * import Srf from 'drachtio-srf';
 * import Mrf from 'drachtio-fsmrf';
 *
 * const srf = new Srf();
 * srf.connect({ host: '127.0.0.1', port: 9022, secret: 'cymru' });
 *
 * const mrf = new Mrf(srf);
 *
 * mrf.connect({
 *   address: '127.0.0.1',
 *   port: 8021,
 *   secret: 'ClueCon'
 * }).then((mediaserver) => {
 *   console.log('successfully connected to media server');
 * });
 * ```
 */
class Mrf extends events_1.EventEmitter {
    /** The Endpoint class exported for convenience. */
    static Endpoint = endpoint_1.default;
    /** The MediaServer class exported for convenience. */
    static MediaServer = mediaserver_1.default;
    /** The Conference class exported for convenience. */
    static Conference = conference_1.default;
    _srf;
    /** Directory used for debugging. */
    debugDir;
    /** Flag to indicate if sendonly mode is enabled for debugging. */
    debugSendonly;
    /** List of automatically detected local IPv4 addresses. */
    localAddresses;
    /** Array of custom events configured to be monitored. */
    customEvents;
    /** Utility methods exposed by the MRF framework. */
    static utils = { parseBodyText: utils_1.parseBodyText };
    /**
     * Initializes a new Mrf instance.
     *
     * @param srf - The drachtio-srf instance
     * @param opts - Configuration options for the MRF
     */
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
    /**
     * Returns the underlying drachtio-srf instance.
     */
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
