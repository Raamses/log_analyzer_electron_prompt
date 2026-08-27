// @paths lib/columnstore
/**
 * Columnar storage with chunked allocation and DTO serialization.
 *
 * Why chunked: a flat Int32Array(ROWS) pre-allocates based on unknown row count.
 * Doubling reallocation at 200 MB needs 600 MB contiguous — V8 fails this with
 * "ArrayBuffer allocation failed". Instead, columns grow by appending 64k-row
 * blocks (256 KB each). No realloc, no copy.
 */

export const BLOCK_SHIFT = 16;
export const BLOCK_SIZE = 1 << BLOCK_SHIFT; // 65536
export const BLOCK_MASK = BLOCK_SIZE - 1;

export type ColumnType = 'int32' | 'float64' | 'uint8' | 'uint16' | 'uint32' | 'date' | 'dict' | 'string';

export interface SerializedColumn {
  type: ColumnType;
  blockBuffers: ArrayBuffer[];
  presenceBuffer: ArrayBuffer | null;
  dictionary: string[] | null;
  rowCount: number;
}

export interface ColumnStore {
  readonly type: ColumnType;
  readonly length: number;
  get(row: number): unknown;
  getValue(row: number): number | null;
  set(row: number, value: unknown): null;
  blocks(): ArrayBuffer[];
  presenceBuffer(): ArrayBuffer | null;
  toDTO(): SerializedColumn;
}

export interface NumericColumn extends ColumnStore {
  readonly typedBlocks: Int32Array[] | Float64Array[] | Uint8Array[] | Uint16Array[] | Uint32Array[];
  scan(predicate: (v: number, row: number) => boolean): number;
}

export interface DictColumn extends ColumnStore {
  readonly codes: Uint8Array[] | Uint16Array[] | Uint32Array[];
  readonly dictionary: string[];
  get(row: number): string | null;
}

export interface StringColumn extends ColumnStore {
  get(row: number): string | null;
}

export function getBlockCount(rowCount: number): number {
  return (rowCount + BLOCK_SIZE - 1) >> BLOCK_SHIFT;
}

export function blockIndex(row: number): number {
  return row >>> BLOCK_SHIFT;
}

export function elementIndex(row: number): number {
  return row & BLOCK_MASK;
}

// ── Numeric columns ──────────────────────────────────────────────────────────

export class Int32ColumnStore implements NumericColumn {
  readonly type = 'int32' as const;
  readonly typedBlocks: Int32Array[];
  private _length: number;
  private _presence: Uint32Array[];

  constructor() {
    this.typedBlocks = [];
    this._presence = [];
    this._length = 0;
  }

  get length(): number {
    return this._length;
  }

  private ensureBlock(blockIdx: number): Int32Array {
    let block = this.typedBlocks[blockIdx];
    if (!block) {
      block = new Int32Array(BLOCK_SIZE);
      this.typedBlocks[blockIdx] = block;
      this._presence[blockIdx] = new Uint32Array(BLOCK_SIZE / 32);
    }
    return block;
  }

  get(row: number): number | null {
    if (row >= this._length) return null;
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const pres = this._presence[bi];
    if (pres && ((pres[ei >>> 5] >>> (ei & 31)) & 1) === 0) return null;
    return this.typedBlocks[bi]?.[ei] ?? null;
  }

  getValue(row: number): number | null {
    return this.get(row);
  }

  set(row: number, value: unknown): null {
    if (value === null || value === undefined) return null;
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const block = this.ensureBlock(bi);
    block[ei] = value as number;
    if (this._presence[bi]) {
      this._presence[bi][ei >>> 5] |= 1 << (ei & 31);
    }
    if (row >= this._length) this._length = row + 1;
    return null;
  }

  scan(predicate: (v: number, row: number) => boolean): number {
    let count = 0;
    for (let bi = 0; bi < this.typedBlocks.length; bi++) {
      const block = this.typedBlocks[bi]!;
      const pres = this._presence[bi];
      const baseRow = bi << BLOCK_SHIFT;
      for (let ei = 0; ei < BLOCK_SIZE; ei++) {
        if (baseRow + ei >= this._length) break;
        if (pres && ((pres[ei >>> 5] >>> (ei & 31)) & 1) === 0) continue;
        if (predicate(block[ei], baseRow + ei)) count++;
      }
    }
    return count;
  }

  blocks(): ArrayBuffer[] {
    const bufs: ArrayBuffer[] = this.typedBlocks.map((b) => b.buffer as ArrayBuffer);
    for (const p of this._presence) if (p) bufs.push(p.buffer as ArrayBuffer);
    return bufs;
  }

  presenceBuffer(): ArrayBuffer | null {
    return null;
  }

  toDTO(): SerializedColumn {
    return {
      type: this.type,
      blockBuffers: this.typedBlocks.map((b) => b.buffer as ArrayBuffer),
      presenceBuffer: null,
      dictionary: null,
      rowCount: this._length,
    };
  }

  static fromDTO(dto: SerializedColumn): Int32ColumnStore {
    const col = new Int32ColumnStore();
    for (const buf of dto.blockBuffers) {
      col.typedBlocks.push(new Int32Array(buf));
    }
    col._length = dto.rowCount;
    return col;
  }
}

export class Float64ColumnStore implements NumericColumn {
  readonly type = 'float64' as const;
  readonly typedBlocks: Float64Array[];
  private _length: number;

  constructor() {
    this.typedBlocks = [];
    this._length = 0;
  }

  get length(): number {
    return this._length;
  }

  private ensureBlock(blockIdx: number): Float64Array {
    let block = this.typedBlocks[blockIdx];
    if (!block) {
      block = new Float64Array(BLOCK_SIZE);
      this.typedBlocks[blockIdx] = block;
    }
    return block;
  }

  get(row: number): number | null {
    if (row >= this._length) return null;
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const block = this.typedBlocks[bi];
    return block ? block[ei] : null;
  }

  getValue(row: number): number | null {
    return this.get(row);
  }

  set(row: number, value: unknown): null {
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const block = this.ensureBlock(bi);
    block[ei] = value as number;
    if (row >= this._length) this._length = row + 1;
    return null;
  }

  scan(predicate: (v: number, row: number) => boolean): number {
    let count = 0;
    for (let bi = 0; bi < this.typedBlocks.length; bi++) {
      const block = this.typedBlocks[bi]!;
      const baseRow = bi << BLOCK_SHIFT;
      for (let ei = 0; ei < BLOCK_SIZE; ei++) {
        if (baseRow + ei >= this._length) break;
        if (predicate(block[ei], baseRow + ei)) count++;
      }
    }
    return count;
  }

  blocks(): ArrayBuffer[] {
    return this.typedBlocks.map((b) => b.buffer as ArrayBuffer);
  }

  presenceBuffer(): ArrayBuffer | null {
    return null;
  }

  toDTO(): SerializedColumn {
    return {
      type: this.type,
      blockBuffers: this.typedBlocks.map((b) => b.buffer as ArrayBuffer),
      presenceBuffer: null,
      dictionary: null,
      rowCount: this._length,
    };
  }

  static fromDTO(dto: SerializedColumn): Float64ColumnStore {
    const col = new Float64ColumnStore();
    for (const buf of dto.blockBuffers) {
      col.typedBlocks.push(new Float64Array(buf));
    }
    col._length = dto.rowCount;
    return col;
  }
}

// ── Dict column ──────────────────────────────────────────────────────────────

export class DictColumnStore implements DictColumn {
  readonly type = 'dict' as const;
  readonly codes: Uint16Array[] = [];
  readonly dictionary: string[] = [];
  private _length: number;
  private _codeMap = new Map<string, number>();

  constructor() {
    this._length = 0;
  }

  get length(): number {
    return this._length;
  }

  private ensureBlock(blockIdx: number): Uint16Array {
    let block = this.codes[blockIdx];
    if (!block) {
      block = new Uint16Array(BLOCK_SIZE);
      this.codes[blockIdx] = block;
    }
    return block;
  }

  get(row: number): string | null {
    if (row >= this._length) return null;
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const block = this.codes[bi];
    if (!block) return null;
    return this.dictionary[block[ei]] ?? null;
  }

  getValue(row: number): number | null {
    if (row >= this._length) return null;
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const block = this.codes[bi];
    return block ? block[ei] : null;
  }

  set(row: number, value: unknown): null {
    const str = value as string;
    let code = this._codeMap.get(str);
    if (code === undefined) {
      code = this.dictionary.length;
      this.dictionary.push(str);
      this._codeMap.set(str, code);
    }
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const block = this.ensureBlock(bi);
    block[ei] = code;
    if (row >= this._length) this._length = row + 1;
    return null;
  }

  blocks(): ArrayBuffer[] {
    return this.codes.map((b) => b.buffer as ArrayBuffer);
  }

  presenceBuffer(): ArrayBuffer | null {
    return null;
  }

  toDTO(): SerializedColumn {
    return {
      type: this.type,
      blockBuffers: this.codes.map((b) => b.buffer as ArrayBuffer),
      presenceBuffer: null,
      dictionary: this.dictionary,
      rowCount: this._length,
    };
  }

  static fromDTO(dto: SerializedColumn): DictColumnStore {
    const col = new DictColumnStore();
    if (dto.dictionary) {
      col.dictionary.push(...dto.dictionary);
      for (let i = 0; i < col.dictionary.length; i++) {
        col._codeMap.set(col.dictionary[i], i);
      }
    }
    if (dto.blockBuffers) {
      for (const buf of dto.blockBuffers) {
        col.codes.push(new Uint16Array(buf));
      }
    }
    col._length = dto.rowCount;
    return col;
  }
}

// ── String column (flat, no dict) ───────────────────────────────────────────

export class StringColumnStore implements StringColumn {
  readonly type = 'string' as const;
  private _values: string[][] = [];
  private _length = 0;

  get length(): number {
    return this._length;
  }

  private ensureBlock(blockIdx: number): string[] {
    let block = this._values[blockIdx];
    if (!block) {
      block = new Array(BLOCK_SIZE);
      this._values[blockIdx] = block;
    }
    return block;
  }

  get(row: number): string | null {
    if (row >= this._length) return null;
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    return this._values[bi]?.[ei] ?? null;
  }

  getValue(_row: number): number | null {
    return null;
  }

  set(row: number, value: unknown): null {
    const bi = row >>> BLOCK_SHIFT;
    const ei = row & BLOCK_MASK;
    const block = this.ensureBlock(bi);
    block[ei] = value as string;
    if (row >= this._length) this._length = row + 1;
    return null;
  }

  blocks(): ArrayBuffer[] {
    return [];
  }

  presenceBuffer(): ArrayBuffer | null {
    return null;
  }

  toDTO(): SerializedColumn {
    return {
      type: this.type,
      blockBuffers: [],
      presenceBuffer: null,
      dictionary: null,
      rowCount: this._length,
    };
  }

  static fromDTO(dto: SerializedColumn): StringColumnStore {
    const col = new StringColumnStore();
    col._length = dto.rowCount;
    return col;
  }
}

export function createColumnStore(type: ColumnType): ColumnStore {
  switch (type) {
    case 'int32':
    case 'uint8':
    case 'uint16':
    case 'uint32':
      return new Int32ColumnStore();
    case 'float64':
    case 'date':
      return new Float64ColumnStore();
    case 'dict':
      return new DictColumnStore();
    case 'string':
    default:
      return new StringColumnStore();
  }
}

export function columnStoreFromDTO(dto: SerializedColumn): ColumnStore {
  switch (dto.type) {
    case 'int32':
    case 'uint8':
    case 'uint16':
    case 'uint32':
      return Int32ColumnStore.fromDTO(dto);
    case 'float64':
    case 'date':
      return Float64ColumnStore.fromDTO(dto);
    case 'dict':
      return DictColumnStore.fromDTO(dto);
    case 'string':
    default:
      return StringColumnStore.fromDTO(dto);
  }
}
