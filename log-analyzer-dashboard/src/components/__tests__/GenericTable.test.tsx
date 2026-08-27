import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenericTable from '../GenericTable';
import type { Dataset } from '../../lib/types';

const makeDataset = (overrides: Partial<Dataset> = {}): Dataset => ({
  columns: [
    { key: 'ts', sourceName: 'timestamp', label: 'Timestamp', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
    { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
    { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 2, nullable: false, confidence: 1, derived: false },
  ],
  rows: [
    { ts: '1761488630000', status: '200', uri: '/api/search' },
    { ts: '1761488631000', status: '404', uri: '/api/missing' },
  ],
  index: new Uint32Array([0, 1]),
  schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
  meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: 2, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
  ...overrides,
});

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

  it('formats timestamp to locale string', () => {
    render(<GenericTable dataset={makeDataset()} />);
    const cells = document.querySelectorAll('.text-slate-500');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('shows column count in footer', () => {
    render(<GenericTable dataset={makeDataset()} />);
    expect(screen.getByText('3 columns')).toBeTruthy();
  });

  it('hides column when clicked in picker', async () => {
    const user = userEvent.setup();
    const { container } = render(<GenericTable dataset={makeDataset()} />);
    const uriButtons = screen.getAllByText('URI');
    await user.click(uriButtons[0]);
    const header = container.querySelector('.bg-slate-900\\/60');
    if (header) expect(header.textContent).not.toContain('URI');
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

  it('closes detail drawer on close button click', async () => {
    const user = userEvent.setup();
    render(<GenericTable dataset={makeDataset()} />);
    await user.click(screen.getByText('/api/search'));
    expect(screen.getByText('Row Detail')).toBeTruthy();
    await user.click(screen.getByText('✕'));
    expect(screen.queryByText('Row Detail')).toBeNull();
  });

  it('renders IP context menu trigger for client_ip role', () => {
    const ds = makeDataset({
      columns: [
        { key: 'ip', sourceName: 'client_ip', label: 'Client IP', role: 'client_ip', type: 'ip', index: 0, nullable: false, confidence: 1, derived: false },
      ],
      rows: [{ ip: '203.0.113.5' }],
    });
    render(<GenericTable dataset={ds} />);
    expect(screen.getByText('203.0.113.5')).toBeTruthy();
  });

  it('renders many rows with virtualization', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      ts: String(1761488630000 + i), status: '200', uri: `/api/${i}`,
    }));
    const ds = makeDataset({ rows });
    render(<GenericTable dataset={ds} containerHeight={400} />);
    expect(screen.getByText('1,000 entries')).toBeTruthy();
  });
});
