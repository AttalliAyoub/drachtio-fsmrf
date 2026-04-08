# Utilities

The `drachtio-fsmrf` package includes a suite of utility functions primarily focused on SIP and SDP manipulation, text parsing, and type extraction.

These are exposed via `Mrf.utils` but can also be imported individually if using TypeScript directly from `src/utils`.

## Functions

### `parseDecibels(db: string | number | undefined | null): number`

Parses a decibel value from a string or number into a raw integer. It strips away trailing strings like `"dB"` or `"db"`, and handles signs (`+` or `-`).

**Returns:** The parsed integer value. Returns `0` if parsing fails.

**Example:**
```javascript
const gain = parseDecibels("+5 dB"); // Returns 5
const reduction = parseDecibels("-10db"); // Returns -10
const zero = parseDecibels("invalid"); // Returns 0
```

### `parseBodyText(txt: string): Record<string, string | number>`

Parses a colon-separated text body into a JavaScript object. It automatically detects keys starting with `variable_rtp_audio`, `variable_rtp_video`, or `variable_playback` and casts their values into integers.

**Parameters:**
- `txt`: The raw text body containing key-value pairs separated by colons and newlines.

**Returns:** An object containing the parsed key-value pairs.

**Example:**
```javascript
const rawEvent = `variable_rtp_audio_in_raw_bytes: 10240
variable_sip_call_id: abcdefg
variable_playback_seconds: 12`;

const obj = parseBodyText(rawEvent);
// Result:
// {
//   variable_rtp_audio_in_raw_bytes: 10240,
//   variable_sip_call_id: "abcdefg",
//   variable_playback_seconds: 12
// }
```

### `sortFunctor(codecs: string[], rtp: Array<{ payload?: number, codec?: string }>)`

Generates a custom sorting function used to prioritize media payloads based on a preferred codec list.

**Parameters:**
- `codecs`: Array of preferred codec names in order of priority (e.g. `['OPUS', 'PCMU']`).
- `rtp`: Array of RTP mapping objects from the parsed SDP.

**Returns:** A sorting function compatible with `Array.prototype.sort()`.

### `modifySdpCodecOrder(sdp: string, codecList: string[]): string`

Modifies an SDP (Session Description Protocol) string by reordering the codec payloads to prioritize requested codecs. This leverages `sdp-transform`.

**Parameters:**
- `sdp`: The original SDP string.
- `codecList`: Array of codec names representing the desired priority order.

**Returns:** The newly formatted SDP string. If parsing fails, it safely returns the original SDP string.

**Example:**
```javascript
const originalSdp = "v=0\r\no=...m=audio 20000 RTP/AVP 0 8 101\r\n";
const newSdp = modifySdpCodecOrder(originalSdp, ['OPUS', 'PCMA', 'PCMU']);

// The newSdp will now list payload 8 (PCMA) before 0 (PCMU).
```

### `pick(obj: object, keys: string): object`

Creates a new object composed of only the requested properties from a source object.

**Parameters:**
- `obj`: The source object to pick properties from.
- `keys`: A space-separated string of property names to pick.

**Returns:** A new object containing only the picked properties.

**Example:**
```javascript
const user = { name: 'Bob', age: 30, active: true };
const result = pick(user, 'name active'); 
// Result: { name: 'Bob', active: true }
```
