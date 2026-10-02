#!/usr/bin/env node
/**
 * check-pos-design.mjs - every POS screen follows the design rules in
 * src/lib/posDesign.js:
 *
 *   TEXT    nothing below 11px; no one-off sizes (text-[13px]) - the scale only
 *   RADIUS  rounded-xl (controls), rounded-2xl (panels, dialogs), rounded-full
 *   TOUCH   anything tappable at least 44px (h-11); never h-7..h-10 on a button
 *
 * Only 4 of the POS's files used the rules; the rest had drifted (six corner
 * radii, twelve text sizes, 32px buttons). This makes the rules enforceable.
 *
 *   node scripts/check-pos-design.mjs          report + fail on any breach
 *   node scripts/check-pos-design.mjs --list   also print every breach
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['src/components/pos', 'src/components/kds'];
const FILES = ['src/pages/POSDashboard.jsx'];
for (const d of DIRS) for (const f of fs.readdirSync(path.join(ROOT, d))) if (/\.jsx$/.test(f)) FILES.push(`${d}/${f}`);

import { maskComments, stringMask, tappableTags, RADIUS_RE, TEXT_RE, SMALL_H_RE } from './lib/pos-design-scan.mjs';

const ALLOWED_ARBITRARY_TEXT = new Set(['text-[11px]']);   // POS_TEXT.micro
const lineOf = (src, at) => src.slice(0, at).split('\n').length;

/** Breaches in one file. Class names live in strings, so only string characters count. */
export function audit(src) {
    const code = maskComments(src); const inStr = stringMask(code); const breaches = [];
    for (const m of code.matchAll(TEXT_RE)) {
        if (!inStr[m.index] || ALLOWED_ARBITRARY_TEXT.has(m[0])) continue;
        breaches.push({ rule: Number(m[1]) < 11 ? 'text<11px' : 'text-off-scale', line: lineOf(code, m.index), what: m[0] });
    }
    for (const m of code.matchAll(RADIUS_RE)) {
        if (inStr[m.index]) breaches.push({ rule: 'radius-off-scale', line: lineOf(code, m.index), what: m[0] });
    }
    for (const [a, b] of tappableTags(code)) {
        const tag = code.slice(a, b);
        const small = tag.match(SMALL_H_RE);
        const smallSize = /\bsize="sm"/.test(tag) && !/(?<![\w-])h-(1[1-9]|[2-9]\d)(?![\w-])/.test(tag);
        if (small && inStr[a + small.index]) breaches.push({ rule: 'touch<44px', line: lineOf(code, a), what: small[0] });
        else if (smallSize) breaches.push({ rule: 'touch<44px', line: lineOf(code, a), what: 'size="sm"' });
    }
    return breaches;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const list = process.argv.includes('--list');
    const byRule = {}; let total = 0; const byFile = [];
    for (const f of FILES) {
        const b = audit(fs.readFileSync(path.join(ROOT, f), 'utf8'));
        if (!b.length) continue;
        total += b.length; byFile.push([f, b]);
        for (const x of b) byRule[x.rule] = (byRule[x.rule] || 0) + 1;
    }
    byFile.sort((a, b) => b[1].length - a[1].length);
    for (const [f, b] of byFile) {
        console.log(`  ${String(b.length).padStart(4)}  ${f}`);
        if (list) for (const x of b) console.log(`          ${x.line}: ${x.rule} ${x.what}`);
    }
    console.log(`\n  ${FILES.length} files, ${byFile.length} with breaches, ${total} breaches: ${JSON.stringify(byRule)}`);
    process.exit(total ? 1 : 0);
}
