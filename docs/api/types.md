# Types and Interfaces

The `drachtio-fsmrf` package leverages the `drachtio-srf` ecosystem alongside FreeSWITCH's Event Socket Library (via `drachtio-modesl`).

To ensure a cohesive developer experience, several foundational types and interfaces are exposed.

## Imported SRF Types

These are aliases derived from `drachtio-srf`:

- `Srf`: The main `drachtio-srf` instance.
- `SrfDialog`: Represents a SIP dialog.
- `SrfRequest`: Represents an incoming SIP Request (like `INVITE` or `BYE`).
- `SrfResponse`: Represents an outgoing SIP Response.

## FreeSWITCH ESL Types

### `EslEvent`

Represents an event object received natively from the FreeSWITCH Event Socket. 
It contains raw strings indicating SIP configurations, channel variables, metadata, or FreeSWITCH diagnostics.

#### Methods
- `getHeader(name: string): string`
  Retrieves the value of a specific header.
- `firstHeader(): string`
  Initializes reading headers and returns the first one.
- `nextHeader(): string`
  Retrieves the name of the next sequential header.
- `getBody(): string`
  Retrieves the body content of the event.

### `EslConnection`

Represents an active connection to the FreeSWITCH Event Socket, usually established as an outbound connection. 

This powers the `MediaServer` class and provides the core API hooks.

#### Key Methods
- `connected(): boolean`
  Checks if the connection is active.
- `disconnect(): void`
  Tears down the socket connection.
- `api(command: string, cb?: (res: EslEvent) => void): void`
  Executes a raw FreeSWITCH API command (e.g. `status`).
- `execute(app: string, arg?: string, cb?: (evt: EslEvent) => void): void`
  Executes a specific dialplan application (e.g. `playback`, `bridge`).
- `subscribe(events: string | string[]): void`
  Subscribes to Event Socket event types.
- `filter(header: string, value: string): void`
  Applies an event filter to only listen for matching events.

### `EslServer`

Represents the local server listening for incoming connections from FreeSWITCH's "outbound" event socket connections.

#### Key Methods
- `close(): void`
  Closes the server and rejects new socket connections.
- `getCountOfConnections(): number`
  Returns the number of active established endpoints.

## Package-Specific Enum Types

### Endpoint & Conference `State`
Internally, Endpoints and Conferences manage their lifecycles through enumerations indicating state. These are primarily used by internal listeners to reject premature operations.

1. `NOT_CONNECTED` or `NOT_CREATED`
2. `EARLY` (only used in SIP ringing scenarios before 200 OK)
3. `CONNECTED` or `CREATED`
4. `DISCONNECTED` or `DESTROYED`
