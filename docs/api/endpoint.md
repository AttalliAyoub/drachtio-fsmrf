# Endpoint

The `Endpoint` class represents a single SIP media leg on the FreeSWITCH media server. It provides extensive media control operations such as playing files, speaking text, collecting DTMF, recording audio, joining conferences, and bridging to other endpoints.

> Note: `Endpoint` instances are created via [`MediaServer.createEndpoint()`](./mediaserver.md#createendpointopts-endpointoptions-promiseendpoint) or [`MediaServer.connectCaller()`](./mediaserver.md#connectcallerreq-srfrequest-res-srfresponse-opts-endpointoptions-promise-endpoint-endpoint-dialog-srfdialog-).

## Class: `Endpoint`

This class extends `EventEmitter` and manages all interaction with a specific channel UUID.

### Properties

- `uuid` *(string)*: The unique channel ID assigned by FreeSWITCH for this endpoint.
- `state` *(enum)*: The current state (`NOT_CONNECTED`, `EARLY`, `CONNECTED`, `DISCONNECTED`).
- `local` *(object)*: Details about the FreeSWITCH side (SDP string, IP, Port).
- `remote` *(object)*: Details about the far-end (SDP string, IP, Port).
- `sip` *(object)*: SIP-specific attributes (like `callId`).
- `conf` *(object)*: Contains `{ memberId, name, uuid }` if the endpoint is joined to a Conference.
- `secure` *(boolean)*: True if using DTLS-SRTP.
- `dtmfType` *(string)*: The negotiated DTMF payload type.
- `muted` *(boolean)*: True if the endpoint's read media stream is currently muted.

### Lifecycle Methods

#### `destroy(): Promise<void>`

Hangs up the call in FreeSWITCH and terminates the SIP dialog.

**Example:**
```javascript
setTimeout(() => {
  endpoint.destroy();
}, 30000);
```

#### `modify(newSdp: string): Promise<Record<string, string>>`

Modifies the media session using a new SDP string (triggers a re-INVITE on the SIP leg). Returns the updated channel variables upon successful negotiation.

### Media Playback & TTS Methods

#### `play(file: string | string[] | PlaybackOptions): Promise<PlaybackResults>`

Plays an audio or video file to the endpoint. Supported files depend on your FreeSWITCH configuration (e.g., WAV, MP3).

**Parameters:**
- `file`: Can be a single file path, an array of paths (played sequentially), or an options object.

| Option | Type | Description |
|---|---|---|
| `file` | `string` | The file path. |
| `seekOffset` | `number` | Time in samples/ms to skip before starting. |
| `timeoutSecs` | `number` | Maximum duration to play. |

**Returns:**
An object describing the playback results (e.g., `playbackSeconds`, `playbackMilliseconds`).

**Example:**
```javascript
const results = await endpoint.play('ivr/8000/ivr-welcome_to_freeswitch.wav');
console.log(`Played for ${results.playbackSeconds} seconds`);
```

#### `say(text: string, opts: object): Promise<PlaybackResults>`

Speaks text using a TTS engine via the built-in FreeSWITCH `say` application (for basic formatting like spelling numbers, dates, currency).

#### `speak(opts: object): Promise<PlaybackResults>`

Speaks text using advanced TTS engines (via the `speak` application or modules like `mod_flite`).

**Parameters:**
- `opts`: An object containing `ttsEngine`, `voice`, and `text`.

**Example:**
```javascript
await endpoint.speak({
  ttsEngine: 'flite',
  voice: 'kal',
  text: 'Hello, world!'
});
```

### Input & Collection Methods

#### `playCollect(opts: PlayCollectOptions): Promise<PlaybackResults>`

Plays a file while simultaneously collecting DTMF digits. Useful for IVR menus.

**Parameters:**
- `opts`: Configuration for playback and constraints.

| Option | Type | Description |
|---|---|---|
| `file` | `string` | The audio file to play. |
| `min` | `number` | Minimum digits to collect. |
| `max` | `number` | Maximum digits to collect. |
| `tries` | `number` | Number of attempts to play if input is invalid. |
| `timeout` | `number` | Overall timeout (ms). |
| `terminators` | `string` | Keys that complete input (e.g., `'#'`). |
| `regexp` | `string` | Regex to validate digits. |

**Returns:**
An object containing the collected `digits`, the `terminatorUsed`, and the playback statistics.

**Example:**
```javascript
const result = await endpoint.playCollect({
  file: 'ivr/8000/ivr-please_enter_pin_followed_by_pound.wav',
  min: 4,
  max: 6,
  terminators: '#',
  timeout: 10000
});

console.log(`User entered PIN: ${result.digits}`);
```

### Media Bridging & Conferencing

#### `bridge(other: Endpoint | string): Promise<EslEvent>`

Directly connects this endpoint's media stream to another endpoint.

**Example:**
```javascript
// A caller (`callerEndpoint`) calls in.
// You create an outbound call (`calleeEndpoint`) to an agent.
await callerEndpoint.bridge(calleeEndpoint);
```

#### `unbridge(): Promise<EslEvent>`

Disconnects this endpoint from an active bridge, parking both legs so they can be handled separately.

#### `join(conf: string | Conference, opts?: ConfJoinOptions): Promise<{ confUuid: string, memberId: number }>`

Joins the endpoint to a conference room.

**Parameters:**
- `conf`: The [`Conference`](./conference.md) instance, or the string name of the conference.
- `opts`: Options for joining, including boolean flags like `mute`, `deaf`, `moderator`, `ghost`.

**Example:**
```javascript
const { memberId } = await endpoint.join('support-room', {
  flags: { mute: true, moderator: false }
});
console.log(`Joined as member #${memberId}`);
```

### Recording & Audio Forking

#### `record(file: string, opts?: RecordOptions): Promise<EslEvent>`

Records the audio from the endpoint to a local file.

**Parameters:**
- `file`: Destination file path.
- `opts`: Limits like `timeLimitSecs`, `silenceThresh`, and `silenceHits`.

#### `recordSession(...args): Promise<EslEvent>`

Records the entire session to a file (both read and write streams mixed).

#### `forkAudioStart(opts: object): Promise<EslEvent>`

Starts forking the endpoint's audio stream to a remote WebSocket server (e.g., for real-time transcription or analysis using `mod_audio_fork`).

**Example:**
```javascript
await endpoint.forkAudioStart({
  wsUrl: 'wss://my-transcriber.example.com/socket',
  mixType: 'stereo',
  sampling: '16000'
});
```

#### `forkAudioStop(bugname?: string): Promise<EslEvent>`
#### `forkAudioPause(bugname?: string): Promise<EslEvent>`
#### `forkAudioResume(bugname?: string): Promise<EslEvent>`

Methods to control active audio forks.

### Speech-to-Text (Transcription / VAD)

#### `startTranscription(opts: object): Promise<EslEvent>`
Starts transcription using integrated engines (Google, AWS, Azure, Nuance, etc.).

#### `startVadDetection(opts: object): Promise<EslEvent>`
Starts Voice Activity Detection to determine when the caller starts and stops speaking.

### Channel Utilities

#### `set(param: string | object, value?: string): Promise<EslEvent>`
Sets channel variables on this endpoint.

#### `export(param: string | object, value?: string): Promise<EslEvent>`
Exports channel variables so they propagate to bridged legs.

#### `mute(): Promise<EslEvent>`
Mutes the media stream *from* the endpoint.

#### `unmute(): Promise<EslEvent>`
Unmutes the media stream.

#### `api(command: string, args?: string): Promise<EslEvent>`
Executes an API command specifically targeting this endpoint's UUID.

#### `execute(app: string, arg?: string): Promise<EslEvent>`
Executes a FreeSWITCH dialplan application (e.g., `'answer'`, `'ring_ready'`).

### Events

- **`ready`**: Emitted when the SIP negotiation is complete and the channel is active.
- **`dtmf`**: Emitted when DTMF is detected (`{ dtmf, duration, source }`).
- **`playback-start` / `playback-stop`**: Emitted during media playback.
- **`destroy`**: Emitted when the call ends (`{ reason }`).
