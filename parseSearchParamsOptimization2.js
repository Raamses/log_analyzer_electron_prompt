const fs = require('fs');
let code = fs.readFileSync('log-analyzer-dashboard/src/utils/parser.ts', 'utf8');

const oldCode2 = `    if (!result.hotelCode || !result.composition || !checkInStr || !checkOutStr) {
        let tempAdults = '0', tempChildren = '0', tempInfants = '0';
        let hasGuestParams = false;

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split('=');
            if (!pair[1]) continue;

            const key = pair[0];
            const val = safeDecodeURIComponent(pair[1]);`;

const newCode2 = `    if (!result.hotelCode || !result.composition || !checkInStr || !checkOutStr) {
        let tempAdults = '0', tempChildren = '0', tempInfants = '0';
        let hasGuestParams = false;

        for (let i = 0; i < pairs.length; i++) {
            const eqIdx = pairs[i].indexOf('=');
            if (eqIdx === -1) continue;

            const key = pairs[i].substring(0, eqIdx);
            const val = safeDecodeURIComponent(pairs[i].substring(eqIdx + 1));
            if (!val) continue;`;

code = code.replace(oldCode2, newCode2);
fs.writeFileSync('log-analyzer-dashboard/src/utils/parser.ts', code);
