const fs = require('fs');
let code = fs.readFileSync('log-analyzer-dashboard/src/components/TrafficSegmentation.tsx', 'utf8');
code = code.replace("import { useState, useMemo, Fragment }", "import { useState, useMemo }");
fs.writeFileSync('log-analyzer-dashboard/src/components/TrafficSegmentation.tsx', code);
