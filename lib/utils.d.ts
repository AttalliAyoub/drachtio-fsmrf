/**
 * Parses a decibel value from a string or number into a raw integer.
 *
 * @param db - The input value to parse (e.g. `10`, `"+10 dB"`, `"-5db"`).
 * @returns The parsed integer value. Returns 0 if parsing fails.
 *
 * @example
 * ```typescript
 * const gain = parseDecibels("+5 dB"); // Returns 5
 * const reduction = parseDecibels("-10db"); // Returns -10
 * ```
 */
export declare const parseDecibels: (db: string | number | undefined | null) => number;
/**
 * Parses a colon-separated text body into a JavaScript object.
 * Keys starting with `variable_rtp_audio`, `variable_rtp_video`, or `variable_playback`
 * will have their values automatically parsed into integers.
 *
 * @param txt - The raw text body containing key-value pairs separated by colons and newlines.
 * @returns An object containing the parsed key-value pairs.
 */
export declare const parseBodyText: (txt: string) => Record<string, string | number>;
/**
 * Generates a sorting function used to prioritize media payloads based on a preferred codec list.
 *
 * @param codecs - Array of preferred codec names in order of priority.
 * @param rtp - Array of RTP mapping objects from the parsed SDP.
 * @returns A sorting function to be used with Array.prototype.sort().
 */
export declare const sortFunctor: (codecs: string[], rtp: {
    payload?: number;
    codec?: string;
}[]) => (a: string | number, b: string | number) => number;
/**
 * Modifies an SDP string by reordering the codec payloads to prioritize the requested codecs.
 *
 * @param sdp - The original Session Description Protocol (SDP) string.
 * @param codecList - Array of codec names representing the desired priority order.
 * @returns The modified SDP string with the reordered payloads. If parsing fails, the original SDP is returned.
 *
 * @example
 * ```typescript
 * const newSdp = modifySdpCodecOrder(originalSdp, ['OPUS', 'PCMU']);
 * ```
 */
export declare const modifySdpCodecOrder: (sdp: string, codecList: string[]) => string;
/**
 * Creates a new object composed of the picked object properties.
 *
 * @param obj - The source object to pick properties from.
 * @param keys - A space-separated string of property names to pick.
 * @returns A new object containing only the picked properties.
 *
 * @example
 * ```typescript
 * const user = { name: 'Bob', age: 30, active: true };
 * const result = pick(user, 'name active'); // { name: 'Bob', active: true }
 * ```
 */
export declare const pick: <T extends object>(obj: T, keys: string) => Partial<T>;
