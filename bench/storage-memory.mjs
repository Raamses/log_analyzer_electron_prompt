// Compare storage strategies at 500k x 40. Shared key order = no per-object dict.
//
// MEASUREMENT NOTE (corrected 2026-08-25 after Gemini adversarial review):
// The first version of this benchmark measured `heapUsed` ONLY. TypedArray
// backing stores live in C++ ArrayBuffer memory, tracked under
// `arrayBuffers`/`external` — NOT `heapUsed`. That made the columnar strategy
// look like ~1MB when its real footprint is ~80-100MB of buffers.
// Total = heapUsed + arrayBuffers. Both are now reported separately.
const COLS=40, ROWS=500_000;
const names=Array.from({length:COLS},(_,i)=>`col_${i}`);
function val(i,c){
  if(c%4===0) return 200+(i%300);
  if(c%4===1) return (i%10000)/7;
  if(c%4===2) return `/api/endpoint/${i%500}`;
  return `val-${i%1000}`;
}
function snap(){
  const m=process.memoryUsage();
  return { heap:m.heapUsed, buf:m.arrayBuffers, ext:m.external };
}
function measure(label, build){
  if(global.gc){global.gc();global.gc();}
  const b=snap();
  const d=build();
  if(global.gc){global.gc();global.gc();}
  const a=snap();
  const heapMB=(a.heap-b.heap)/1048576;
  const bufMB=(a.buf-b.buf)/1048576;
  const totalMB=heapMB+bufMB;
  console.log(
    `${label.padEnd(34)} total ${totalMB.toFixed(0).padStart(5)} MB` +
    `  (heap ${heapMB.toFixed(0).padStart(5)} MB + buffers ${bufMB.toFixed(0).padStart(5)} MB)` +
    `  ${(totalMB*1048576/ROWS).toFixed(0).padStart(4)} B/row`
  );
  return d;
}

// A: row-objects — the current Dataset representation
measure('A: Array<Record>', ()=>{
  const r=new Array(ROWS);
  for(let i=0;i<ROWS;i++){ const o={}; for(let c=0;c<COLS;c++) o[names[c]]=val(i,c); r[i]=o; }
  return r;
});

// B: row = flat Array (positional, no keys at all)
measure('B: Array-of-Arrays', ()=>{
  const r=new Array(ROWS);
  for(let i=0;i<ROWS;i++){ const a=new Array(COLS); for(let c=0;c<COLS;c++) a[c]=val(i,c); r[i]=a; }
  return r;
});

// C: columnar w/ typed arrays + interned strings
measure('C: columnar + dict-encoded strings', ()=>{
  const cols=[];
  for(let c=0;c<COLS;c++){
    if(c%4===0) cols.push(new Int32Array(ROWS));
    else if(c%4===1) cols.push(new Float64Array(ROWS));
    else cols.push({codes:new Int32Array(ROWS), dict:[], map:new Map()});
  }
  for(let i=0;i<ROWS;i++) for(let c=0;c<COLS;c++){
    const col=cols[c], v=val(i,c);
    if(col instanceof Int32Array || col instanceof Float64Array) col[i]=v;
    else { let code=col.map.get(v); if(code===undefined){ code=col.dict.length; col.dict.push(v); col.map.set(v,code);} col.codes[i]=code; }
  }
  return cols;
});

// D: columnar, REALISTIC cardinality — one 100%-unique request_id column.
// Gemini's review: real logs carry trace/request ids that defeat dict encoding.
// This models 37 low-cardinality columns + 3 unique-per-row string columns.
measure('D: columnar + 3 unique-id cols', ()=>{
  const cols=[];
  for(let c=0;c<COLS;c++){
    if(c<3) cols.push({ raw:new Array(ROWS) });               // unique ids, flat strings
    else if(c%4===0) cols.push(new Int32Array(ROWS));
    else if(c%4===1) cols.push(new Float64Array(ROWS));
    else cols.push({codes:new Int32Array(ROWS), dict:[], map:new Map()});
  }
  for(let i=0;i<ROWS;i++) for(let c=0;c<COLS;c++){
    const col=cols[c];
    if(c<3){ col.raw[i]=`req-${i}-${(i*2654435761)%4294967296}`; continue; }
    const v=val(i,c);
    if(col instanceof Int32Array || col instanceof Float64Array) col[i]=v;
    else { let code=col.map.get(v); if(code===undefined){ code=col.dict.length; col.dict.push(v); col.map.set(v,code);} col.codes[i]=code; }
  }
  return cols;
});

// Run: node --expose-gc bench/storage-memory.mjs
//
// Result 2026-08-24 (heapUsed only — WRONG, missed ArrayBuffer memory):
//   Array<Record> 1116MB | AoA 512MB | columnar 1MB
//
// Result 2026-08-25 (heapUsed + arrayBuffers — corrected): see console output.
// See vault/decisions/2026-08-storage-strategy.md
