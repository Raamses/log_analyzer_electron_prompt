const { performance } = require('perf_hooks');

// Generate mock logs
const MOCK_SIZE = 500000;
const ITERATIONS = 100;
console.log(`Generating ${MOCK_SIZE} mock logs for benchmarking...`);

const allLogs = Array.from({ length: MOCK_SIZE }, (_, i) => ({
  statusCode: 200 + (i % 10) * 10 // e.g. 200, 210, 220, ..., 290
}));

console.log(`Running ${ITERATIONS} iterations of each approach...`);

// Approach 1: Current implementation
const startCurrent = performance.now();
let resultCurrent;
for (let i = 0; i < ITERATIONS; i++) {
  resultCurrent = Array.from(new Set(allLogs.map(l => l.statusCode))).sort();
}
const endCurrent = performance.now();
const timeCurrent = endCurrent - startCurrent;

// Approach 2: Optimized implementation (Single-pass loop + numeric sort)
const startOptimized = performance.now();
let resultOptimized;
for (let i = 0; i < ITERATIONS; i++) {
  const codesSet = new Set();
  for (let j = 0; j < allLogs.length; j++) {
    codesSet.add(allLogs[j].statusCode);
  }
  resultOptimized = Array.from(codesSet).sort((a, b) => a - b);
}
const endOptimized = performance.now();
const timeOptimized = endOptimized - startOptimized;

console.log('\n--- Benchmark Results ---');
console.log(`Current Approach:   ${timeCurrent.toFixed(2)} ms`);
console.log(`Optimized Approach: ${timeOptimized.toFixed(2)} ms`);
const improvement = ((timeCurrent - timeOptimized) / timeCurrent) * 100;
const speedup = timeCurrent / timeOptimized;
console.log(`Improvement:        ${improvement.toFixed(2)}% (${speedup.toFixed(2)}x faster)`);
console.log('--- Correctness Check ---');
console.log(`Current length:   ${resultCurrent.length}`);
console.log(`Optimized length: ${resultOptimized.length}`);
