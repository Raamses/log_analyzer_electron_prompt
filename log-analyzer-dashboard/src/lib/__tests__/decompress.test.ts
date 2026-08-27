// @paths lib/__tests__/decompress.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  decompressGzip,
  Bzip2UnsupportedError,
  setGzipImpl,
  isDecompressError,
} from '../decompress';

beforeEach(() => {
  // Reset gzip impl between tests
  setGzipImpl(null);
});

describe('Bzip2UnsupportedError', () => {
  it('has the right code and message', () => {
    const err = new Bzip2UnsupportedError();
    expect(err.code).toBe('BZIP2_UNSUPPORTED');
    expect(err.message).toContain('bzip2');
    expect(err.message).toContain('.bz2');
    expect(isDecompressError(err)).toBe(true);
  });
});

describe('decompressGzip', () => {
  it('uses injected impl when registered', async () => {
    // Injected impl returns the same bytes (passthrough for testing)
    const testImpl = async (data: Uint8Array) => data;
    setGzipImpl(testImpl);

    const data = new Uint8Array([0x1f, 0x8b, 0x08, 0x01, 0x02, 0x03]);
    const result = await decompressGzip(data);
    expect(result).toEqual(data);
  });

  it('injected impl can decompress (fake)', async () => {
    // Injected impl reverses bytes to simulate decompression
    const testImpl = async (data: Uint8Array) => {
      // Strip 3-byte fake header, reverse the rest
      const body = data.slice(3);
      return new Uint8Array([...body].reverse());
    };
    setGzipImpl(testImpl);

    const data = new Uint8Array([0x1f, 0x8b, 0x08, 0x01, 0x02, 0x03]);
    const result = await decompressGzip(data);
    expect(result).toEqual(new Uint8Array([0x03, 0x02, 0x01]));
  });

  it('throws when no impl and DecompressionStream fails on bad data', async () => {
    // happy-dom provides DecompressionStream, but fake bytes will make it throw.
    // Either NO_DECOMPRESSOR or a GZIP decode error is acceptable here — the
    // point is: an error is thrown, not a silent pass-through.
    const data = new Uint8Array([0x1f, 0x8b, 0x08, 0x01, 0x02, 0x03]);
    let threw = false;
    try {
      await decompressGzip(data);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
