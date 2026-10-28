/**
 * Small byte helpers used by the Steam auth client.
 *
 * Everything here is dependency free on purpose: Hermes does not ship
 * `TextEncoder`/`TextDecoder` and `btoa`/`atob` are not guaranteed to handle
 * arbitrary binary payloads, so we do the conversions ourselves.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  table['='.charCodeAt(0)] = -2;
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += hasB1 ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += hasB2 ? BASE64_ALPHABET[b2 & 0x3f] : '=';
  }

  return out;
}

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[\r\n\t ]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(Math.max(0, Math.floor((clean.length * 3) / 4) - padding));

  let outIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_LOOKUP[clean.charCodeAt(i)] ?? -1;
    const c1 = BASE64_LOOKUP[clean.charCodeAt(i + 1)] ?? -1;
    const c2 = BASE64_LOOKUP[clean.charCodeAt(i + 2)] ?? -1;
    const c3 = BASE64_LOOKUP[clean.charCodeAt(i + 3)] ?? -1;

    if (c0 < 0 || c1 < 0) {
      break;
    }

    if (outIndex < out.length) {
      out[outIndex++] = (c0 << 2) | (c1 >> 4);
    }
    if (c2 >= 0 && outIndex < out.length) {
      out[outIndex++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    }
    if (c3 >= 0 && outIndex < out.length) {
      out[outIndex++] = ((c2 & 0x03) << 6) | c3;
    }
  }

  return out;
}

export function utf8ToBytes(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let i = 0; i < value.length; i += 1) {
    let codePoint = value.codePointAt(i) ?? 0;

    if (codePoint > 0xffff) {
      i += 1;
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return new Uint8Array(bytes);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i];

    if (byte < 0x80) {
      out += String.fromCharCode(byte);
      i += 1;
    } else if (byte < 0xe0) {
      out += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (byte < 0xf0) {
      out += String.fromCharCode(
        ((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else {
      const codePoint =
        ((byte & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      out += String.fromCodePoint(codePoint);
      i += 4;
    }
  }

  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);

  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }

  return out;
}
