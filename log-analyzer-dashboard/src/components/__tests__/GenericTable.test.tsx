import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenericTable from '../GenericTable';
import type { Dataset } from '../../lib/types';

const makeDataset = (overrides: Partial<Dataset> = {}): Dataset => {
  const stores = new Map();
  stores.set('ts', { get: (i: number) => ['1761488630000', '1761488631000'][i] });
  stores.set('status', { get: (i: number) => [200, 404][i] });
  stores.set('uri', { get: (i: number) => ['/api/search', '/api/missing'][i] });

  return {
    columns: [
      { key: 'ts', sourceName: 'timestamp', label: 'Timestamp', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
      { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
      { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 2, nullable: false, confidence: 1, derived: false },
    ],
    stores: stores as any,
    rowCount: 2,
    index: new Uint32Array([0, 1]),
    schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
    meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: 2, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
    ...overrides,
  };
};

describe('GenericTable', () => {
  it('renders without crashing', () => {
    render(<GenericTable dataset={makeDataset()} />);
    expect(screen.getByText('2 entries')).toBeTruthy();
  });

  it('renders column headers', () => {
    render(<GenericTable dataset={makeDataset()} />);
    expect(screen.getAllByText('Timestamp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('URI').length).toBeGreaterThan(0);
  });

  it('renders formatted values', () => {
    render(<GenericTable dataset={makeDataset()} />);
    expect(screen.getByText('/api/search')).toBeTruthy();
    expect(screen.getByText('/api/missing')).toBeTruthy();
  });

  it('formats status with badge', () => {
    const { container } = render(<GenericTable dataset={makeDataset()} />);
    expect(container.textContent).toContain('200');
    expect(container.textContent).toContain('404');
  });

  it('shows column count in footer', () => {
    render(<GenericTable dataset={makeDataset()} />);
    expect(screen.getByText('3 columns')).toBeTruthy();
  });

  it('calls onSort when header is clicked', async () => {
    const onSort = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<GenericTable dataset={makeDataset()} onSort={onSort} />);
    const header = container.querySelector('.bg-slate-900\\/60');
    expect(header).toBeTruthy();
    const clickable = header!.querySelector('.cursor-pointer');
    expect(clickable).toBeTruthy();
    await user.click(clickable!);
    expect(onSort).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'asc' })
    );
  });

  it('opens detail drawer on row click', async () => {
    const user = userEvent.setup();
    render(<GenericTable dataset={makeDataset()} />);
    await user.click(screen.getByText('/api/search'));
    expect(screen.getByText('Row Detail')).toBeTruthy();
  });

  it('renders many rows with virtualization', () => {
    const stores = new Map();
    stores.set('ts', { get: (i: number) => String(1761488630000 + i) });
    stores.set('status', { get: () => 200 });
    stores.set('uri', { get: (i: number) => `/api/${i}` });

    const ds = makeDataset({
      columns: [
        { key: 'ts', sourceName: 'timestamp', label: 'Timestamp', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
        { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
        { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 2, nullable: false, confidence: 1, derived: false },
      ],
      stores: stores as any,
      rowCount: 1000,
      index: new Uint32Array(Array.from({ length: 1000 }, (_, i) => i)),
    });
    render(<GenericTable dataset={ds} containerHeight={400} />);
    expect(screen.getByText('1,000 entries')).toBeTruthy();
  });
});
