/**
 * Minimal protobuf wire-format helpers.
 *
 * Steam's unified messaging (and the WebAPI `input_protobuf_encoded`
 * parameter) uses plain protobuf. We only need a handful of messages, so a
 * tiny encoder/decoder keeps the app free of a codegen step.
 */

import { bytesToUtf8, utf8ToBytes } from './bytes';

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

export class ProtoWriter {
  private readonly chunks: number[] = [];

  uint32(field: number, value: number): this {
    return this.varint(field, BigInt(value >>> 0));
  }

  int32(field: number, value: number): this {
    // Negative int32 values are encoded as 10-byte two's complement varints.
    return this.varint(field, BigInt.asUintN(64, BigInt(value)));
  }

  uint64(field: number, value: bigint | number | string): this {
    return this.varint(field, BigInt(value));
  }

  fixed32(field: number, value: number): this {
    this.writeTag(field, WIRE_FIXED32);
    const unsigned = value >>> 0;

    for (let i = 0; i < 4; i += 1) {
      this.chunks.push((unsigned >>> (i * 8)) & 0xff);
    }

    return this;
  }

  /**
   * `fixed64` fields (`CAuthentication_..._Request.steamid`) are always eight
   * little-endian bytes. Steam's parser skips a field whose wire type does not
   * match the schema, so these must not be written as varints.
   */
  fixed64(field: number, value: bigint | number | string): this {
    this.writeTag(field, WIRE_FIXED64);

    let remaining = BigInt(value);

    for (let i = 0; i < 8; i += 1) {
      this.chunks.push(Number(remaining & 0xffn));
      remaining >>= 8n;
    }

    return this;
  }

  bool(field: number, value: boolean): this {
    return this.varint(field, value ? 1n : 0n);
  }

  enum(field: number, value: number): this {
    return this.int32(field, value);
  }

  string(field: number, value: string): this {
    if (value.length === 0) {
      return this;
    }

    return this.lengthDelimited(field, utf8ToBytes(value));
  }

  bytes(field: number, value: Uint8Array): this {
    return this.lengthDelimited(field, value);
  }

  message(field: number, value: ProtoWriter): this {
    return this.lengthDelimited(field, value.finish());
  }

  float(field: number, value: number): this {
    this.writeTag(field, WIRE_FIXED32);
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    for (let i = 0; i < 4; i += 1) {
      this.chunks.push(view.getUint8(i));
    }
    return this;
  }

  finish(): Uint8Array {
    return new Uint8Array(this.chunks);
  }

  private lengthDelimited(field: number, value: Uint8Array): this {
    this.writeTag(field, WIRE_LENGTH_DELIMITED);
    this.writeVarint(BigInt(value.length));
    for (let i = 0; i < value.length; i += 1) {
      this.chunks.push(value[i]);
    }
    return this;
  }

  private varint(field: number, value: bigint): this {
    this.writeTag(field, WIRE_VARINT);
    this.writeVarint(value);
    return this;
  }

  private writeTag(field: number, wireType: number): void {
    this.writeVarint(BigInt((field << 3) | wireType));
  }

  private writeVarint(value: bigint): void {
    let remaining = value;

    while (remaining > 0x7fn) {
      this.chunks.push(Number(remaining & 0x7fn) | 0x80);
      remaining >>= 7n;
    }

    this.chunks.push(Number(remaining));
  }
}

export type ProtoField = {
  field: number;
  wire: number;
  value: bigint | Uint8Array;
};

export function readMessage(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;

  const readVarint = (): bigint => {
    let result = 0n;
    let shift = 0n;

    while (offset < bytes.length) {
      const byte = bytes[offset++];
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
      shift += 7n;
    }

    return result;
  };

  while (offset < bytes.length) {
    const tag = Number(readVarint());
    const field = tag >>> 3;
    const wire = tag & 0x07;

    if (field === 0) {
      break;
    }

    switch (wire) {
      case WIRE_VARINT:
        fields.push({ field, wire, value: readVarint() });
        break;
      case WIRE_FIXED64: {
        const slice = bytes.slice(offset, offset + 8);
        offset += 8;
        fields.push({ field, wire, value: slice });
        break;
      }
      case WIRE_LENGTH_DELIMITED: {
        const length = Number(readVarint());
        const slice = bytes.slice(offset, offset + length);
        offset += length;
        fields.push({ field, wire, value: slice });
        break;
      }
      case WIRE_FIXED32: {
        const slice = bytes.slice(offset, offset + 4);
        offset += 4;
        fields.push({ field, wire, value: slice });
        break;
      }
      default:
        // Unknown wire type: the rest of the buffer cannot be parsed safely.
        return fields;
    }
  }

  return fields;
}

export function allOf(fields: ProtoField[], field: number): ProtoField[] {
  return fields.filter((entry) => entry.field === field);
}

export function firstOf(fields: ProtoField[], field: number): ProtoField | undefined {
  return fields.find((entry) => entry.field === field);
}

export function asString(field: ProtoField | undefined): string {
  if (!field) {
    return '';
  }

  return field.value instanceof Uint8Array ? bytesToUtf8(field.value) : String(field.value);
}

export function asBytes(field: ProtoField | undefined): Uint8Array {
  if (!field) {
    return new Uint8Array(0);
  }

  return field.value instanceof Uint8Array ? field.value : new Uint8Array(0);
}

export function asNumber(field: ProtoField | undefined): number {
  if (!field) {
    return 0;
  }

  return field.value instanceof Uint8Array ? 0 : Number(field.value);
}

export function asBoolean(field: ProtoField | undefined): boolean {
  return asNumber(field) !== 0;
}

/**
 * uint64 fields (SteamIDs, client ids) exceed Number.MAX_SAFE_INTEGER, so they
 * are kept as decimal strings the same way protobuf-js does. Handles both
 * varint and fixed64 encodings: Steam mixes the two across messages.
 */
export function asUint64String(field: ProtoField | undefined): string {
  if (!field) {
    return '0';
  }

  if (field.value instanceof Uint8Array) {
    let result = 0n;

    for (let i = field.value.length - 1; i >= 0; i -= 1) {
      result = (result << 8n) | BigInt(field.value[i]);
    }

    return result.toString();
  }

  return field.value.toString();
}

export function asFloat(field: ProtoField | undefined): number {
  if (!field || !(field.value instanceof Uint8Array) || field.value.length < 4) {
    return 0;
  }

  const view = new DataView(field.value.buffer, field.value.byteOffset, 4);
  return view.getFloat32(0, true);
}
