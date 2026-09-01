import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogAnalyzer } from '../LogAnalyzer';
import type { Dataset } from '../../lib/types';

// Integration tests for the actual bug reported: LogAnalyzer computed a query
// filter and owned its own column-visibility state, but never passed either
// into GenericTable — so typing a filter, or using the command palette's
// "Hide X", visibly did nothing. GenericTable's own tests can't catch this
// class of bug: it always tested GenericTable in isolation with props it was
// handed directly, never through the actual LogAnalyzer wiring that was broken.
const makeDataset = (): Dataset => {
  const uris = ['/api/search', '/api/missing', '/api/health'];
  const statuses = [200, 404, 200];
  const stores = new Map();
  stores.set('ts', { get: (i: number) => String(1761488630000 + i) });
  stores.set('status', { get: (i: number) => statuses[i] });
  stores.set('uri', { get: (i: number) => uris[i] });

  return {
    columns: [
      { key: 'ts', sourceName: 'time', label: 'Time', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
      { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
      { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 2, nullable: false, confidence: 1, derived: false },
    ],
    stores: stores as any,
    rowCount: uris.length,
    index: new Uint32Array(uris.map((_, i) => i)),
    schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
    meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: uris.length, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
  };
};

describe('LogAnalyzer', () => {
  it('all rows visible before any filter is applied', () => {
    render(<LogAnalyzer dataset={makeDataset()} />);
    expect(screen.getByText('/api/search')).toBeTruthy();
    expect(screen.getByText('/api/missing')).toBeTruthy();
    expect(screen.getByText('/api/health')).toBeTruthy();
  });

  it('typing a query into the query bar actually filters the rendered rows', async () => {
    const user = userEvent.setup();
    render(<LogAnalyzer dataset={makeDataset()} />);

    const input = screen.getByPlaceholderText(/status >= 500/);
    await user.type(input, 'status = 404');

    expect(await screen.findByText('/api/missing')).toBeTruthy();
    expect(screen.queryByText('/api/search')).toBeNull();
    expect(screen.queryByText('/api/health')).toBeNull();
  });

  it('clearing the query restores all rows', async () => {
    const user = userEvent.setup();
    render(<LogAnalyzer dataset={makeDataset()} />);

    const input = screen.getByPlaceholderText(/status >= 500/);
    await user.type(input, 'status = 404');
    expect(screen.queryByText('/api/search')).toBeNull();

    await user.clear(input);
    expect(await screen.findByText('/api/search')).toBeTruthy();
    expect(screen.getByText('/api/missing')).toBeTruthy();
    expect(screen.getByText('/api/health')).toBeTruthy();
  });

  it('command palette "Hide <column>" actually removes the column from the table', async () => {
    const user = userEvent.setup();
    render(<LogAnalyzer dataset={makeDataset()} />);

    // Column header "Time" is visible before hiding.
    expect(screen.getAllByText('Time').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '⌘K' }));
    await user.click(screen.getByText('Hide Time'));

    expect(screen.queryByText('Time')).toBeNull();
    // The other columns are untouched.
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('URI').length).toBeGreaterThan(0);
  });

  it('command palette "Show all columns" restores a hidden column', async () => {
    const user = userEvent.setup();
    render(<LogAnalyzer dataset={makeDataset()} />);

    await user.click(screen.getByRole('button', { name: '⌘K' }));
    await user.click(screen.getByText('Hide Time'));
    expect(screen.queryByText('Time')).toBeNull();

    await user.click(screen.getByRole('button', { name: '⌘K' }));
    await user.click(screen.getByText('Show all columns'));

    expect(screen.getAllByText('Time').length).toBeGreaterThan(0);
  });
});
