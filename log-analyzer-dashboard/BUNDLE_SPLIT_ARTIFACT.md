# Bundle Size Code-Splitting Fix

**Model:** Claude (delegation FAILED — OAuth expired), Gemini (delegation FAILED — IneligibleTierError). Analysis performed by builder (glm-5.2) after both delegated models failed. See "Delegation Status" section.

**Commit:** 885ad6f
**Branch:** feat/generic-log-analyzer
**Date:** 2026-08-24

## Problem
The JS bundle was 705KB (gzip 204KB) — a single monolithic chunk with no code-splitting, no manualChunks, and no React.lazy anywhere.

## Root Causes
1. `vite.config.ts` was minimal: `defineConfig({ plugins: [react()] })` — no chunk splitting
2. All 14+ components imported eagerly in `App.tsx`, including heavy chart components (recharts) that only render after a file is parsed
3. Build was broken: `FilterChips` imported as default in `App.tsx` but exported as named; `SortState` imported from `lib/types` but defined in `GenericTable.tsx`

## Changes

### 1. `vite.config.ts` — manualChunks
```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'recharts-vendor': ['recharts'],
        'lucide-vendor': ['lucide-react'],
      },
    },
  },
  chunkSizeWarningLimit: 300,
}
```

### 2. `src/App.tsx` — React.lazy + Suspense
Converted 7 components to lazy imports (only rendered after `analytics && isParsed`):
- ErrorSummary
- TrafficSegmentation
- ServerThroughput
- VirtualizedLogViewer
- StatusDistributionChart
- ThroughputChart (pulls recharts-vendor)
- LatencyOutliers

Wrapped in `<Suspense fallback={<LazyFallback />}>`.

### 3. Import Fixes
- `App.tsx`: `import FilterChips from '...'` → `import { FilterChips } from '...'`
- `LogAnalyzer.tsx`: `import type { Dataset, SortState } from '../lib/types'` → `import type { Dataset } from '../lib/types'` + `import type { SortState, ColumnState } from './GenericTable'`
- `LogAnalyzer.tsx`: `import { GenericTable, type ColumnState } from './GenericTable'` → `import GenericTable from './GenericTable'`

## Bundle Size Results

| Chunk | Size | gzip | When loaded |
|-------|------|------|-------------|
| **index (initial)** | **241.93 KB** | **74.23 KB** | On page load |
| recharts-vendor | 385.44 KB | 111.91 KB | After file parsed (charts) |
| TrafficSegmentation | 36.21 KB | 7.93 KB | After file parsed |
| LatencyOutliers | 13.03 KB | 3.55 KB | After file parsed |
| react-vendor | 11.32 KB | 4.07 KB | On page load (shared) |
| lucide-vendor | 6.55 KB | 2.66 KB | On page load (shared) |
| VirtualizedLogViewer | 4.42 KB | 1.61 KB | After file parsed |
| ThroughputChart | 3.38 KB | 1.39 KB | After file parsed |
| StatusDistributionChart | 3.05 KB | 1.24 KB | After file parsed |
| ErrorSummary | 1.86 KB | 0.85 KB | After file parsed |
| ContextMenu | 1.13 KB | 0.63 KB | After file parsed |
| ServerThroughput | 0.90 KB | 0.42 KB | After file parsed |
| logParser.worker | 7.59 KB | — | On file upload |

**Initial bundle: 705KB → 241.93KB (66% reduction)**
**Initial gzip: 204KB → 74.23KB (64% reduction)**
**Target: <300KB initial — ✅ ACHIEVED**

## Verification
- `npx vite build` — passes ✅
- `npx vitest run` — 165/165 tests pass ✅
- Initial bundle 241.93 KB < 300 KB target ✅

## Delegation Status
- `~/.openclaw/bin/ask-claude --escalate --card 0c2162d4-3eb2-4567-8c38-137793f9bcd6` — FAILED: OAuth session expired and could not be refreshed
- `gemini -p "..."` — FAILED: IneligibleTierError (Gemini Code Assist for individuals no longer supported)
- Analysis was performed by builder (glm-5.2) after both delegated models failed. The analysis is based on direct reading of all source files and build output.