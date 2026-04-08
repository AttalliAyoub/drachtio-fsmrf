import { EslConnection, EslEvent, EslServer, Srf, SrfDialog, SrfRequest, SrfResponse } from "./types";
import esl from 'drachtio-modesl';
import assert from 'assert';
import { EventEmitter } from 'events';
import { randomUUID as generateUuid } from 'crypto';
import Endpoint from './endpoint';
import Conference from './conference';
import net from 'net';
import { modifySdpCodecOrder, pick } from './utils';
import createDebug from 'debug';
import Mrf = require('./mrf');

const debug = createDebug('drachtio:fsmrf');

const RE_DTLS = /m=audio.*SAVP/;
const RE_USER_AGENT = /^drachtio-fsmrf:(.+)$/;

/**
 * Checks whether an SDP string requires a DTLS handshake (i.e. contains SAVP).
 * @param sdp - The Session Description Protocol string
 * @returns true if DTLS handshake is required
 */
function requiresDtlsHandshake(sdp: string): boolean {
  return RE_DTLS.test(sdp);
}

namespace MediaServer {
  /**
   * Options for creating a Conference on the media server.
   */
  export interface ConferenceCreateOptions {
    /** An optional PIN code required to join the conference. */
    pin?: string;
    /** The FreeSWITCH conference profile to use. */
    profile?: string;
    /** Specific FreeSWITCH conference flags to set. */
    flags?: {
      waitMod?: boolean;
      audioAlways?: boolean;
      videoBridgeFirstTwo?: boolean;
      videoMuxingPersonalCanvas?: boolean;
      videoRequiredForCanvas?: boolean;
      endconf?: boolean;
      mute?: boolean;
      vmute?: boolean;
      [key: string]: boolean | undefined;
    };
    /** Maximum number of members allowed in the conference. */
    maxMembers?: number;
  }

  /**
   * Options for creating a MediaServer Endpoint.
   */
  export interface EndpointOptions {
    /** The remote SDP to offer to the FreeSWITCH media server. */
    remoteSdp?: string;
    /** A single codec or an array of codecs to restrict the SDP offer to. */
    codecs?: string[] | string;
    /** Custom SIP headers to include in the INVITE sent to FreeSWITCH. */
    headers?: Record<string, string | boolean>;
    /** Custom FreeSWITCH events to subscribe to for this endpoint. */
    customEvents?: string[];
    /** Whether this is a Third-Party Call Control (3PCC) scenario. */
    is3pcc?: boolean;
    /** If true, indicates SRTP is required. */
    srtp?: boolean;
    /** The IP family to use, 'ipv4' or 'ipv6'. */
    family?: 'ipv4' | 'ipv6';
    /** If true, use DTLS-SRTP. */
    dtls?: boolean;
    /** An AbortSignal to cancel the endpoint creation process. */
    signal?: AbortSignal;
    [key: string]: unknown;
  }

  export type CreateEndpointCallback = (err: Error | null, endpoint?: Endpoint) => void;
  export type CreateConferenceCallback = (err: Error | null, conference?: Conference) => void;
  export type ApiCallback = (response: string) => void;
  export type ConnectCallerCallback = (err: Error | null, result?: { endpoint?: Endpoint; dialog?: SrfDialog }) => void;
  export interface PendingConnection { dialog?: SrfDialog; conn?: EslConnection; connTimeout?: NodeJS.Timeout; fn?: (...args: any[]) => void; createTimeout?: NodeJS.Timeout; callback?: (...args: any[]) => void; }
}

namespace MediaServer {
  export interface Events {
    /** Emitted when the outbound event socket server connects. */
    'connect': () => void;
    /** Emitted when the media server has fully initialized and is ready to accept requests. */
    'ready': () => void;
    /** Emitted when an error occurs with the media server connection. */
    'error': (err: Error) => void;
    /** Emitted when the connection to the media server ends. */
    'end': () => void;
    /** Emitted when a new channel (endpoint) is successfully opened. */
    'channel::open': (args: { uuid: string; countOfConnections: number; countOfChannels: number }) => void;
    /** Emitted when an existing channel is closed. */
    'channel::close': (args: { uuid: string | undefined; countOfConnections: number; countOfChannels: number }) => void;
  }
}

declare interface MediaServer {
  on<U extends keyof MediaServer.Events>(event: U, listener: MediaServer.Events[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once<U extends keyof MediaServer.Events>(event: U, listener: MediaServer.Events[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  off<U extends keyof MediaServer.Events>(event: U, listener: MediaServer.Events[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;

  emit<U extends keyof MediaServer.Events>(event: U, ...args: Parameters<MediaServer.Events[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}

/**
 * Represents a connection to a FreeSWITCH Media Server.
 * Provides methods for executing API commands, creating endpoints (calls to the media server),
 * and managing conferences.
 */
class MediaServer extends EventEmitter {
  private _conn: EslConnection;
  private _mrf: Mrf;
  private _srf: Srf;
  
  /** Map of pending connections waiting for FreeSWITCH outbound event socket callbacks. */
  public pendingConnections: Map<string, MediaServer.PendingConnection>;
  private _isMediaServerReady: boolean;
  
  /** Maximum number of concurrent sessions the media server is configured to handle. */
  public maxSessions: number;
  /** Current number of active sessions on the media server. */
  public currentSessions: number;
  /** Current calls per second (CPS) rate on the media server. */
  public cps: number;
  
  /** Signalling addresses (IPv4/IPv6, UDP/DTLS) gathered from FreeSWITCH configuration. */
  public sip: {
    ipv4: { udp: { address?: string }; dtls: { address?: string } };
    ipv6: { udp: { address?: string }; dtls: { address?: string } };
  };
  
  private _address: string;
  private closing?: boolean;
  /** The local IP address the Event Socket outbound server is listening on. */
  public listenAddress?: string;
  /** The local port the Event Socket outbound server is listening on. */
  public listenPort?: number;
  /** The IP address advertised to FreeSWITCH for outbound event socket connections. */
  public advertisedAddress?: string;
  /** The port advertised to FreeSWITCH for outbound event socket connections. */
  public advertisedPort?: number;
  
  private _server?: EslServer;
  
  /** Hostname of the connected FreeSWITCH server. */
  public hostname?: string;
  /** IPv4 address of the FreeSWITCH server. */
  public v4address?: string;
  /** IPv6 address of the FreeSWITCH server. */
  public v6address?: string;
  /** FreeSWITCH version string. */
  public fsVersion?: string;
  /** FreeSWITCH idle CPU percentage. */
  public cpuIdle?: number;

  /**
   * Internal constructor for MediaServer.
   * Do not instantiate this directly; instead, use `Mrf#connect()`.
   * @internal
   */
  constructor(
    conn: EslConnection,
    mrf: Mrf,
    listenAddress: string,
    listenPort: number,
    advertisedAddress?: string,
    advertisedPort?: number,
    profile?: string
  ) {
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
        if (this.conn) this.conn.disconnect();
        if (this._server) this._server.close();
        this.emit('error', new Error('MediaServer not ready, timeout waiting for connection to freeswitch'));
      }
    }, 1000);

    const server = net.createServer();
    server.listen(listenPort, listenAddress, () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        this.listenAddress = addr.address;
        this.listenPort = addr.port;
      }
      this.advertisedAddress = advertisedAddress || this.listenAddress;
      this.advertisedPort = advertisedPort || this.listenPort;
      debug(`listening on ${listenAddress}:${listenPort}, advertising ${this.advertisedAddress}:${this.advertisedPort}`);

      this._server = new esl.Server({ server: server, myevents: false }, () => {
        this.emit('connect');

        this._conn.api('sofia status', (res: EslEvent) => {
          const status = res.getBody();
          let re = new RegExp(`^\\s*${profile}\\s.*sip:mod_sofia@((?:[0-9]{1,3}\\.){3}[0-9]{1,3}:\\d+)`, 'm');
          let results = re.exec(status);
          if (null === results) throw new Error(`No ${profile} sip profile found on the media server: ${status}`);
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

      this._server!.on('connection::ready', this._onNewCall.bind(this));
      this._server!.on('connection::close', this._onConnectionClosed.bind(this));
    });
  }

  /** Gets the remote IP address of the connected FreeSWITCH server. */
  get address() {
    return this._address;
  }

  /** Gets the internal FreeSWITCH Event Socket listener connection. */
  get conn() {
    return this._conn;
  }

  /** Gets the underlying drachtio-srf instance. */
  get srf() {
    return this._srf;
  }

  /** 
   * Checks if the Event Socket connection to FreeSWITCH is currently active. 
   * @returns true if connected, false otherwise
   */
  connected(): boolean {
    return this._conn ? this._conn.connected() : false;
  }

  /** 
   * Gracefully disconnects the media server, closing all sockets and releasing resources.
   */
  disconnect() {
    debug(`Mediaserver#disconnect - closing connection to ${this.address}`);
    this.closing = true;
    if (this._server) this._server.close();
    if (this.conn) {
      this.conn.removeAllListeners();
      this.conn.disconnect();
    }
  }

  /** 
   * Alias for `disconnect()`. Destroys the media server connection.
   */
  destroy() {
    return this.disconnect();
  }

  /**
   * Checks if the media server has a specific capability based on its SIP configurations.
   * @param capability - A string or array of strings representing the capability to check (e.g., 'ipv4', 'ipv6', 'dtls', 'udp').
   * @returns true if the capability is supported.
   */
  hasCapability(capability: string | string[]): boolean {
    let family: 'ipv4' | 'ipv6' = 'ipv4';
    const cap = typeof capability === 'string' ? [capability] : [...capability];
    let idx = cap.indexOf('ipv6');
    if (-1 !== idx) {
      cap.splice(idx, 1);
      family = 'ipv6';
    } else {
      idx = cap.indexOf('ipv4');
      if (-1 !== idx) {
        cap.splice(idx, 1);
      }
    }
    assert.ok(-1 !== ['dtls', 'udp'].indexOf(cap[0]), 'capability must be from the set ipv6, ipv4, dtls, udp');

    return 'address' in this.sip[family][cap[0] as 'udp' | 'dtls'];
  }

  /**
   * Sends a FreeSWITCH API command and retrieves the response.
   * @param command - The FreeSWITCH API command to execute (e.g., 'status', 'show channels').
   * @returns A Promise resolving to the command output string.
   */
  api(command: string): Promise<string>;
  
  /**
   * Sends a FreeSWITCH API command and invokes the callback with the response.
   * @param command - The FreeSWITCH API command to execute.
   * @param callback - The callback receiving the response string.
   */
  api(command: string, callback: MediaServer.ApiCallback): this;
  api(command: string, callback?: MediaServer.ApiCallback): Promise<string> | this {
    assert.strictEqual(typeof command, 'string', "'command' must be a valid freeswitch api command");

    const __x = (cb: MediaServer.ApiCallback) => {
      this.conn.api(command, (res: EslEvent) => {
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

  /**
   * Creates an Endpoint (a SIP leg pointing to the media server).
   * Used for establishing media sessions such as IVR prompts, bridging, or recordings.
   * 
   * @param opts - Options configuring the endpoint (e.g., remote SDP, codecs).
   * @returns A Promise resolving to an Endpoint instance.
   */
  createEndpoint(opts?: MediaServer.EndpointOptions): Promise<Endpoint>;
  
  /**
   * Creates an Endpoint (a SIP leg pointing to the media server) using a callback.
   * 
   * @param opts - Options configuring the endpoint.
   * @param callback - Callback invoked when the endpoint is created.
   */
  createEndpoint(opts: MediaServer.EndpointOptions, callback: MediaServer.CreateEndpointCallback): this;
  createEndpoint(callback: MediaServer.CreateEndpointCallback): this;
  createEndpoint(opts?: MediaServer.EndpointOptions | MediaServer.CreateEndpointCallback, callback?: MediaServer.CreateEndpointCallback): Promise<Endpoint> | this {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};

    opts.headers = opts.headers || {};
    opts.customEvents = this._mrf.customEvents;

    opts.is3pcc = !opts.remoteSdp;
    if (!opts.is3pcc && opts.codecs) {
      if (typeof opts.codecs === 'string') opts.codecs = [opts.codecs];
      opts.remoteSdp = modifySdpCodecOrder(opts.remoteSdp as string, opts.codecs);
    } else if (opts.is3pcc && opts.srtp === true) {
      opts.headers['X-Secure-RTP'] = true;
    }

    const family = opts.family || 'ipv4';
    const proto = opts.dtls ? 'dtls' : 'udp';

    assert.ok(
      opts.is3pcc || !requiresDtlsHandshake(opts.remoteSdp as string),
      'Mediaserver#createEndpoint() can not be called with a remote sdp requiring a dtls handshake; ' +
      'use Mediaserver#connectCaller() instead, as this allows the necessary handshake'
    );

    const __x = async (cb: MediaServer.CreateEndpointCallback) => {
      const uuid = generateUuid();

      const done = (err: Error | null, endpoint?: Endpoint) => {
        if (opts.signal) {
          opts.signal.removeEventListener('abort', onAbort);
        }
        cb(err, endpoint);
      };

      const onAbort = () => {
        debug(`MediaServer#createEndpoint - aborted for uuid ${uuid}`);
        const obj = this.pendingConnections.get(uuid);
        if (obj) {
          if (obj.connTimeout) clearTimeout(obj.connTimeout);
          if (obj.dialog) obj.dialog.destroy();
          this.pendingConnections.delete(uuid);
        }
        const err = new Error('AbortError');
        err.name = 'AbortError';
        done(err);
      };

      if (opts.signal) {
        if (opts.signal.aborted) {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          return process.nextTick(() => done(err));
        }
        opts.signal.addEventListener('abort', onAbort);
      }

      if (!this.connected()) {
        return process.nextTick(() => {
          done(new Error('too early: mediaserver is not connected'));
        });
      }
      if (!this.sip[family as 'ipv4' | 'ipv6'][proto as 'dtls' | 'udp'].address) {
        return process.nextTick(() => {
          done(new Error('too early: mediaserver is not ready'));
        });
      }

      const timeoutFn = (dialog: SrfDialog, uuid: string) => {
        this.pendingConnections.delete(uuid);
        dialog.destroy();
        debug(`MediaServer#createEndpoint - connection timeout for ${uuid}`);
        done(new Error('Connection timeout'));
      };

      let uri: string;
      const hasDtls = opts.dtls && this.hasCapability([family, 'dtls']);
      if (hasDtls) {
        uri = `sips:drachtio@${this.sip[family as 'ipv4' | 'ipv6']['dtls'].address};transport=tls`;
      } else {
        uri = `sip:drachtio@${this.sip[family as 'ipv4' | 'ipv6']['udp'].address}`;
      }
      debug(`MediaServer#createEndpoint: sending ${opts.is3pcc ? '3ppc' : ''} INVITE to uri ${uri} with id ${uuid}`);

      const produceEndpoint = (dialog: SrfDialog, conn: EslConnection) => {
        debug(`MediaServer#createEndpoint - produceEndpoint for ${uuid}`);

        const endpoint = new Endpoint(conn, dialog, this, opts);
        endpoint.once('ready', () => {
          debug(`MediaServer#createEndpoint - returning endpoint for uuid ${uuid}`);
          done(null, endpoint);
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

        if (opts.signal && opts.signal.aborted) {
          dlg.destroy();
          return;
        }

        debug(`MediaServer#createEndpoint - createUAC produced dialog for ${uuid}`);
        const obj = this.pendingConnections.get(uuid); if (!obj) return;
        obj.dialog = dlg;
        if (obj.conn) {
          this.pendingConnections.delete(uuid);
          produceEndpoint.bind(this)(obj.dialog as SrfDialog, obj.conn);
        } else {
          obj.connTimeout = setTimeout(timeoutFn.bind(this, dlg as SrfDialog, uuid), 4000);
          obj.fn = produceEndpoint.bind(this, obj.dialog as SrfDialog);
        }
      } catch (err) {
        debug(`MediaServer#createEndpoint - createUAC returned error for ${uuid}`);
        this.pendingConnections.delete(uuid);
        done(err as Error);
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, endpoint) => {
        if (err) return reject(err);
        resolve(endpoint as Endpoint);
      });
    });
  }

  /**
   * Answers an incoming SIP request and connects the caller to the media server.
   * This handles creating the media server endpoint and replying to the caller's INVITE (UAS).
   * 
   * @param req - The incoming SIP request (INVITE) from drachtio.
   * @param res - The outgoing SIP response to the caller.
   * @param opts - Endpoint configuration options.
   * @returns A Promise resolving to an object containing the new Endpoint and the UAS SrfDialog.
   */
  connectCaller(req: SrfRequest, res: SrfResponse, opts?: MediaServer.EndpointOptions): Promise<{ endpoint: Endpoint; dialog: SrfDialog }>;
  
  /**
   * Answers an incoming SIP request and connects the caller to the media server using a callback.
   * 
   * @param req - The incoming SIP request.
   * @param res - The outgoing SIP response.
   * @param opts - Endpoint configuration options.
   * @param callback - Callback invoked when the connection is established.
   */
  connectCaller(req: SrfRequest, res: SrfResponse, opts: MediaServer.EndpointOptions, callback: MediaServer.ConnectCallerCallback): this;
  connectCaller(req: SrfRequest, res: SrfResponse, callback: MediaServer.ConnectCallerCallback): this;
  connectCaller(req: SrfRequest, res: SrfResponse, opts?: MediaServer.EndpointOptions | MediaServer.ConnectCallerCallback, callback?: MediaServer.ConnectCallerCallback): Promise<{ endpoint: Endpoint; dialog: SrfDialog }> | this {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};

    const __x = async (cb: MediaServer.ConnectCallerCallback) => {
      if (!requiresDtlsHandshake(req.body)) {
        try {
          const endpoint = await this.createEndpoint({
            ...opts,
            remoteSdp: opts.remoteSdp || req.body,
            codecs: opts.codecs
          });
          const dialog = await this.srf.createUAS(req, res, {
            localSdp: endpoint.local?.sdp,
            headers: opts.headers as Record<string, string | number | undefined>
          });
          cb(null, { endpoint, dialog });
        } catch (err) {
          cb(err as Error);
        }
      } else {
        const pair: { endpoint?: Endpoint; dialog?: SrfDialog } = {};
        const uuid = generateUuid();
        const family = opts.family || 'ipv4';
        const uri = `sip:drachtio@${this.sip[family as 'ipv4' | 'ipv6']['udp'].address}`;

        this.pendingConnections.set(uuid, {});

        const produceEndpoint = (dialog: SrfDialog, conn: EslConnection) => {
          debug(`MediaServer#connectCaller - (srtp scenario) produceEndpoint for ${uuid}`);

          const endpoint = new Endpoint(conn, dialog, this, opts);
          endpoint.once('ready', () => {
            debug(`MediaServer#createEndpoint - (srtp scenario) returning endpoint for uuid ${uuid}`);
            pair.endpoint = endpoint;
            if (pair.dialog) cb(null, pair);
          });
        };

        const timeoutFn = (dialog: SrfDialog, _uuid: string) => {
          this.pendingConnections.delete(_uuid);
          dialog.destroy();
          if (pair.dialog) pair.dialog.destroy();
          debug(`MediaServer#createEndpoint - (srtp scenario) connection timeout for ${_uuid}`);
          cb(new Error('Connection timeout'));
        };

        this.srf.createUAC(
          uri,
          {
            headers: {
              ...opts.headers,
              'User-Agent': `drachtio-fsmrf:${uuid}`,
              'X-esl-outbound': `${this.advertisedAddress}:${this.advertisedPort}`
            },
            localSdp: req.body
          },
          {},
          (err: Error | null, dlg?: SrfDialog) => {
            if (err) {
              debug(`MediaServer#connectCaller - createUAC returned error for ${uuid}`);
              this.pendingConnections.delete(uuid);
              return cb(err as Error);
            }
            debug('MediaServer#connectCaller - createUAC (srtp scenario) produced dialog for %s: %O', uuid, dlg);

            const obj = this.pendingConnections.get(uuid); if (!obj) return;
            obj.dialog = dlg;
            obj.connTimeout = setTimeout(timeoutFn.bind(this, dlg as SrfDialog, uuid), 4000);
            obj.fn = produceEndpoint.bind(this, obj.dialog as SrfDialog);

            this.srf.createUAS(
              req,
              res,
              {
                localSdp: (dlg as SrfDialog).remote.sdp,
                headers: opts.headers as Record<string, string | number | undefined>
              },
              (err2: Error | null, dialog: SrfDialog) => {
                if (err2) {
                  debug(`MediaServer#connectCaller - createUAS returned error for ${uuid}`);
                  this.pendingConnections.delete(uuid);
                  return cb(err2);
                }
                pair.dialog = dialog;
                if (pair.endpoint) cb(null, pair);
              }
            );
          }
        );
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, pair) => {
        if (err) return reject(err);
        resolve(pair as { endpoint: Endpoint; dialog: SrfDialog });
      });
    });
  }

  /**
   * Creates a Conference on the media server. 
   * A conference acts as a room where multiple endpoints can be bridged together.
   * 
   * @param name - An optional name for the conference. If omitted, a random UUID will be used.
   * @param opts - Options for creating the conference (e.g., flags, profile, maxMembers).
   * @returns A Promise resolving to a Conference instance.
   */
  createConference(name: string, opts?: MediaServer.ConferenceCreateOptions): Promise<Conference>;
  createConference(opts?: MediaServer.ConferenceCreateOptions): Promise<Conference>;
  
  /**
   * Creates a Conference using a callback.
   * 
   * @param name - The conference name.
   * @param opts - Options for the conference.
   * @param callback - The callback invoked with the new Conference instance.
   */
  createConference(name: string, opts: MediaServer.ConferenceCreateOptions, callback: MediaServer.CreateConferenceCallback): this;
  createConference(opts: MediaServer.ConferenceCreateOptions, callback: MediaServer.CreateConferenceCallback): this;
  createConference(name: string, callback: MediaServer.CreateConferenceCallback): this;
  createConference(callback: MediaServer.CreateConferenceCallback): this;
  createConference(...args: any[]): Promise<Conference> | this {
    let name: string;
    let opts: MediaServer.ConferenceCreateOptions = {};
    let callback: MediaServer.CreateConferenceCallback | undefined;

    let generateConfName = false;

    if (args.length === 0) {
      name = `anon-${generateUuid()}`;
      generateConfName = true;
    } else if (args.length === 1) {
      if (typeof args[0] === 'function') {
        callback = args[0];
        name = `anon-${generateUuid()}`;
        generateConfName = true;
      } else if (typeof args[0] === 'string') {
        name = args[0];
      } else {
        opts = args[0];
        name = `anon-${generateUuid()}`;
        generateConfName = true;
      }
    } else if (args.length === 2) {
      if (typeof args[0] === 'string' && typeof args[1] === 'function') {
        name = args[0];
        callback = args[1];
      } else if (typeof args[0] === 'string' && typeof args[1] === 'object') {
        name = args[0];
        opts = args[1];
      } else {
        opts = args[0];
        callback = args[1];
        name = `anon-${generateUuid()}`;
        generateConfName = true;
      }
    } else {
      name = args[0];
      opts = args[1];
      callback = args[2];
    }

    assert.strictEqual(typeof name, 'string', "'name' is a required parameter");
    assert.ok(typeof opts === 'object', 'opts param must be an object');

    const verifyConfDoesNotExist = (confName: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        this.api(`conference ${confName} list count`, (result: string) => {
          debug(`return from conference list: ${result}`);
          if (
            typeof result === 'string' &&
            (result.match(/^No active conferences/) || result.match(/Conference.*not found/))
          ) {
            return resolve();
          }
          reject(new Error('conference exists'));
        });
      });
    };

    const __x = async (cb: MediaServer.CreateConferenceCallback) => {
      try {
        if (!generateConfName) await verifyConfDoesNotExist(name);
        const endpoint = await this.createEndpoint();
        opts.flags = { ...opts.flags, endconf: true, mute: true, vmute: true };
        const { confUuid } = await (endpoint.join(name, opts) as Promise<{ confUuid: string }>);
        const conference = new Conference(name, confUuid, endpoint, opts as any);
        debug(`MediaServer#createConference: created conference ${name}:${confUuid}`);
        console.log(`MediaServer#createConference: created conference ${name}:${confUuid}`);
        cb(null, conference);
      } catch (err) {
        console.log({ err }, 'mediaServer:createConference - error');
        cb(err as Error);
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, conference) => {
        if (err) return reject(err);
        resolve(conference as Conference);
      });
    });
  }

  /**
   * Safely serializes the MediaServer properties to JSON, ignoring circular references.
   * @returns A partial representation of the MediaServer's state.
   */
  toJSON() {
    return pick(this, 'sip maxSessions currentSessions cps cpuIdle fsVersion hostname v4address pendingConnections');
  }

  private _onError(err: Error) {
    debug(`Mediaserver#_onError: got error from freeswitch connection, attempting reconnect: ${err}`);
  }

  private _onHeartbeat(evt: EslEvent) {
    this.maxSessions = parseInt(evt.getHeader('Max-Sessions'), 10);
    this.currentSessions = parseInt(evt.getHeader('Session-Count'), 10);
    this.cps = parseInt(evt.getHeader('Session-Per-Sec'), 10);
    this.hostname = evt.getHeader('FreeSWITCH-Hostname');
    this.v4address = evt.getHeader('FreeSWITCH-IPv4');
    this.v6address = evt.getHeader('FreeSWITCH-IPv6');
    this.fsVersion = evt.getHeader('FreeSWITCH-Version');
    this.cpuIdle = parseFloat(evt.getHeader('Idle-CPU'));
  }

  private _onCreateTimeout(uuid: string) {
    if (!this.pendingConnections.has(uuid)) {
      console.error(`MediaServer#_onCreateTimeout: uuid not found: ${uuid}`);
      return;
    }
    const obj = this.pendingConnections.get(uuid); if (!obj) return;
    if (obj.callback) obj.callback(new Error('Connection timeout'));
    if (obj.createTimeout) clearTimeout(obj.createTimeout);
    this.pendingConnections.delete(uuid);
  }

  private _onNewCall(conn: EslConnection, id: string) {
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
    const obj = this.pendingConnections.get(uuid); if (!obj) return;
    if (obj.fn) {
      obj.fn(conn);
      if (obj.connTimeout) clearTimeout(obj.connTimeout);
      this.pendingConnections.delete(uuid);
    } else {
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

  private _onConnectionClosed(conn: EslConnection, id: string) {
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

export = MediaServer;