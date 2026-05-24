const fs = require('fs');
let code = fs.readFileSync('log-analyzer-dashboard/src/utils/parser.ts', 'utf8');

const oldCode = `    // 1. Try parsing from SearchQuery (case-insensitive) parameter first
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        const keyLower = pair[0].toLowerCase();
        if (keyLower === 'searchquery' && pair[1]) {
            try {
                const decodedVal = safeDecodeURIComponent(pair[1]);
                // Format: HOTELCODE/STARTDATE/ENDDATE/COMPOSITION/FLIGHTFROM...
                const parts = decodedVal.split('/');
                if (parts.length >= 3) {
                    result.hotelCode = parts[0];
                    checkInStr = parts[1];
                    checkOutStr = parts[2];

                    if (parts.length >= 4) {
                        result.composition = parts[3];
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
            break;
        }
    }`;

const newCode = `    // 1. Try parsing from SearchQuery (case-insensitive) parameter first
    for (let i = 0; i < pairs.length; i++) {
        const eqIdx = pairs[i].indexOf('=');
        if (eqIdx === -1) continue;
        const keyLower = pairs[i].substring(0, eqIdx).toLowerCase();
        const val = pairs[i].substring(eqIdx + 1);
        if (keyLower === 'searchquery' && val) {
            try {
                const decodedVal = safeDecodeURIComponent(val);
                // Format: HOTELCODE/STARTDATE/ENDDATE/COMPOSITION/FLIGHTFROM...
                const parts = decodedVal.split('/');
                if (parts.length >= 3) {
                    result.hotelCode = parts[0];
                    checkInStr = parts[1];
                    checkOutStr = parts[2];

                    if (parts.length >= 4) {
                        result.composition = parts[3];
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
            break;
        }
    }`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('log-analyzer-dashboard/src/utils/parser.ts', code);
