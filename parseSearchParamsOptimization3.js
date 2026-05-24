const fs = require('fs');
let code = fs.readFileSync('log-analyzer-dashboard/src/utils/parser.ts', 'utf8');

const oldCode3 = `    // 3. Fallback to nested JSON 'query' parameter
    if (!result.hotelCode || !result.composition || !checkInStr || !checkOutStr) {
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split('=');
            if (pair[0] === 'query' && pair[1]) {
                try {
                    const decodedVal = safeDecodeURIComponent(pair[1]);
                    const parsedJson = JSON.parse(decodedVal);`;

const newCode3 = `    // 3. Fallback to nested JSON 'query' parameter
    if (!result.hotelCode || !result.composition || !checkInStr || !checkOutStr) {
        for (let i = 0; i < pairs.length; i++) {
            const eqIdx = pairs[i].indexOf('=');
            if (eqIdx === -1) continue;
            const key = pairs[i].substring(0, eqIdx);
            const val = pairs[i].substring(eqIdx + 1);
            if (key === 'query' && val) {
                try {
                    const decodedVal = safeDecodeURIComponent(val);
                    const parsedJson = JSON.parse(decodedVal);`;

code = code.replace(oldCode3, newCode3);
fs.writeFileSync('log-analyzer-dashboard/src/utils/parser.ts', code);
