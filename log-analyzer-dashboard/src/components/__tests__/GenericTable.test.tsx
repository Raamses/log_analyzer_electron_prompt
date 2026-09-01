import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  describe('virtualization windowing (regression: "huge empty gap" bug)', () => {
    // Bug: `containerHeight` was only ever used in the visible-row-count MATH
    // (Math.ceil(containerHeight / rowHeight) + 2) — never applied as an
    // actual CSS height on the scrollable div. Without a real bounded height,
    // `overflow-auto` never engages (the box just grows to fit its content
    // instead of scrolling), so `scrollTop` stays frozen at 0 forever and
    // only the first ~N rows ever render — inside a spacer div still sized
    // for the FULL row count. Result: a handful of rows at the top, a huge
    // blank gap, then the footer. jsdom doesn't compute real layout, so this
    // can't be caught by asserting pixels are visible — instead assert the
    // two things that actually determine correctness: (1) the scroll
    // container has a real height style applied, and (2) the number of
    // rendered row elements is bounded by that height, not by the full
    // dataset size.
    const makeBigDataset = (rowCount: number) => {
      const stores = new Map();
      stores.set('ts', { get: (i: number) => String(1761488630000 + i) });
      stores.set('status', { get: () => 200 });
      stores.set('uri', { get: (i: number) => `/api/${i}` });
      return makeDataset({
        columns: [
          { key: 'ts', sourceName: 'timestamp', label: 'Timestamp', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
          { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
          { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 2, nullable: false, confidence: 1, derived: false },
        ],
        stores: stores as any,
        rowCount,
        index: new Uint32Array(Array.from({ length: rowCount }, (_, i) => i)),
      });
    };

    it('applies containerHeight as a real CSS height on the scroll container', () => {
      render(<GenericTable dataset={makeBigDataset(1000)} rowHeight={36} containerHeight={400} />);
      const scrollContainer = screen.getByTestId('table-scroll-container');
      expect(scrollContainer.style.height).toBe('400px');
    });

    it('renders far fewer row elements than the dataset size (windowed, not all 1000)', () => {
      render(<GenericTable dataset={makeBigDataset(1000)} rowHeight={36} containerHeight={400} />);
      const rows = screen.getAllByTestId('table-row');
      // ceil(400/36) + 2 = 13 rows expected; generous upper bound to avoid
      // coupling the test to the exact overscan constant.
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(30);
    });

    it('scrolling the container advances which rows are rendered', async () => {
      render(<GenericTable dataset={makeBigDataset(1000)} rowHeight={36} containerHeight={400} />);
      const scrollContainer = screen.getByTestId('table-scroll-container');

      expect(screen.getByText('/api/0')).toBeTruthy();
      expect(screen.queryByText('/api/500')).toBeNull();

      // jsdom doesn't implement real scrolling — fire the scroll event
      // directly, at the position row 500 would be at (500 * 36 = 18000px).
      fireEvent.scroll(scrollContainer, { target: { scrollTop: 18000 } });

      expect(await screen.findByText('/api/500')).toBeTruthy();
      expect(screen.queryByText('/api/0')).toBeNull();
    });
  });
});
