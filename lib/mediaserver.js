"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const drachtio_modesl_1 = __importDefault(require("drachtio-modesl"));
const assert_1 = __importDefault(require("assert"));
const events_1 = require("events");
const crypto_1 = require("crypto");
const endpoint_1 = __importDefault(require("./endpoint"));
const conference_1 = __importDefault(require("./conference"));
const net_1 = __importDefault(require("net"));
const utils_1 = require("./utils");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('drachtio:fsmrf');
const RE_DTLS = /m=audio.*SAVP/;
const RE_USER_AGENT = /^drachtio-fsmrf:(.+)$/;
function requiresDtlsHandshake(sdp) {
    return RE_DTLS.test(sdp);
}
class MediaServer extends events_1.EventEmitter {
    _conn;
    _mrf;
    _srf;
    pendingConnections;
    _isMediaServerReady;
    maxSessions;
    currentSessions;
    cps;
    sip;
    _address;
    closing;
    listenAddress;
    listenPort;
    advertisedAddress;
    advertisedPort;
    _server;
    hostname;
    v4address;
    v6address;
    fsVersion;
    cpuIdle;
    constructor(conn, mrf, listenAddress, listenPort, advertisedAddress, advertisedPort, profile) {
        super();
        this._conn = conn;
        this._mrf = mrf;
        this._srf = mrf.srf;
        this.pendingConnections = new Map();
        this._isMediaServerReady = false;
        this.maxSessions = 0;
        this.currentSessions = 0;
        this.cps = 0;
        this.sip = {
            ipv4: {
                udp: {},
                dtls: {}
            },
            ipv6: {
                udp: {},
                dtls: {}
            }
        };
        this._address = this._conn.socket.remoteAddress;
        this._conn.subscribe(['HEARTBEAT']);
        this._conn.on('esl::event::HEARTBEAT::*', this._onHeartbeat.bind(this));
        this._conn.on('error', this._onError.bind(this));
        this._conn.on('esl::end', () => {
            if (!this.closing) {
                this.emit('end');
                console.error(`Mediaserver: lost connection to freeswitch at ${this.address}, attempting to reconnect..`);
            }
        });
        this._conn.on('esl::ready', () => {
            console.info(`Mediaserver: connected to freeswitch at ${this.address}`);
        });
        setTimeout(() => {
            if (!this._isMediaServerReady) {
                if (this.conn)
                    this.conn.disconnect();
                if (this._server)
                    this._server.close();
                this.emit('error', new Error('MediaServer not ready, timeout waiting for connection to freeswitch'));
            }
        }, 1000);
        const server = net_1.default.createServer();
        server.listen(listenPort, listenAddress, () => {
            const addr = server.address();
            if (addr && typeof addr !== 'string') {
                this.listenAddress = addr.address;
                this.listenPort = addr.port;
            }
            this.advertisedAddress = advertisedAddress || this.listenAddress;
            this.advertisedPort = advertisedPort || this.listenPort;
            debug(`listening on ${listenAddress}:${listenPort}, advertising ${this.advertisedAddress}:${this.advertisedPort}`);
            this._server = new drachtio_modesl_1.default.Server({ server: server, myevents: false }, () => {
                this.emit('connect');
                this._conn.api('sofia status', (res) => {
                    const status = res.getBody();
                    let re = new RegExp(`^\\s*${profile}\\s.*sip:mod_sofia@((?:[0-9]{1,3}\\.){3}[0-9]{1,3}:\\d+)`, 'm');
                    let results = re.exec(status);
                    if (null === results)
                        throw new Error(`No ${profile} sip profile found on the media server: ${status}`);
                    if (results) {
                        this.sip.ipv4.udp.address = results[1];
                    }
                    re = new RegExp(`^\\s*${profile}\\s.*sip:mod_sofia@((?:[0-9]{1,3}\\.){3}[0-9]{1,3}:\\d+).*\\(TLS\\)`, 'm');
                    results = re.exec(status);
                    if (results) {
                        this.sip.ipv4.dtls.address = results[1];
                    }
                    re = /^\s*drachtio_mrf.*sip:mod_sofia@(\[[0-9a-f:]+\]:\d+)/m;
                    results = re.exec(status);
                    if (results) {
                        this.sip.ipv6.udp.address = results[1];
                    }
                    re = /^\s*drachtio_mrf.*sip:mod_sofia@(\[[0-9a-f:]+\]:\d+).*\(TLS\)/m;
                    results = re.exec(status);
                    if (results) {
                        this.sip.ipv6.dtls.address = results[1];
                    }
                    debug('media server signaling addresses: %O', this.sip);
                    if (!this._isMediaServerReady) {
                        this.emit('ready');
                        this._isMediaServerReady = true;
                    }
                });
            });
            this._server.on('connection::ready', this._onNewCall.bind(this));
            this._server.on('connection::close', this._onConnectionClosed.bind(this));
        });
    }
    get address() {
        return this._address;
    }
    get conn() {
        return this._conn;
    }
    get srf() {
        return this._srf;
    }
    connected() {
        return this._conn ? this._conn.connected() : false;
    }
    disconnect() {
        debug(`Mediaserver#disconnect - closing connection to ${this.address}`);
        this.closing = true;
        if (this._server)
            this._server.close();
        if (this.conn) {
            this.conn.removeAllListeners();
            this.conn.disconnect();
        }
    }
    destroy() {
        return this.disconnect();
    }
    hasCapability(capability) {
        let family = 'ipv4';
        const cap = typeof capability === 'string' ? [capability] : [...capability];
        let idx = cap.indexOf('ipv6');
        if (-1 !== idx) {
            cap.splice(idx, 1);
            family = 'ipv6';
        }
        else {
            idx = cap.indexOf('ipv4');
            if (-1 !== idx) {
                cap.splice(idx, 1);
            }
        }
        assert_1.default.ok(-1 !== ['dtls', 'udp'].indexOf(cap[0]), 'capability must be from the set ipv6, ipv4, dtls, udp');
        return 'address' in this.sip[family][cap[0]];
    }
    api(command, callback) {
        assert_1.default.strictEqual(typeof command, 'string', "'command' must be a valid freeswitch api command");
        const __x = (cb) => {
            this.conn.api(command, (res) => {
                cb(res.getBody());
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve) => {
            __x((body) => {
                resolve(body);
            });
        });
    }
    createEndpoint(opts, callback) {
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.customEvents = this._mrf.customEvents;
        opts.is3pcc = !opts.remoteSdp;
        if (!opts.is3pcc && opts.codecs) {
            if (typeof opts.codecs === 'string')
                opts.codecs = [opts.codecs];
            opts.remoteSdp = (0, utils_1.modifySdpCodecOrder)(opts.remoteSdp, opts.codecs);
        }
        else if (opts.is3pcc && opts.srtp === true) {
            opts.headers['X-Secure-RTP'] = true;
        }
        const family = opts.family || 'ipv4';
        const proto = opts.dtls ? 'dtls' : 'udp';
        assert_1.default.ok(opts.is3pcc || !requiresDtlsHandshake(opts.remoteSdp), 'Mediaserver#createEndpoint() can not be called with a remote sdp requiring a dtls handshake; ' +
            'use Mediaserver#connectCaller() instead, as this allows the necessary handshake');
        const __x = async (cb) => {
            if (!this.connected()) {
                return process.nextTick(() => {
                    cb(new Error('too early: mediaserver is not connected'));
                });
            }
            if (!this.sip[family][proto].address) {
                return process.nextTick(() => {
                    cb(new Error('too early: mediaserver is not ready'));
                });
            }
            const timeoutFn = (dialog, uuid) => {
                this.pendingConnections.delete(uuid);
                dialog.destroy();
                debug(`MediaServer#createEndpoint - connection timeout for ${uuid}`);
                cb(new Error('Connection timeout'));
            };
            let uri;
            const uuid = (0, crypto_1.randomUUID)();
            const hasDtls = opts.dtls && this.hasCapability([family, 'dtls']);
            if (hasDtls) {
                uri = `sips:drachtio@${this.sip[family]['dtls'].address};transport=tls`;
            }
            else {
                uri = `sip:drachtio@${this.sip[family]['udp'].address}`;
            }
            debug(`MediaServer#createEndpoint: sending ${opts.is3pcc ? '3ppc' : ''} INVITE to uri ${uri} with id ${uuid}`);
            const produceEndpoint = (dialog, conn) => {
                debug(`MediaServer#createEndpoint - produceEndpoint for ${uuid}`);
                const endpoint = new endpoint_1.default(conn, dialog, this, opts);
                endpoint.once('ready', () => {
                    debug(`MediaServer#createEndpoint - returning endpoint for uuid ${uuid}`);
                    cb(null, endpoint);
                });
            };
            this.pendingConnections.set(uuid, {});
            try {
                const dlg = await this.srf.createUAC(uri, {
                    headers: {
                        ...opts.headers,
                        'User-Agent': `drachtio-fsmrf:${uuid}`,
                        'X-esl-outbound': `${this.advertisedAddress}:${this.advertisedPort}`
                    },
                    localSdp: opts.remoteSdp
                });
                debug(`MediaServer#createEndpoint - createUAC produced dialog for ${uuid}`);
                const obj = this.pendingConnections.get(uuid);
                if (!obj)
                    return;
                obj.dialog = dlg;
                if (obj.conn) {
                    this.pendingConnections.delete(uuid);
                    produceEndpoint.bind(this)(obj.dialog, obj.conn);
                }
                else {
                    obj.connTimeout = setTimeout(timeoutFn.bind(this, dlg, uuid), 4000);
                    obj.fn = produceEndpoint.bind(this, obj.dialog);
                }
            }
            catch (err) {
                debug(`MediaServer#createEndpoint - createUAC returned error for ${uuid}`);
                this.pendingConnections.delete(uuid);
                cb(err);
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, endpoint) => {
                if (err)
                    return reject(err);
                resolve(endpoint);
            });
        });
    }
    connectCaller(req, res, opts, callback) {
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        opts = opts || {};
        const __x = async (cb) => {
            if (!requiresDtlsHandshake(req.body)) {
                try {
                    const endpoint = await this.createEndpoint({
                        ...opts,
                        remoteSdp: opts.remoteSdp || req.body,
                        codecs: opts.codecs
                    });
                    const dialog = await this.srf.createUAS(req, res, {
                        localSdp: endpoint.local?.sdp,
                        headers: opts.headers
                    });
                    cb(null, { endpoint, dialog });
                }
                catch (err) {
                    cb(err);
                }
            }
            else {
                const pair = {};
                const uuid = (0, crypto_1.randomUUID)();
                const family = opts.family || 'ipv4';
                const uri = `sip:drachtio@${this.sip[family]['udp'].address}`;
                this.pendingConnections.set(uuid, {});
                const produceEndpoint = (dialog, conn) => {
                    debug(`MediaServer#connectCaller - (srtp scenario) produceEndpoint for ${uuid}`);
                    const endpoint = new endpoint_1.default(conn, dialog, this, opts);
                    endpoint.once('ready', () => {
                        debug(`MediaServer#createEndpoint - (srtp scenario) returning endpoint for uuid ${uuid}`);
                        pair.endpoint = endpoint;
                        if (pair.dialog)
                            cb(null, pair);
                    });
                };
                const timeoutFn = (dialog, _uuid) => {
                    this.pendingConnections.delete(_uuid);
                    dialog.destroy();
                    if (pair.dialog)
                        pair.dialog.destroy();
                    debug(`MediaServer#createEndpoint - (srtp scenario) connection timeout for ${_uuid}`);
                    cb(new Error('Connection timeout'));
                };
                this.srf.createUAC(uri, {
                    headers: {
                        ...opts.headers,
                        'User-Agent': `drachtio-fsmrf:${uuid}`,
                        'X-esl-outbound': `${this.advertisedAddress}:${this.advertisedPort}`
                    },
                    localSdp: req.body
                }, {}, (err, dlg) => {
                    if (err) {
                        debug(`MediaServer#connectCaller - createUAC returned error for ${uuid}`);
                        this.pendingConnections.delete(uuid);
                        return cb(err);
                    }
                    debug('MediaServer#connectCaller - createUAC (srtp scenario) produced dialog for %s: %O', uuid, dlg);
                    const obj = this.pendingConnections.get(uuid);
                    if (!obj)
                        return;
                    obj.dialog = dlg;
                    obj.connTimeout = setTimeout(timeoutFn.bind(this, dlg, uuid), 4000);
                    obj.fn = produceEndpoint.bind(this, obj.dialog);
                    this.srf.createUAS(req, res, {
                        localSdp: dlg.remote.sdp,
                        headers: opts.headers
                    }, (err2, dialog) => {
                        if (err2) {
                            debug(`MediaServer#connectCaller - createUAS returned error for ${uuid}`);
                            this.pendingConnections.delete(uuid);
                            return cb(err2);
                        }
                        pair.dialog = dialog;
                        if (pair.endpoint)
                            cb(null, pair);
                    });
                });
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, pair) => {
                if (err)
                    return reject(err);
                resolve(pair);
            });
        });
    }
    createConference(...args) {
        let name;
        let opts = {};
        let callback;
        let generateConfName = false;
        if (args.length === 0) {
            name = `anon-${(0, crypto_1.randomUUID)()}`;
            generateConfName = true;
        }
        else if (args.length === 1) {
            if (typeof args[0] === 'function') {
                callback = args[0];
                name = `anon-${(0, crypto_1.randomUUID)()}`;
                generateConfName = true;
            }
            else if (typeof args[0] === 'string') {
                name = args[0];
            }
            else {
                opts = args[0];
                name = `anon-${(0, crypto_1.randomUUID)()}`;
                generateConfName = true;
            }
        }
        else if (args.length === 2) {
            if (typeof args[0] === 'string' && typeof args[1] === 'function') {
                name = args[0];
                callback = args[1];
            }
            else if (typeof args[0] === 'string' && typeof args[1] === 'object') {
                name = args[0];
                opts = args[1];
            }
            else {
                opts = args[0];
                callback = args[1];
                name = `anon-${(0, crypto_1.randomUUID)()}`;
                generateConfName = true;
            }
        }
        else {
            name = args[0];
            opts = args[1];
            callback = args[2];
        }
        assert_1.default.strictEqual(typeof name, 'string', "'name' is a required parameter");
        assert_1.default.ok(typeof opts === 'object', 'opts param must be an object');
        const verifyConfDoesNotExist = (confName) => {
            return new Promise((resolve, reject) => {
                this.api(`conference ${confName} list count`, (result) => {
                    debug(`return from conference list: ${result}`);
                    if (typeof result === 'string' &&
                        (result.match(/^No active conferences/) || result.match(/Conference.*not found/))) {
                        return resolve();
                    }
                    reject(new Error('conference exists'));
                });
            });
        };
        const __x = async (cb) => {
            try {
                if (!generateConfName)
                    await verifyConfDoesNotExist(name);
                const endpoint = await this.createEndpoint();
                opts.flags = { ...opts.flags, endconf: true, mute: true, vmute: true };
                const { confUuid } = await endpoint.join(name, opts);
                const conference = new conference_1.default(name, confUuid, endpoint, opts);
                debug(`MediaServer#createConference: created conference ${name}:${confUuid}`);
                console.log(`MediaServer#createConference: created conference ${name}:${confUuid}`);
                cb(null, conference);
            }
            catch (err) {
                console.log({ err }, 'mediaServer:createConference - error');
                cb(err);
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, conference) => {
                if (err)
                    return reject(err);
                resolve(conference);
            });
        });
    }
    toJSON() {
        return (0, utils_1.pick)(this, 'sip maxSessions currentSessions cps cpuIdle fsVersion hostname v4address pendingConnections');
    }
    _onError(err) {
        debug(`Mediaserver#_onError: got error from freeswitch connection, attempting reconnect: ${err}`);
    }
    _onHeartbeat(evt) {
        this.maxSessions = parseInt(evt.getHeader('Max-Sessions'), 10);
        this.currentSessions = parseInt(evt.getHeader('Session-Count'), 10);
        this.cps = parseInt(evt.getHeader('Session-Per-Sec'), 10);
        this.hostname = evt.getHeader('FreeSWITCH-Hostname');
        this.v4address = evt.getHeader('FreeSWITCH-IPv4');
        this.v6address = evt.getHeader('FreeSWITCH-IPv6');
        this.fsVersion = evt.getHeader('FreeSWITCH-Version');
        this.cpuIdle = parseFloat(evt.getHeader('Idle-CPU'));
    }
    _onCreateTimeout(uuid) {
        if (!this.pendingConnections.has(uuid)) {
            console.error(`MediaServer#_onCreateTimeout: uuid not found: ${uuid}`);
            return;
        }
        const obj = this.pendingConnections.get(uuid);
        if (!obj)
            return;
        if (obj.callback)
            obj.callback(new Error('Connection timeout'));
        if (obj.createTimeout)
            clearTimeout(obj.createTimeout);
        this.pendingConnections.delete(uuid);
    }
    _onNewCall(conn, id) {
        const userAgent = conn.getInfo().getHeader('variable_sip_user_agent');
        const results = RE_USER_AGENT.exec(userAgent);
        if (null === results) {
            console.error(`received INVITE without drachtio-fsmrf header, unexpected User-Agent: ${userAgent}`);
            return conn.execute('hangup', 'NO_ROUTE_DESTINATION');
        }
        const uuid = results[1];
        if (!uuid || !this.pendingConnections.has(uuid)) {
            console.error(`received INVITE with unknown uuid: ${uuid}`);
            return conn.execute('hangup', 'NO_ROUTE_DESTINATION');
        }
        const obj = this.pendingConnections.get(uuid);
        if (!obj)
            return;
        if (obj.fn) {
            obj.fn(conn);
            if (obj.connTimeout)
                clearTimeout(obj.connTimeout);
            this.pendingConnections.delete(uuid);
        }
        else {
            obj.conn = conn;
        }
        const count = this._server ? this._server.getCountOfConnections() : 0;
        const realUuid = conn.getInfo().getHeader('Channel-Unique-ID');
        debug(`MediaServer#_onNewCall: ${this.address} new connection id: ${id}, uuid: ${realUuid}, count is ${count}`);
        this.emit('channel::open', {
            uuid: realUuid,
            countOfConnections: count,
            countOfChannels: this.currentSessions
        });
    }
    _onConnectionClosed(conn, id) {
        let uuid;
        if (conn) {
            const info = conn.getInfo();
            if (info) {
                uuid = info.getHeader('Channel-Unique-ID');
            }
        }
        const count = this._server ? this._server.getCountOfConnections() : 0;
        debug(`MediaServer#_onConnectionClosed: connection id: ${id}, uuid: ${uuid}, count is ${count}`);
        this.emit('channel::close', {
            uuid,
            countOfConnections: count,
            countOfChannels: this.currentSessions
        });
    }
}
module.exports = MediaServer;
