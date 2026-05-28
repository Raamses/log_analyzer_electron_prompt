const p95_old = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(0.95 * sorted.length) - 1;
    return sorted[index];
};

const p99_old = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(0.99 * sorted.length) - 1;
    return sorted[index];
};

const quickSelect = (arr: number[], k: number): number => {
    if (arr.length === 0) return 0;
    const copy = [...arr]; // Create copy to avoid mutating original
    let left = 0;
    let right = copy.length - 1;

    while (left <= right) {
        let pivotIndex = partition(copy, left, right);
        if (pivotIndex === k) {
            return copy[k];
        } else if (pivotIndex < k) {
            left = pivotIndex + 1;
        } else {
            right = pivotIndex - 1;
        }
    }
    return copy[k];
};

const partition = (arr: number[], left: number, right: number): number => {
    const pivot = arr[right];
    let i = left;
    for (let j = left; j < right; j++) {
        if (arr[j] <= pivot) {
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
            i++;
        }
    }
    const temp = arr[i];
    arr[i] = arr[right];
    arr[right] = temp;
    return i;
};

const p95_new = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const index = Math.ceil(0.95 * arr.length) - 1;
    return quickSelect(arr, index);
};

const p99_new = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const index = Math.ceil(0.99 * arr.length) - 1;
    return quickSelect(arr, index);
};

// Generate test data
const generateData = (size: number) => {
    return Array.from({ length: size }, () => Math.floor(Math.random() * 5000));
};

console.log("Generating data...");
const arrays = [
    generateData(100),
    generateData(1000),
    generateData(10000),
    generateData(100000),
];

console.log("\n--- Benchmarking P95 ---");
for (const arr of arrays) {
    console.log(`\nArray size: ${arr.length}`);

    // Warm up
    p95_old(arr);
    p95_new(arr);

    let start = performance.now();
    for(let i=0; i<100; i++) p95_old(arr);
    let end = performance.now();
    const oldTime = (end - start) / 100;
    console.log(`Old sort(): ${oldTime.toFixed(4)}ms per operation`);

    start = performance.now();
    for(let i=0; i<100; i++) p95_new(arr);
    end = performance.now();
    const newTime = (end - start) / 100;
    console.log(`New quickSelect: ${newTime.toFixed(4)}ms per operation`);
    console.log(`Improvement: ${((oldTime - newTime) / oldTime * 100).toFixed(2)}%`);
}
