# MediaServer

The `MediaServer` class represents a live, active Event Socket connection to a FreeSWITCH server. Once established, you can use it to execute dialplan applications, monitor status, and most importantly, create [`Endpoints`](./endpoint.md) and [`Conferences`](./conference.md).

> Note: You should never instantiate `MediaServer` directly using `new MediaServer(...)`. Instead, use `mrf.connect(opts)` which resolves with a `MediaServer` instance.

## Class: `MediaServer`

This class extends `EventEmitter` and implements all lifecycle logic associated with a single FreeSWITCH Media Server.

### Properties

- `address` *(string)*: The remote IP address or hostname of the connected FreeSWITCH server.
- `hostname` *(string)*: The native hostname provided by FreeSWITCH.
- `conn` *(EslConnection)*: The underlying `drachtio-modesl` Event Socket connection.
- `srf` *(Srf)*: The core `drachtio-srf` application instance.
- `maxSessions` *(number)*: The maximum concurrent sessions allowed by FreeSWITCH.
- `currentSessions` *(number)*: The number of active sessions currently on the media server.
- `cps` *(number)*: Current Calls Per Second rate reported via heartbeats.
- `sip` *(object)*: Signalling addresses (IPv4/IPv6, UDP/DTLS) gathered during initialization from the FreeSWITCH configuration.
- `fsVersion` *(string)*: FreeSWITCH version string.
- `cpuIdle` *(number)*: FreeSWITCH idle CPU percentage (gathered via heartbeat).

### Methods

#### `connected(): boolean`

Checks whether the Event Socket connection to FreeSWITCH is currently active.

#### `disconnect()` (Alias: `destroy()`)

Gracefully tears down the connection to the media server, closing all sockets and releasing resources.

#### `hasCapability(capability: string | string[]): boolean`

Verifies whether the media server's configuration supports specific IP families or transport protocols based on what was gathered at startup.

**Parameters:**
- `capability` - The feature to check (e.g., `'ipv4'`, `'ipv6'`, `'dtls'`, `'udp'`). Can also be an array like `['ipv4', 'dtls']`.

**Example:**
```javascript
if (mediaserver.hasCapability('dtls')) {
  console.log('Secure media via DTLS is supported!');
}
```

#### `api(command: string): Promise<string>`

Sends a raw FreeSWITCH API command (e.g., `status`, `show channels`) and returns the text response.

**Example:**
```javascript
const response = await mediaserver.api('status');
console.log(response); // "UP 0 years, 0 days, ... "
```

#### `createEndpoint(opts?: EndpointOptions): Promise<Endpoint>`

Sends a Third-Party Call Control (3PCC) SIP `INVITE` from the FreeSWITCH media server to create a local channel. This is often used for bridging calls, outbound dialing, or setting up a standalone leg for recording/playback.

**Parameters:**
- `opts`: Options for the endpoint.

| Option | Type | Description |
|---|---|---|
| `remoteSdp` | `string` | The remote SDP to offer to the FreeSWITCH media server. |
| `codecs` | `string` \| `string[]` | Restricts the SDP offer to specific codecs in priority order. |
| `headers` | `object` | Custom SIP headers to include in the INVITE sent to FreeSWITCH. |
| `dtls` | `boolean` | If true, establish the session using DTLS-SRTP. |
| `is3pcc` | `boolean` | Indicates if this is 3PCC (auto-calculated based on remote SDP). |

**Returns:**
A Promise resolving to an [`Endpoint`](./endpoint.md).

**Example:**
```javascript
const endpoint = await mediaserver.createEndpoint({
  remoteSdp: callerSdp,
  codecs: ['PCMU', 'PCMA']
});
console.log('Created outbound channel: ', endpoint.uuid);
```

#### `connectCaller(req: SrfRequest, res: SrfResponse, opts?: EndpointOptions): Promise<{ endpoint: Endpoint, dialog: SrfDialog }>`

A convenience method specifically designed to process an incoming SIP call from `drachtio-srf`. It manages creating the media server endpoint, generating the local SDP answer, and successfully returning the `200 OK` SIP response to the calling party.

**Parameters:**
- `req`: The incoming SIP `INVITE` request.
- `res`: The outgoing SIP response to the caller.
- `opts` *(optional)*: Endpoint configuration options.

**Returns:**
An object containing both the newly created `Endpoint` and the `SrfDialog`.

**Example:**
```javascript
srf.invite((req, res) => {
  mediaserver.connectCaller(req, res, {
    codecs: 'PCMU'
  }).then(({ endpoint, dialog }) => {
    console.log('Caller is connected to FreeSWITCH');
    
    // Perform media operations
    endpoint.play('ivr/8000/ivr-welcome.wav');
  }).catch((err) => {
    console.error('Error connecting caller:', err);
    res.send(500, 'Server Internal Error');
  });
});
```

#### `createConference(name: string, opts?: ConferenceCreateOptions): Promise<Conference>`

Creates a new [`Conference`](./conference.md) room on the media server where multiple endpoints can join and interact.

**Parameters:**
- `name`: An optional name for the conference room. If omitted, a random UUID will be generated.
- `opts` *(optional)*: Options such as FreeSWITCH profile, flags, PINs, and member limits.

| Option | Type | Description |
|---|---|---|
| `pin` | `string` | A numeric PIN required for users to enter the conference. |
| `profile` | `string` | The FreeSWITCH conference profile (from `conference.conf.xml`). |
| `maxMembers` | `number` | The hard limit on concurrent participants. |
| `flags` | `object` | Boolean flags enabling specialized behaviors (`mute`, `vmute`, `videoBridgeFirstTwo`, `endconf`, etc.). |

**Example:**
```javascript
const conf = await mediaserver.createConference('support-room', {
  maxMembers: 10,
  flags: {
    videoBridgeFirstTwo: true,
    endconf: true // kill conference when last member leaves
  }
});
console.log('Conference created:', conf.name);
```

### Events

- **`connect`**: Emitted when the underlying outbound event socket server connects to FreeSWITCH.
- **`ready`**: Emitted when the media server has fully initialized its network layout and is ready to process calls.
- **`error`**: Emitted when there is a connection issue.
- **`end`**: Emitted when the connection is severed gracefully.
- **`channel::open`**: Emitted whenever a new channel successfully spawns on the server.
- **`channel::close`**: Emitted when a channel terminates.
