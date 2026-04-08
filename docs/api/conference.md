# Conference

The `Conference` class represents a live conference room on the FreeSWITCH media server. It allows you to manage participants (members), adjust audio and video flags, play media to the whole room, and record the session.

> Note: A conference always has a "dummy" anchoring `Endpoint` created automatically in the background to instantiate the room. This endpoint has a `memberId` of its own but serves strictly to control the conference.

## Class: `Conference`

Created using [`MediaServer.createConference()`](./mediaserver.md#createconferencename-string-opts-conferencecreateoptions-promiseconference).

### Properties

- `name` *(string)*: The name of the conference room.
- `uuid` *(string)*: The unique ID assigned to the conference by FreeSWITCH.
- `state` *(enum)*: The lifecycle state (e.g., `CREATED`, `DESTROYED`).
- `recordFile` *(string | null)*: The currently active recording file path, or `null` if not recording.
- `locked` *(boolean)*: True if the conference is locked.
- `maxMembers` *(number)*: The maximum allowed members (`-1` means unlimited).
- `participants` *(Map<number, object>)*: A Map of all currently active participants keyed by their `memberId`.
- `endpoint` *(Endpoint)*: The anchoring `Endpoint` controlling the room.

### Lifecycle Methods

#### `destroy(): Promise<void>`

Tears down the conference, kicking out all members and destroying the anchoring endpoint.

**Example:**
```javascript
const conf = await mediaserver.createConference('sales-meeting');

// Later...
setTimeout(() => {
  conf.destroy();
}, 3600 * 1000); // End meeting after 1 hour
```

### Room Management

#### `getSize(): Promise<number>`

Retrieves the current number of participants (including the anchoring endpoint) in the conference.

**Example:**
```javascript
const size = await conf.getSize();
console.log(`There are ${size} active participants.`);
```

#### `lock(): Promise<string>`
Prevents new members from joining the room.

#### `unlock(): Promise<string>`
Allows new members to join the room.

#### `mute(target?: string): Promise<string>`
Mutes a specific member ID, or all non-moderator members if `'all'` is passed.

#### `unmute(target?: string): Promise<string>`
Unmutes a specific member ID or all members.

#### `deaf(target?: string): Promise<string>`
Deafens members so they cannot hear the conference audio.

#### `undeaf(target?: string): Promise<string>`
Undeafens members so they can hear again.

### Member Commands (Called on Endpoint)

While `Conference` manages the whole room, you can issue commands targeting a specific member using methods provided directly on the member's `Endpoint` instance. (See the [Endpoint docs](./endpoint.md) for full details, such as `confMute()`, `confKick()`, `confPlay()`, and `transfer()`).

### Global Playback

#### `play(file: string | string[]): Promise<PlaybackResults>`

Plays an audio or video file to all members in the conference. If an array of paths is provided, they are played sequentially.

**Parameters:**
- `file`: Path to the media file or an array of paths.

**Returns:**
An object containing `seconds`, `milliseconds`, and `samples` of the total playback duration.

**Example:**
```javascript
const result = await conf.play('ivr/8000/ivr-please_hold_while_we_connect_you.wav');
console.log(`Finished playing introductory prompt. (${result.seconds} seconds)`);
```

### Global Recording

#### `startRecording(file: string): Promise<string>`

Starts recording all mixed audio (and video, if supported) from the conference to the specified file.

**Parameters:**
- `file`: The destination path for the recording.

#### `pauseRecording(file: string): Promise<string>`
Temporarily pauses an active recording.

#### `resumeRecording(file: string): Promise<string>`
Resumes a paused recording.

#### `stopRecording(file: string): Promise<string>`
Stops an active recording and closes the file.

**Example:**
```javascript
await conf.startRecording('/tmp/sales-meeting-archive.wav');

// Later...
await conf.stopRecording('/tmp/sales-meeting-archive.wav');
```

### Events

The `Conference` object emits events for all activity inside the room.

- **`addMember`**: A member successfully joined the room.
- **`delMember`**: A member left or was kicked.
- **`startTalking` / `stopTalking`**: Voice Activity Detection (VAD) events triggered when a member speaks.
- **`muteMember` / `unmuteMember`**: A member's microphone status changed.
- **`dtmfMember`**: A member pressed a DTMF key while in the room.
- **`playFile` / `playFileDone`**: Global playback started or finished.
- **`startRecording` / `stopRecording`**: Recording state changed.

**Example:**
```javascript
conf.on('addMember', (evt) => {
  const memberId = evt.getHeader('Member-ID');
  console.log(`Member #${memberId} joined the conference!`);
});

conf.on('startTalking', (evt) => {
  const memberId = evt.getHeader('Member-ID');
  console.log(`Member #${memberId} is currently speaking.`);
});