/**
 * A quick pre-commit scan for anything that looks like a credential.
 *
 * It is deliberately conservative: it looks for key shapes and for assignments to
 * names that should only ever come from the environment. It is a safety net, not
 * a substitute for reading a diff.
 *
 * Usage: node tools/check-no-secrets.mjs [--all]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'data-imports', 'raw-photos', 'open-data']);
const SKIP_FILES = new Set(['package-lock.json']);
const TEXT_EXTENSIONS = /\.(js|mjs|cjs|json|html|css|md|yml|yaml|env|example|txt|svg|dockerignore|gitignore)$/;

const PATTERNS = [
  { name: 'NVIDIA key', pattern: /\bnvapi-[A-Za-z0-9_-]{8,}/g },
  { name: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI-style key', pattern: /\bsk-[A-Za-z0-9]{16,}/g },
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'bearer token literal', pattern: /['"`]Bearer\s+[A-Za-z0-9._-]{12,}['"`]/g },
  { name: 'hard-coded secret assignment', pattern: /\b(api[_-]?key|secret|access[_-]?token|password)\s*[:=]\s*['"`][^'"`\s]{12,}['"`]/gi }
];

/** Files that legitimately describe the shape of a key rather than containing one. */
const ALLOWED = [
  { file: 'tools/check-no-secrets.mjs', reason: 'this scanner lists the key shapes it looks for' },
  { file: '.env.example', reason: 'an example file, every value is empty or a placeholder' },
  { file: 'tests/config.test.js', reason: 'test fixtures use obviously fake keys' },
  { file: 'tests/geocode.test.js', reason: 'test fixtures use obviously fake keys' },
  { file: 'tests/ai.test.js', reason: 'test fixtures use obviously fake keys' },
  { file: 'tests/server.test.js', reason: 'test fixtures use obviously fake keys' },
  { file: 'tests/integrations.test.js', reason: 'the bearer token in this file is the literal string "super-secret-key-value"' },
  { file: 'tests/browser/app.spec.js', reason: 'the negative assertion names the key shapes' },
  { file: 'docs/INTEGRATIONS.md', reason: 'documents the key shapes that must never be committed' },
  { file: 'README.md', reason: 'describes the policy in words' }
];
const FAKE_MARKERS = /(TEST|EXAMPLE|FAKE|PLACEHOLDER|NOTREAL|NOT_REAL|xxxx|your-|dummy|example)/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.gitignore' && entry.name !== '.dockerignore') {
      if (entry.isDirectory()) continue;
    }
    const full = path.join(dir, entry.name);
    const relative = path.relative(ROOT, full);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    if (entry.name === '.env') {
      out.push({ file: relative, line: 0, text: 'a real .env file exists (it is git-ignored, but check it is not staged)', hard: true });
      continue;
    }
    if (!TEXT_EXTENSIONS.test(entry.name)) continue;
    if (statSync(full).size > 2 * 1024 * 1024) continue;
    out.push({ file: relative, text: readFileSync(full, 'utf8') });
  }
  return out;
}

const findings = [];
for (const item of walk(ROOT)) {
  if (item.line !== undefined) { findings.push(item); continue; }
  const allowed = ALLOWED.find((entry) => item.file === entry.file);
  for (const { name, pattern } of PATTERNS) {
    for (const match of item.text.matchAll(pattern)) {
      const found = match[0];
      if (FAKE_MARKERS.test(found)) continue;          // obvious placeholder
      if (allowed && FAKE_MARKERS.test(found)) continue;
      if (allowed) continue;                            // the file documents the policy
      findings.push({ file: item.file, text: found.slice(0, 80), rule: name, hard: true });
    }
  }
}

if (findings.length === 0) {
  console.log('check-no-secrets: nothing found. No key values, tokens or certificate blocks in the tracked tree.');
  process.exit(0);
}

console.error(`check-no-secrets: ${findings.length} finding(s) — review each one before committing:\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}${finding.line ? `:${finding.line}` : ''} — ${finding.rule || 'note'}`);
  console.error(`    ${finding.text}`);
}
console.error('\nIf a finding is a test fixture or a documented example, add the file to the ALLOWED list in tools/check-no-secrets.mjs with a reason.');
process.exit(1);
