import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import type { Dataset } from '../lib/types';

// ingestLogs spawns a real Web Worker via `new Worker(new URL(...))` — not
// meaningfully testable in jsdom, and not what this suite is verifying anyway.
// The dialect/schema/normalize logic it wraps is already covered directly in
// src/lib/__tests__/. What's under test here is App.tsx's own orchestration:
// does it call ingestLogs once per selected file, merge when there's more
// than one, and surface errors without crashing.
vi.mock('../lib/ingest', () => ({
  ingestLogs: vi.fn(),
}));

import { ingestLogs } from '../lib/ingest';

const makeDataset = (label: string, rowCount: number): Dataset => {
  const stores = new Map();
  stores.set('uri', { get: (i: number) => `/${label}/${i}` });
  return {
    columns: [
      { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 0, nullable: false, confidence: 1, derived: false },
    ],
    stores: stores as any,
    rowCount,
    index: new Uint32Array(Array.from({ length: rowCount }, (_, i) => i)),
    schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
    meta: { file: `${label}.log`, bytes: 100, parsedAt: new Date(), lineCount: rowCount, skipped: 0, warnings: [], sampled: false, datasetId: label, alignmentKeys: [] },
  };
};

function makeFile(name: string): File {
  return new File(['#Fields: a b\n1 2\n'], name, { type: 'text/plain' });
}

describe('App — file loading and multi-file merge orchestration', () => {
  beforeEach(() => {
    vi.mocked(ingestLogs).mockReset();
  });

  it('loads a single file without merging (no source_file column, unchanged single-file behavior)', async () => {
    vi.mocked(ingestLogs).mockResolvedValue(makeDataset('a', 3));
    render(<App />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('a.log')] } });

    await waitFor(() => expect(screen.getByText(/a\.log/)).toBeTruthy());
    expect(ingestLogs).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/files merged/)).toBeNull();
  });

  it('selecting multiple files ingests each and merges them into one dataset', async () => {
    vi.mocked(ingestLogs)
      .mockResolvedValueOnce(makeDataset('day0', 3))
      .mockResolvedValueOnce(makeDataset('day1', 4));
    render(<App />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('day0.log'), makeFile('day1.log')] } });

    // "7 rows" appears twice (App.tsx's header line and GenericTable's own
    // toolbar both show it) — getAllByText, not getByText.
    await waitFor(() => expect(screen.getAllByText(/7 rows/).length).toBeGreaterThan(0));
    expect(ingestLogs).toHaveBeenCalledTimes(2);
    // The real mergeDatasets ran (not mocked) — confirms the merged dataset
    // actually reached the table, not just that ingestLogs was called twice.
    expect(screen.getByText(/2 files merged/)).toBeTruthy();
  });

  it('an incompatible-schema merge surfaces as an error, not a crash', async () => {
    const a = makeDataset('a', 2);
    const b: Dataset = {
      ...makeDataset('b', 2),
      columns: [
        { key: 'different', sourceName: 'different', label: 'Different', role: 'unknown', type: 'string', index: 0, nullable: true, confidence: 0.5, derived: false },
      ],
    };
    vi.mocked(ingestLogs).mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    render(<App />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('a.log'), makeFile('b.log')] } });

    await waitFor(() => expect(screen.getByText(/different columns/i)).toBeTruthy());
    // No dataset got through to the table.
    expect(screen.queryByText(/rows/)).toBeNull();
  });

  it('a failure mid-batch (e.g. file 2 of 3) surfaces as an error, not a partial dataset', async () => {
    vi.mocked(ingestLogs)
      .mockResolvedValueOnce(makeDataset('a', 2))
      .mockRejectedValueOnce(new Error('Invalid or unsupported log format.'));
    render(<App />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('a.log'), makeFile('bad.log')] } });

    await waitFor(() => expect(screen.getByText(/Invalid or unsupported log format/)).toBeTruthy());
    expect(screen.queryByText(/rows/)).toBeNull();
  });
});
