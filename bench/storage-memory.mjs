// Compare storage strategies at 500k x 40. Shared key order = no per-object dict.
const COLS=40, ROWS=500_000;
const names=Array.from({length:COLS},(_,i)=>`col_${i}`);
function val(i,c){
  if(c%4===0) return 200+(i%300);
  if(c%4===1) return (i%10000)/7;
  if(c%4===2) return `/api/endpoint/${i%500}`;
  return `val-${i%1000}`;
}
function measure(label, build){
  if(global.gc){global.gc();global.gc();}
  const b=process.memoryUsage().heapUsed;
  const d=build();
  if(global.gc){global.gc();global.gc();}
  const a=process.memoryUsage().heapUsed;
  console.log(`${label.padEnd(34)} ${((a-b)/1048576).toFixed(0).padStart(6)} MB   (${((a-b)/ROWS).toFixed(0)} B/row)`);
  return d;
}

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

// Run: node --expose-gc bench/storage-memory.mjs
// Result 2026-08-24 (500k x 40): Array<Record> 1116MB | AoA 512MB | columnar 1MB
// See vault/decisions/2026-08-storage-strategy.md
