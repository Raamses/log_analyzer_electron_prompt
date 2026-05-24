const fs = require('fs');
const content = fs.readFileSync('log-analyzer-dashboard/src/utils/parser.ts', 'utf8');

const rewrite = content.replace(
  `    const pairs = query.split('&');`,
  `    const pairs = query.split('&');`
);
