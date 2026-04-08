# MRF (Media Resource Function)

The `Mrf` class is the main entry point for the `drachtio-fsmrf` framework. It represents a Media Resource Function manager that coordinates with the `drachtio-srf` framework to manage connections to one or more FreeSWITCH media servers.

## Installation & Basic Usage

```javascript
const Srf = require('drachtio-srf');
const Mrf = require('drachtio-fsmrf');

// Initialize drachtio-srf
const srf = new Srf();
srf.connect({ host: '127.0.0.1', port: 9022, secret: 'cymru' });

// Initialize MRF
const mrf = new Mrf(srf);

// Connect to a FreeSWITCH Event Socket
mrf.connect({
  address: '127.0.0.1',
  port: 8021,
  secret: 'ClueCon'
}).then((mediaserver) => {
  console.log('successfully connected to media server');
}).catch((err) => {
  console.error('failed to connect to media server:', err);
});
```

## Class: `Mrf`

### Constructor

```typescript
new Mrf(srf: Srf, opts?: Mrf.CreateOptions)
```

**Parameters:**
- `srf` - The active `drachtio-srf` application instance.
- `opts` *(optional)* - Configuration options.

#### `Mrf.CreateOptions`

| Property | Type | Description |
|---|---|---|
| `debugDir` | `string` | Directory to write debug SIP captures to. |
| `sendonly` | `boolean` | If true, generate send-only SDPs for debugging purposes. |
| `customEvents` | `string[]` | Array of custom FreeSWITCH events to subscribe to. |

### Properties

- `srf`: Returns the underlying `drachtio-srf` instance.
- `localAddresses`: List of automatically detected local IPv4 addresses used for the outbound Event Socket server.
- `customEvents`: Array of custom events configured to be monitored.
- `debugDir`: Configured directory for debugging.

### Methods

#### `connect(opts: ConnectOptions): Promise<MediaServer>`

Connects to a FreeSWITCH media server's Event Socket listener.

**Parameters:**
- `opts`: The connection options.

| Property | Type | Description |
|---|---|---|
| `address` | `string` | The IP address or hostname of the FreeSWITCH Event Socket. |
| `port` | `number` | The Event Socket port (default: `8021`). |
| `secret` | `string` | The Event Socket password (default: `'ClueCon'`). |
| `listenAddress` | `string` | Local IP address to listen on for inbound connections from FreeSWITCH (default: auto-detected). |
| `listenPort` | `number` | Local port to listen on for inbound connections (default: `0` for random available port). |
| `advertisedAddress` | `string` | Advertised IP address for the Event Socket outbound server (useful if running behind NAT). |
| `advertisedPort` | `number` | Advertised port for the Event Socket outbound server. |
| `profile` | `string` | The FreeSWITCH SIP profile to use for media legs (default: `'drachtio_mrf'`). |

**Returns:**
A `Promise` resolving to a [`MediaServer`](./mediaserver.md) instance. Alternatively, a callback function can be provided as the second argument.

**Example:**
```javascript
try {
  const ms = await mrf.connect({
    address: '10.10.100.1',
    port: 8021,
    secret: 'ClueCon',
    listenAddress: '10.10.100.2',
    profile: 'internal'
  });
  console.log('Media server is ready for action!');
} catch (err) {
  console.error('Connection failed:', err);
}
```

## Exposed Classes & Utilities

For convenience, the `Mrf` class also exposes the core components of the framework:

- `Mrf.Endpoint` - The [`Endpoint`](./endpoint.md) class.
- `Mrf.MediaServer` - The [`MediaServer`](./mediaserver.md) class.
- `Mrf.Conference` - The [`Conference`](./conference.md) class.
- `Mrf.utils` - Assorted utilities (`parseBodyText`, etc.).
