// @paths lib/__tests__/columnstore.test.ts
import { describe, it, expect } from 'vitest';
import {
  Int32ColumnStore,
  Float64ColumnStore,
  DictColumnStore,
  StringColumnStore,
  createColumnStore,
  columnStoreFromDTO,
  getBlockCount,
  blockIndex,
  elementIndex,
} from '../columnstore';

describe('Int32ColumnStore', () => {
  it('sets and gets values', () => {
    const col = new Int32ColumnStore();
    for (let i = 0; i < 100; i++) col.set(i, i * 10);
    expect(col.length).toBe(100);
    expect(col.get(50)).toBe(500);
    expect(col.getValue(0)).toBe(0);
  });

  it('returns null for out-of-range', () => {
    const col = new Int32ColumnStore();
    col.set(0, 42);
    expect(col.get(1)).toBeNull();
    expect(col.get(100)).toBeNull();
  });

  it('crosses block boundaries', () => {
    const col = new Int32ColumnStore();
    // BLOCK_SIZE is 65536; set past that
    col.set(65_536 + 5, 999);
    expect(col.length).toBe(65_542); // row 65541 -> length 65542
    expect(col.get(65_536 + 5)).toBe(999);
    // earlier block still accessible
    col.set(100, 42);
    expect(col.get(100)).toBe(42);
  });

  it('counts blocks correctly', () => {
    expect(getBlockCount(0)).toBe(0);
    expect(getBlockCount(1)).toBe(1);
    expect(getBlockCount(65_536)).toBe(1);
    expect(getBlockCount(65_537)).toBe(2);
  });

  it('computes block/element indices', () => {
    expect(blockIndex(0)).toBe(0);
    expect(elementIndex(0)).toBe(0);
    expect(blockIndex(65_535)).toBe(0);
    expect(elementIndex(65_535)).toBe(65_535);
    expect(blockIndex(65_536)).toBe(1);
    expect(elementIndex(65_536)).toBe(0);
    expect(blockIndex(65_537)).toBe(1);
    expect(elementIndex(65_537)).toBe(1);
  });
});

describe('Float64ColumnStore', () => {
  it('stores and retrieves floats', () => {
    const col = new Float64ColumnStore();
    col.set(0, 3.14);
    col.set(1, 2.718);
    expect(col.get(0)).toBeCloseTo(3.14, 5);
    expect(col.get(1)).toBeCloseTo(2.718, 5);
  });

  it('stores dates as epoch ms', () => {
    const col = new Float64ColumnStore();
    const date = Date.UTC(2026, 0, 15, 12, 30, 45);
    col.set(0, date);
    expect(col.get(0)).toBe(date);
  });
});

describe('DictColumnStore', () => {
  it('stores distinct strings', () => {
    const col = new DictColumnStore();
    col.set(0, 'GET');
    col.set(1, 'POST');
    col.set(2, 'GET');
    col.set(3, 'PUT');
    expect(col.get(0)).toBe('GET');
    expect(col.get(1)).toBe('POST');
    expect(col.get(2)).toBe('GET');
    expect(col.get(3)).toBe('PUT');
    // dictionary deduplicates
    expect(col.dictionary).toEqual(['GET', 'POST', 'PUT']);
    expect(col.dictionary.length).toBe(3);
  });

  it('encodes as Uint16 codes', () => {
    const col = new DictColumnStore();
    for (let i = 0; i < 200; i++) col.set(i, `val-${i % 5}`);
    // only 5 distinct
    expect(col.dictionary.length).toBe(5);
    expect(col.get(0)).toBe(col.get(5)); // same code
  });
});

describe('StringColumnStore', () => {
  it('stores raw strings', () => {
    const col = new StringColumnStore();
    col.set(0, 'hello');
    col.set(1, 'world');
    expect(col.get(0)).toBe('hello');
    expect(col.get(1)).toBe('world');
  });
});

describe('createColumnStore factory', () => {
  it('creates int32 for integer types', () => {
    expect(createColumnStore('int32').type).toBe('int32');
    expect(createColumnStore('uint8').type).toBe('int32');
    expect(createColumnStore('uint16').type).toBe('int32');
  });

  it('creates float64 for float/date', () => {
    expect(createColumnStore('float64').type).toBe('float64');
    expect(createColumnStore('date').type).toBe('float64');
  });

  it('creates dict for dict', () => {
    expect(createColumnStore('dict').type).toBe('dict');
  });

  it('creates string for unknown', () => {
    expect(createColumnStore('string').type).toBe('string');
  });
});

describe('DTO serialization', () => {
  it('round-trips Int32ColumnStore', () => {
    const col = new Int32ColumnStore();
    for (let i = 0; i < 10; i++) col.set(i, i * 100);
    const dto = col.toDTO();
    const restored = columnStoreFromDTO(dto) as Int32ColumnStore;
    expect(restored.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(restored.get(i)).toBe(i * 100);
    }
  });

  it('round-trips Float64ColumnStore', () => {
    const col = new Float64ColumnStore();
    col.set(0, 3.14);
    col.set(1, 2.718);
    const dto = col.toDTO();
    const restored = columnStoreFromDTO(dto);
    expect(restored.get(0)).toBeCloseTo(3.14, 5);
    expect(restored.get(1)).toBeCloseTo(2.718, 5);
  });

  it('round-trips DictColumnStore', () => {
    const col = new DictColumnStore();
    col.set(0, 'GET');
    col.set(1, 'POST');
    col.set(2, 'GET');
    const dto = col.toDTO();
    expect(dto.dictionary).toEqual(['GET', 'POST']);
    const restored = columnStoreFromDTO(dto) as DictColumnStore;
    expect(restored.dictionary.length).toBe(2);
    expect(restored.get(0)).toBe('GET');
    expect(restored.get(1)).toBe('POST');
  });

  it('produces transferable ArrayBuffers', () => {
    const col = new Int32ColumnStore();
    for (let i = 0; i < 70_000; i++) col.set(i, i);
    const dto = col.toDTO();
    expect(dto.blockBuffers.length).toBeGreaterThan(0);
    // all block buffers are ArrayBuffers
    for (const buf of dto.blockBuffers) {
      expect(buf).toBeInstanceOf(ArrayBuffer);
    }
  });

  it('survives structured clone simulation (DTO is plain data)', () => {
    const col = new DictColumnStore();
    for (let i = 0; i < 100; i++) col.set(i, `method-${i % 4}`);
    const dto = col.toDTO();
    // structuredClone is available in Node 17+
    const cloned = structuredClone(dto);
    const restored = columnStoreFromDTO(cloned) as DictColumnStore;
    expect(restored.dictionary.length).toBe(4);
    expect(restored.get(0)).toBe('method-0');
  });
});

describe('block growth', () => {
  it('uses 64k-row blocks', () => {
    const col = new Int32ColumnStore();
    col.set(65_535, 1); // last row in first block
    col.set(65_536, 2); // first row in second block
    expect(col.typedBlocks.length).toBe(2);
    expect(col.get(65_535)).toBe(1);
    expect(col.get(65_536)).toBe(2);
  });

  it('handles very large row counts', () => {
    const col = new Int32ColumnStore();
    col.set(5_000_000, 42);
    expect(col.length).toBe(5_000_001);
    expect(col.get(5_000_000)).toBe(42);
  });
});
