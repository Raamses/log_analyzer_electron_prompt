#!/usr/bin/env node
/**
 * sanitize-logs.mjs — strip PII from log samples while PRESERVING STRUCTURE.
 *
 *   node scripts/sanitize-logs.mjs <input> [output]
 *   node scripts/sanitize-logs.mjs sample.log            # -> sample.sanitized.log
 *   node scripts/sanitize-logs.mjs --check sample.log    # report only, no write
 *
 * Design intent: what a parser needs is SHAPE (column count, delimiters,
 * quoting, encoding, timestamp format, empty markers, ragged lines) — not real
 * values. So values are replaced, structure is untouched byte-for-byte.
 *
 * Pseudonymisation is DETERMINISTIC (same input -> same output within a run),
 * so correlation/grouping still works: one client stays one client.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SALT = createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 16);
const maps = { ip4: new Map(), ip6: new Map(), host: new Map(), qval: new Map() };
const stats = { ip4: 0, ip6: 0, hosts: 0, queryValues: 0, emails: 0, tokens: 0, cookies: 0 };

const h = (s, n = 8) => createHash('sha256').update(SALT + s).digest('hex').slice(0, n);

/** RFC5737 TEST-NET-3 — reserved for documentation, never routable. */
function mapIp4(ip) {
  if (maps.ip4.has(ip)) return maps.ip4.get(ip);
  const d = createHash('sha256').update(SALT + ip).digest();
  const out = `203.0.113.${d[0] % 254 + 1}`;
  maps.ip4.set(ip, out); stats.ip4++;
  return out;
}
/** RFC3849 documentation prefix. */
function mapIp6(ip) {
  if (maps.ip6.has(ip)) return maps.ip6.get(ip);
  const out = `2001:db8::${h(ip, 4)}`;
  maps.ip6.set(ip, out); stats.ip6++;
  return out;
}
function mapHost(host) {
  if (maps.host.has(host)) return maps.host.get(host);
  const tld = host.match(/\.[a-z]{2,}$/i)?.[0] ?? '.com';
  const out = `host-${h(host, 6)}${tld}`;
  maps.host.set(host, out); stats.hosts++;
  return out;
}

/**
 * Replace IPv4s, but NOT dotted-quad version numbers.
 *
 * Bug found while testing against the real APGW fixture: `Chrome/141.0.0.0`
 * matched the IPv4 regex and became `Chrome/203.0.113.211`, corrupting the user
 * agent — which the app actually parses for device classification.
 *
 * Guards:
 *  - preceded by `/` or `v` (Chrome/141.0.0.0, v1.2.3.4)
 *  - any octet > 255 (not a valid IP)
 *  - trailing `.0.0` (overwhelmingly a version, not a host)
 */
const RE = {
  ip4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ip6: /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi,
  email: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi,
  // Keep param NAME (parsers care), replace VALUE (PII lives there)
  queryPair: /([?&])([\w.\-\[\]%]+)=([^&\s"']*)/g,
  jwt: /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}\b/g,
  bearer: /\b(Bearer|Basic)\s+[\w\-._~+/]{16,}={0,2}/gi,
  longHex: /\b[0-9a-f]{32,}\b/gi,
  cookieHdr: /\b(Cookie|Set-Cookie|Authorization)\s*:\s*[^\t\r\n]*/gi,
  fqdn: /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|co|il|local|internal|azure|cloudapp)\b/gi,
};

/** Query params whose values are structurally meaningful — keep them. */
const KEEP_VALUES = new Set(['page', 'limit', 'offset', 'sort', 'order', 'lang',
  'locale', 'currency', 'format', 'version', 'v', 'type', 'category', 'status']);

/**
 * Should this IPv4 be pseudonymised, in this context?
 * Shared by replaceIp4 and the residual checker so they CANNOT diverge.
 * `before` is the character immediately preceding the IP (or '' at start).
 */
function shouldReplaceIp4(ip, before) {
  const parts = ip.split('.').map(Number);
  if (parts.some(o => o > 255)) return false;          // not a valid IP
  if (/[\/v]$/i.test(before)) return false;             // Chrome/141.0.0.0, v1.2.3.4
  if (/\.0\.0$/.test(ip)) return false;                 // version-shaped
  return true;
}

function replaceIp4(text) {
  return text.replace(/(^|[^\w.])((?:\d{1,3}\.){3}\d{1,3})(?![\w.])/g, (m, pre, ip) =>
    shouldReplaceIp4(ip, pre) ? pre + mapIp4(ip) : m,
  );
}

function sanitizeLine(line, isHeader) {
  // Header/directive lines are pure structure — never touch them.
  if (isHeader) return line;
  let out = line;

  out = out.replace(RE.cookieHdr, (m, k) => { stats.cookies++; return `${k}: [REDACTED]`; });
  out = out.replace(RE.jwt, () => { stats.tokens++; return 'eyJ[REDACTED].[REDACTED].[REDACTED]'; });
  out = out.replace(RE.bearer, (m, s) => { stats.tokens++; return `${s} [REDACTED]`; });
  // Emails BEFORE fqdn, else the domain half gets host-mapped first and the
  // email regex no longer matches (found in edge-case testing: a@b.com ->
  // user@host-773f5b.com, which still looks like a leak).
  out = out.replace(RE.email, () => { stats.emails++; return 'user@example.com'; });

  out = out.replace(RE.queryPair, (m, sep, key, val) => {
    if (!val || val === '-' || KEEP_VALUES.has(key.toLowerCase())) return m;
    if (/^\d+$/.test(val) && val.length <= 4) return m;   // small ints: harmless, keep shape
    const k = `${key}=${val}`;
    if (!maps.qval.has(k)) { maps.qval.set(k, h(k, Math.min(val.length, 12))); stats.queryValues++; }
    return `${sep}${key}=${maps.qval.get(k)}`;
  });

  out = out.replace(RE.longHex, (m) => h(m, m.length > 40 ? 40 : m.length));
  out = out.replace(RE.ip6, mapIp6);
  out = replaceIp4(out);
  // FQDN mapping intentionally EXCLUDES example.com (our own replacement
  // target) and 203.0.113.x (already-pseudonymised), else the substituted
  // 'user@example.com' gets rewritten to 'user@host-xxxxxxxx.com' and the
  // checker reports a false-positive leak.
  out = out.replace(RE.fqdn, (m) => {
    if (m === 'example.com' || m.startsWith('203.0.113.')) return m;
    return mapHost(m);
  });
  return out;
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const files = args.filter(a => !a.startsWith('--'));
if (files.length === 0) {
  console.error('usage: node scripts/sanitize-logs.mjs [--check] <input> [output]');
  process.exit(1);
}
const [input, output = input.replace(/(\.[^.]+)?$/, '.sanitized$1')] = files;

const raw = readFileSync(input);

// Encoding detection — IIS logs on Windows are frequently UTF-16LE.
let text, encoding = 'utf-8';
if (raw[0] === 0xff && raw[1] === 0xfe) { encoding = 'utf-16le'; text = raw.toString('utf16le'); }
else if (raw[0] === 0xfe && raw[1] === 0xff) { encoding = 'utf-16be'; text = raw.swap16().toString('utf16le'); }
else if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) { encoding = 'utf-8-bom'; text = raw.slice(3).toString('utf8'); }
else text = raw.toString('utf8');

const crlf = text.includes('\r\n');
const lines = text.split(/\r?\n/);

const sanitized = lines.map(l => {
  const isHeader = l.startsWith('#') ||
    /^(TenantId\t|time\t|date\t)/.test(l) ||
    (l.includes('TimeGenerated') && l.includes('RequestUri'));
  return sanitizeLine(l, isHeader);
});

console.log(`input        ${input}`);
console.log(`encoding     ${encoding}${crlf ? ' (CRLF)' : ' (LF)'}`);
console.log(`lines        ${lines.length.toLocaleString()}`);
console.log('--- replaced ---');
for (const [k, v] of Object.entries(stats)) if (v) console.log(`  ${k.padEnd(13)} ${v.toLocaleString()}`);
console.log(`  unique IPs    ${maps.ip4.size + maps.ip6.size}`);

// Residual scan — never claim clean without checking the OUTPUT.
const joined = sanitized.join('\n');
const leaks = [];
const realIp = (joined.match(/(?:\d{1,3}\.){3}\d{1,3}/g) ?? []).filter(ip => {
  if (ip.startsWith('203.0.113.')) return false;        // already pseudonymised
  const pre = joined[joined.indexOf(ip) - 1] ?? '';
  return shouldReplaceIp4(ip, pre);
});
if (realIp.length) leaks.push(`${realIp.length} non-pseudonymised public IP(s), e.g. ${realIp[0]}`);
if (/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(joined.replace(/user@example\.com/g, ''))) {
  leaks.push('email-like string remains');
}

if (leaks.length) {
  console.log('\n⚠️  RESIDUAL PII — review before sharing:');
  leaks.forEach(l => console.log(`   - ${l}`));
} else {
  console.log('\n✅ no residual public IPs or emails detected');
}
console.log('   (automated check — still eyeball the output before sharing)');

if (checkOnly) { console.log('\n--check: nothing written'); process.exit(0); }
writeFileSync(output, sanitized.join(crlf ? '\r\n' : '\n'), 'utf8');
console.log(`\nwrote        ${output}`);
