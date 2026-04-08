import * as transform from 'sdp-transform';
import assert from 'assert';
import createDebug from 'debug';

const debug = createDebug('drachtio:fsmrf');

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
export const parseDecibels = (db: string | number | undefined | null): number => {
  if (!db) return 0;
  if (typeof db === 'number') {
    return db;
  } else if (typeof db === 'string') {
    const match = db.match(/([+-]?\d+(\.\d+)?)\s*db/i);
    if (match) {
      return Math.trunc(parseFloat(match[1]));
    } else {
      return 0;
    }
  } else {
    return 0;
  }
};

/**
 * Parses a colon-separated text body into a JavaScript object.
 * Keys starting with `variable_rtp_audio`, `variable_rtp_video`, or `variable_playback`
 * will have their values automatically parsed into integers.
 * 
 * @param txt - The raw text body containing key-value pairs separated by colons and newlines.
 * @returns An object containing the parsed key-value pairs.
 */
export const parseBodyText = (txt: string): Record<string, string | number> => {
  return txt.split('\n').reduce((obj: Record<string, string | number>, line: string) => {
    const data = line.split(': ');
    const key = data.shift();
    if (!key) return obj;
    const value = decodeURIComponent(data.shift() || '');

    if (
      key.indexOf('variable_rtp_audio') === 0 ||
      key.indexOf('variable_rtp_video') === 0 ||
      key.indexOf('variable_playback') === 0
    ) {
      obj[key] = parseInt(value, 10);
    } else if (key && key.length > 0) {
      obj[key] = value;
    }

    return obj;
  }, {});
};

/**
 * Generates a sorting function used to prioritize media payloads based on a preferred codec list.
 * 
 * @param codecs - Array of preferred codec names in order of priority.
 * @param rtp - Array of RTP mapping objects from the parsed SDP.
 * @returns A sorting function to be used with Array.prototype.sort().
 */
export const sortFunctor = (codecs: string[], rtp: { payload?: number; codec?: string }[]) => {
  const DEFAULT_SORT_ORDER = 999;
  const rtpMap = new Map<number, string>();
  rtpMap.set(0, 'PCMU');
  rtpMap.set(8, 'PCMA');
  rtpMap.set(18, 'G.729');
  rtpMap.set(18, 'G729');
  rtp.forEach((r) => {
    if (r.codec && r.payload !== undefined) {
      const name = r.codec.toUpperCase();
      if (name !== 'TELEPHONE-EVENT') rtpMap.set(r.payload, name);
    }
  });

  function score(pt: string | number): number {
    const n = typeof pt === 'string' ? parseInt(pt, 10) : pt;
    if (!rtpMap.has(n)) {
      return DEFAULT_SORT_ORDER;
    }
    const name = rtpMap.get(n);
    if (name && codecs.includes(name)) {
      return codecs.indexOf(name);
    }
    return DEFAULT_SORT_ORDER;
  }
  return function(a: string | number, b: string | number): number {
    return score(a) - score(b);
  };
};

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
export const modifySdpCodecOrder = (sdp: string, codecList: string[]): string => {
  assert(Array.isArray(codecList));

  try {
    const codecs = codecList.map((c) => c.toUpperCase());
    const obj = transform.parse(sdp);
    debug(`parsed SDP: ${JSON.stringify(obj)}`);

    for (let i = 0; i < obj.media.length; i++) {
      const sortFn = sortFunctor(codecs, obj.media[i].rtp);
      debug(`obj.media[i].payloads: ${obj.media[i].payloads}`);
      if (typeof obj.media[i].payloads === 'string') {
        const payloads = (obj.media[i].payloads as string).split(' ');
        debug(`initial list: ${payloads}`);
        payloads.sort(sortFn);
        debug(`resorted payloads: ${payloads}, for codec list ${codecs}`);
        obj.media[i].payloads = payloads.join(' ');
      }
    }
    return transform.write(obj);
  } catch (err) {
    console.log(err, `Error parsing SDP: ${sdp}`);
    return sdp;
  }
};

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
export const pick = <T extends object>(obj: T, keys: string): Partial<T> => {
  const list = keys.split(' ');
  return list.reduce((acc: Partial<T>, key: string) => {
    if (key in obj) {
      acc[key as keyof Partial<T>] = obj[key as keyof T];
    }
    return acc;
  }, {});
};
