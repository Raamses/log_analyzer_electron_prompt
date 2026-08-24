import { describe, it, expect } from 'vitest';
import {
  frame, parseDelimitedLine, unwrapLines,
  detectCompression, detectEncoding, decodeBytes, sniffFormat,
  extractW3C, extractDelimited, extractJsonLines, extractCLF, extractKeyValue,
} from '../dialect';

describe('RFC4180 parseDelimitedLine', () => {
  it('splits on delimiter', () => {
    expect(parseDelimitedLine('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with embedded delimiter', () => {
    expect(parseDelimitedLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });

  it('handles escaped quotes', () => {
    expect(parseDelimitedLine('a,"b""c",d', ',')).toEqual(['a', 'b"c', 'd']);
  });

  it('handles empty quoted field', () => {
    expect(parseDelimitedLine('a,"",d', ',')).toEqual(['a', '', 'd']);
  });

  it('handles tab delimiter', () => {
    expect(parseDelimitedLine('a\tb\tc', '\t')).toEqual(['a', 'b', 'c']);
  });

  it('handles space delimiter (W3C)', () => {
    expect(parseDelimitedLine('date time cs-uri-stem sc-status', ' '))
      .toEqual(['date', 'time', 'cs-uri-stem', 'sc-status']);
  });

  it('handles empty cells', () => {
    expect(parseDelimitedLine('a,,c', ',')).toEqual(['a', '', 'c']);
  });

  it('handles trailing empty cell', () => {
    expect(parseDelimitedLine('a,b,', ',')).toEqual(['a', 'b', '']);
  });
});

describe('unwrapLines (RFC4180 multiline)', () => {
  it('joins wrapped quoted lines', () => {
    const lines = ['a,"b', 'c",d'];
    expect(unwrapLines(lines, ',')).toEqual(['a,"b\nc",d']);
  });

  it('leaves unquoted lines alone', () => {
    const lines = ['a,b', 'c,d'];
    expect(unwrapLines(lines, ',')).toEqual(['a,b', 'c,d']);
  });

  it('handles multiple wrapped lines', () => {
    const lines = ['a,"b', 'c', 'd",e'];
    expect(unwrapLines(lines, ',')).toEqual(['a,"b\nc\nd",e']);
  });
});

describe('detectCompression', () => {
  it('detects gzip magic bytes', () => {
    expect(detectCompression(Uint8Array.from([0x1f, 0x8b, 0x08]))).toBe('gzip');
  });

  it('detects zstd magic bytes', () => {
    expect(detectCompression(Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd]))).toBe('zstd');
  });

  it('detects bzip2 magic bytes', () => {
    expect(detectCompression(Uint8Array.from([0x42, 0x5a, 0x68]))).toBe('bzip2');
  });

  it('returns none for short buffer', () => {
    expect(detectCompression(Uint8Array.from([0x1f]))).toBe('none');
  });

  it('returns none for unknown bytes', () => {
    expect(detectCompression(Uint8Array.from([0x00, 0x01, 0x02, 0x03]))).toBe('none');
  });
});

describe('detectEncoding', () => {
  it('detects UTF-8 BOM', () => {
    expect(detectEncoding(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])))
      .toEqual({ encoding: 'utf-8-bom', hadBOM: true });
  });

  it('detects UTF-16LE BOM', () => {
    expect(detectEncoding(Uint8Array.from([0xff, 0xfe, 0x41, 0x00])))
      .toEqual({ encoding: 'utf-16le', hadBOM: true });
  });

  it('detects UTF-16BE BOM', () => {
    expect(detectEncoding(Uint8Array.from([0xfe, 0xff, 0x00, 0x41])))
      .toEqual({ encoding: 'utf-16be', hadBOM: true });
  });

  it('defaults to UTF-8 without BOM', () => {
    expect(detectEncoding(Uint8Array.from([0x41, 0x42, 0x43])))
      .toEqual({ encoding: 'utf-8', hadBOM: false });
  });
});

describe('decodeBytes', () => {
  it('decodes UTF-8', () => {
    expect(decodeBytes(Uint8Array.from([0x48, 0x69]), 'utf-8')).toBe('Hi');
  });

  it('decodes UTF-8 BOM', () => {
    expect(decodeBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]), 'utf-8-bom')).toBe('A');
  });

  it('decodes UTF-16LE', () => {
    expect(decodeBytes(Uint8Array.from([0x41, 0x00, 0x42, 0x00]), 'utf-16le')).toBe('AB');
  });

  it('decodes UTF-16BE', () => {
    expect(decodeBytes(Uint8Array.from([0x00, 0x41, 0x00, 0x42]), 'utf-16be')).toBe('AB');
  });
});

describe('sniffFormat', () => {
  it('detects W3C from #Fields directive', () => {
    expect(sniffFormat(['#Fields: date time c-ip'])).toMatchObject({ format: 'w3c', headerLine: 0 });
  });

  it('detects JSON-lines from object-per-line', () => {
    expect(sniffFormat(['{"a":1}', '{"a":2}'])).toMatchObject({ format: 'json-lines' });
  });

  it('detects JSON-array from [ ... ]', () => {
    expect(sniffFormat(['[{"a":1},{"a":2}]'])).toMatchObject({ format: 'json-array' });
  });

  it('detects TSV from tab-separated first row', () => {
    expect(sniffFormat(['a\tb\tc', '1\t2\t3'])).toMatchObject({ format: 'tsv' });
  });

  it('detects CSV from comma-separated first row', () => {
    expect(sniffFormat(['a,b,c', '1,2,3'])).toMatchObject({ format: 'csv' });
  });

  it('detects CLF from Apache log line', () => {
    const lines = ['127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET / HTTP/1.0" 200 2326'];
    expect(sniffFormat(lines)).toMatchObject({ format: 'clf' });
  });

  it('detects key-value from k=v pairs', () => {
    const lines = ['a=1 b=2 c=3', 'a=4 b=5 c=6'];
    expect(sniffFormat(lines)).toMatchObject({ format: 'key-value' });
  });
});

describe('extractW3C', () => {
  it('extracts columns and rows from #Fields directive', () => {
    const lines = [
      '#Software: IIS 10.0',
      '#Fields: date time cs-uri-stem sc-status time-taken c-ip',
      '2025-10-26 14:23:50 /searchresult 200 100 127.0.0.1',
    ];
    const { columns, rows } = extractW3C(lines, 1);
    expect(columns).toEqual(['date', 'time', 'cs-uri-stem', 'sc-status', 'time-taken', 'c-ip']);
    expect(rows).toHaveLength(1);
    expect(rows[0][2]).toBe('/searchresult');
    expect(rows[0][3]).toBe('200');
  });

  it('skips comment and empty lines', () => {
    const lines = [
      '#Fields: date time c-ip',
      '# a comment',
      '',
      '2025-10-26 14:23:50 /foo 127.0.0.1',
    ];
    const { rows } = extractW3C(lines, 0);
    expect(rows).toHaveLength(1);
  });
});

describe('extractDelimited', () => {
  it('extracts TSV', () => {
    const lines = ['a\tb\tc', '1\t2\t3'];
    const { columns, rows } = extractDelimited(lines, 0, '\t');
    expect(columns).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toEqual(['1', '2', '3']);
  });

  it('extracts CSV with headers', () => {
    const lines = ['date,status,uri', '2025-10-26,200,/api'];
    const { columns, rows } = extractDelimited(lines, 0, ',');
    expect(columns).toEqual(['date', 'status', 'uri']);
    expect(rows[0]).toEqual(['2025-10-26', '200', '/api']);
  });
});

describe('extractJsonLines', () => {
  it('extracts columns and rows from JSON-lines', () => {
    const text = '{"a":1,"b":2}\n{"a":3,"b":4}';
    const { columns, rows } = extractJsonLines(text);
    expect(columns).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('handles missing keys as empty', () => {
    const text = '{"a":1}\n{"a":2,"b":3}';
    const { columns, rows } = extractJsonLines(text);
    expect(columns).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', ''], ['2', '3']]);
  });

  it('handles nested objects as JSON strings', () => {
    const text = '{"a":{"nested":true}}';
    const { rows } = extractJsonLines(text);
    expect(rows[0][0]).toBe('{"nested":true}');
  });
});

describe('extractCLF', () => {
  it('extracts Apache Combined Log Format', () => {
    const lines = ['127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET / HTTP/1.0" 200 2326'];
    const { columns, rows } = extractCLF(lines);
    expect(columns).toEqual(['host', 'ident', 'user', 'timestamp', 'method', 'uri', 'protocol', 'status', 'bytes', 'referer', 'user_agent']);
    expect(rows[0]).toEqual(['127.0.0.1', '-', 'frank', '10/Oct/2000:13:55:36 -0700', 'GET', '/', 'HTTP/1.0', '200', '2326', '', '']);
  });
});

describe('extractKeyValue', () => {
  it('extracts key=value pairs', () => {
    const lines = ['a=1 b=2 c=3', 'a=4 b=5 c=6'];
    const { columns, rows } = extractKeyValue(lines);
    expect(columns).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([['1', '2', '3'], ['4', '5', '6']]);
  });

  it('handles quoted values with spaces', () => {
    const lines = ['a="hello world" b=2'];
    const { columns, rows } = extractKeyValue(lines);
    expect(columns).toEqual(['a', 'b']);
    expect(rows[0]).toEqual(['hello world', '2']);
  });
});

describe('frame (integration)', () => {
  it('frames W3C input end-to-end', () => {
    const input = '#Fields: date time c-ip sc-status\n2025-10-26 14:23:50 127.0.0.1 200';
    const r = frame(input);
    expect(r.format).toBe('w3c');
    expect(r.columns).toEqual(['date', 'time', 'c-ip', 'sc-status']);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it('frames CSV input', () => {
    const input = 'date,status,uri\n2025-10-26,200,/api';
    const r = frame(input);
    expect(r.format).toBe('csv');
    expect(r.columns).toEqual(['date', 'status', 'uri']);
    expect(r.rows).toHaveLength(1);
  });

  it('frames JSON-lines input', () => {
    const input = '{"a":1,"b":2}\n{"a":3}';
    const r = frame(input);
    expect(r.format).toBe('json-lines');
    expect(r.columns).toContain('a');
    expect(r.columns).toContain('b');
    expect(r.rows).toHaveLength(2);
  });

  it('returns warnings for empty input', () => {
    const r = frame('');
    expect(r.warnings).toContain('no data rows found');
  });

  it('returns warnings for unknown format', () => {
    const r = frame('just some text without structure');
    expect(r.format).toBe('unknown');
    expect(r.warnings).toContain('unknown format — treating as single-column text');
  });
});
