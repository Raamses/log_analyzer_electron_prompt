import { describe, it, expect } from 'vitest';
import {
  SCHEMA_REGISTRY, detectSchema, applySchema, inferSchema,
} from '../schema';

const cols = (s: string) => s.split('\t').map(c => c.replace(/"/g, '').trim());

describe('schema registry', () => {
  it('detects IIS W3C from sc-status column', () => {
    const cols = ['date', 'time', 'cs-uri-stem', 'sc-status', 'time-taken', 'c-ip'];
    expect(detectSchema(cols)?.id).toBe('iis-w3c');
  });

  it('detects IIS W3C from #Fields directive', () => {
    expect(detectSchema(['#Fields:', 'date', 'time'])?.id).toBe('iis-w3c');
  });

  it('detects Azure APGW from TimeGenerated', () => {
    const c = cols('TimeGenerated [UTC]\tHttpStatus\tRequestUri\tClientIp\tTimeTaken');
    expect(detectSchema(c)?.id).toBe('azure-apgw');
  });

  it('detects Cloudflare from EdgeStartTimestamp', () => {
    const c = cols('EdgeStartTimestamp\tEdgeResponseStatus\tClientIP\tClientRequestURI');
    expect(detectSchema(c)?.id).toBe('cloudflare-http');
  });

  it('returns null for unrecognized columns', () => {
    expect(detectSchema(['foo', 'bar', 'baz'])).toBeNull();
  });
});

describe('IIS schema mapping', () => {
  const raw = ['date', 'time', 'cs-uri-stem', 'cs-uri-query', 'sc-status',
    'time-taken', 'c-ip', 'cs-method', 'cs(User-Agent)', 'sc-bytes', 'cs-bytes'];
  const { columns, schema } = applySchema(
    SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!, raw,
  );

  it('maps every column to a role', () => {
    expect(columns).toHaveLength(raw.length);
  });

  it('maps sc-status to role status', () => {
    const c = columns.find(c => c.sourceName === 'sc-status');
    expect(c?.role).toBe('status');
    expect(c?.type).toBe('int');
  });

  it('maps X-Forwarded-For with priority 10 over c-ip (0)', () => {
    const xff = SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!
      .bindings['X-Forwarded-For'];
    const cip = SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!
      .bindings['c-ip'];
    expect(xff?.priority).toBe(10);
    expect(cip?.priority).toBe(0);
  });

  it('declares XFF as list with comma splitter', () => {
    const xff = SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!
      .bindings['X-Forwarded-For'];
    expect(xff?.multiplicity).toBe('list');
    expect(xff?.splitter).toBeDefined();
  });

  it('maps time-taken with unit ms', () => {
    const c = columns.find(c => c.sourceName === 'time-taken');
    const bind = schema.bindings.find(b => b.columnKey === c?.key);
    expect(bind?.unit).toBe('ms');
  });

  it('sets primary status to sc-status', () => {
    expect(schema.primary.status).toBeDefined();
    const col = columns.find(c => c.key === schema.primary.status);
    expect(col?.sourceName).toBe('sc-status');
  });
});

describe('Azure APGW schema mapping', () => {
  const raw = cols('TimeGenerated [UTC]\tHttpStatus\tRequestUri\tClientIp\tTimeTaken');
  const { columns, schema } = applySchema(
    SCHEMA_REGISTRY.find(s => s.id === 'azure-apgw')!, raw,
  );

  it('maps HttpStatus to role status', () => {
    const c = columns.find(c => c.sourceName === 'HttpStatus');
    expect(c?.role).toBe('status');
  });

  it('maps TimeTaken with unit s (seconds, normalised later)', () => {
    const c = columns.find(c => c.sourceName === 'TimeTaken');
    const bind = schema.bindings.find(b => b.columnKey === c?.key);
    expect(bind?.unit).toBe('s');
  });

  it('maps ClientIp to client_ip', () => {
    const c = columns.find(c => c.sourceName === 'ClientIp');
    expect(c?.role).toBe('client_ip');
  });
});

describe('Cloudflare schema mapping', () => {
  const entry = SCHEMA_REGISTRY.find(s => s.id === 'cloudflare-http')!;

  it('has three status bindings with distinct priorities', () => {
    const s = entry.bindings;
    expect(s['EdgeResponseStatus']?.role).toBe('status');
    expect(s['OriginResponseStatus']?.role).toBe('status');
    expect(s['CacheResponseStatus']?.role).toBe('status');
    expect(s['EdgeResponseStatus']?.priority).toBe(10);
    expect(s['OriginResponseStatus']?.priority).toBe(5);
    expect(s['CacheResponseStatus']?.priority).toBe(0);
  });

  it('sets primary status to EdgeResponseStatus (highest priority)', () => {
    const raw = cols('EdgeStartTimestamp\tEdgeResponseStatus\tOriginResponseStatus\tClientIP');
    const { columns, schema } = applySchema(entry, raw);
    const col = columns.find(c => c.key === schema.primary.status);
    expect(col?.sourceName).toBe('EdgeResponseStatus');
  });

  it('maps EdgeTimeToFirstByteMs with unit ms', () => {
    const bind = entry.bindings['EdgeTimeToFirstByteMs'];
    expect(bind?.role).toBe('latency_ms');
    expect(bind?.unit).toBe('ms');
  });
});

describe('inferSchema fallback', () => {
  it('infers timestamp role from time column', () => {
    const s = inferSchema(['timestamp', 'status', 'uri']);
    expect(s.bindings['timestamp']?.role).toBe('timestamp');
  });

  it('infers status role from http_status column', () => {
    const s = inferSchema(['http_status', 'client_ip']);
    expect(s.bindings['http_status']?.role).toBe('status');
  });

  it('infers client_ip role from XFF column', () => {
    const s = inferSchema(['X-Forwarded-For', 'other']);
    expect(s.bindings['X-Forwarded-For']?.role).toBe('client_ip');
  });

  it('returns unknown for unrecognized columns', () => {
    const s = inferSchema(['custom_field_xyz']);
    expect(s.bindings['custom_field_xyz']?.role).toBe('unknown');
  });

  it('produces a ColumnDef for every raw column', () => {
    const raw = ['time', 'status', 'custom1', 'custom2'];
    const { columns } = applySchema(inferSchema(raw), raw);
    expect(columns).toHaveLength(4);
  });

  it('infers status from values when name is generic', () => {
    const raw = ['col_a', 'col_b', 'col_c'];
    const sample = [
      ['200', 'GET', '/api/x'],
      ['500', 'POST', '/api/y'],
      ['404', 'GET', '/img/a.png'],
      ['200', 'GET', '/api/z'],
    ];
    const s = inferSchema(raw, sample);
    // col_a has HTTP status codes 200/500/404
    expect(s.bindings['col_a']?.role).toBe('status');
    // col_b has HTTP methods
    expect(s.bindings['col_b']?.role).toBe('method');
    // col_c has URIs starting with /
    expect(s.bindings['col_c']?.role).toBe('uri');
  });

  it('infers client_ip from values', () => {
    const raw = ['field1', 'field2'];
    const sample = [
      ['10.0.0.1', 'hello'],
      ['192.168.1.1', 'world'],
      ['172.16.0.1', 'foo'],
    ];
    const s = inferSchema(raw, sample);
    expect(s.bindings['field1']?.role).toBe('client_ip');
    expect(s.bindings['field2']?.role).toBe('unknown');
  });

  it('returns unknown when no role scores above threshold', () => {
    const raw = ['weird_col'];
    const sample = [['abc'], ['def'], ['ghi']];
    const s = inferSchema(raw, sample);
    expect(s.bindings['weird_col']?.role).toBe('unknown');
  });

  it('uses CellType appropriate to inferred role', () => {
    const raw = ['col_a'];
    const sample = [['200'], ['500'], ['404']];
    const s = inferSchema(raw, sample);
    expect(s.bindings['col_a']?.role).toBe('status');
    expect(s.bindings['col_a']?.type).toBe('int');
  });
});

describe('applySchema', () => {
  it('slugs keys deterministically', () => {
    const { columns } = applySchema(
      SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!,
      ['cs-uri-stem', 'sc-status'],
    );
    expect(columns[0].key).toBe('cs-uri-stem');
    expect(columns[1].key).toBe('sc-status');
  });

  it('handles duplicate column names', () => {
    const { columns } = applySchema(
      SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!,
      ['cs-uri-stem', 'cs-uri-stem', 'sc-status'],
    );
    expect(columns[0].key).toBe('cs-uri-stem');
    expect(columns[1].key).toBe('cs-uri-stem_2');
    expect(columns[2].key).toBe('sc-status');
  });

  it('sets confidence high for priority bindings, lower otherwise', () => {
    const { columns } = applySchema(
      SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!,
      ['X-Forwarded-For', 'cs-uri-stem'],
    );
    const xff = columns.find(c => c.sourceName === 'X-Forwarded-For');
    const uri = columns.find(c => c.sourceName === 'cs-uri-stem');
    expect(xff?.confidence).toBe(0.95);
    expect(uri?.confidence).toBe(0.7);
  });

  it('respects schema timezone declaration', () => {
    const { schema } = applySchema(
      SCHEMA_REGISTRY.find(s => s.id === 'iis-w3c')!,
      ['date', 'time'],
    );
    expect(schema.timezone).toBe('utc');
  });
});
