#!/usr/bin/env node
/**
 * fix-pos-design.mjs - bring POS files onto the posDesign.js scale.
 * Finds breaches with the SAME scanner as check-pos-design.mjs (comments are
 * masked, so only real class names change - never comments or logic), then:
 *
 *   touch   h-7..h-10 on a tappable tag -> h-11 (and w-7..w-10 -> w-11, so
 *           square icon buttons stay square); size="sm" with no height -> h-11
 *   radius  rounded / -sm / -md / -lg -> rounded-xl; -3xl -> rounded-2xl
 *   text    below 11px -> text-[11px]; 12px -> text-xs; 13-14px -> text-sm;
 *           15-17px -> text-base / text-lg
 *
 *   node scripts/fix-pos-design.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['src/components/pos', 'src/components/kds'];
const FILES = ['src/pages/POSDashboard.jsx'];
for (const d of DIRS) for (const f of fs.readdirSync(path.join(ROOT, d))) if (/\.jsx$/.test(f)) FILES.push(`${d}/${f}`);
const DRY = process.argv.includes('--dry');

import { maskComments, stringMask, tappableTags, RADIUS_RE, TEXT_RE } from './lib/pos-design-scan.mjs';

const TEXT = (px) => px <= 11 ? 'text-[11px]' : px <= 12 ? 'text-xs' : px <= 14 ? 'text-sm' : px <= 16 ? 'text-base' : px <= 18 ? 'text-lg' : 'text-xl';

/** Returns [newSource, counts]. Only characters inside string literals are edited. */
export function fix(src) {
    const code = maskComments(src); const inStr = stringMask(code);
    const edits = []; const counts = { touch: 0, radius: 0, text: 0 };
    for (const m of code.matchAll(TEXT_RE)) {
        if (!inStr[m.index]) continue;
        const to = TEXT(Number(m[1]));
        if (m[0] !== to) { edits.push([m.index, m[0].length, to]); counts.text++; }
    }
    for (const m of code.matchAll(RADIUS_RE)) {
        if (!inStr[m.index]) continue;
        edits.push([m.index, m[0].length, m[1] === '-3xl' ? 'rounded-2xl' : 'rounded-xl']); counts.radius++;
    }
    for (const [a, b] of tappableTags(code)) {
        const tag = code.slice(a, b); let hit = false;
        const growsH = [...tag.matchAll(/(?<![\w-])h-(7|8|9|10)(?![\w-])/g)].some(m => inStr[a + m.index]);
        for (const m of tag.matchAll(/(?<![\w-])(h|w)-(7|8|9|10)(?![\w-])/g)) {
            if (!inStr[a + m.index]) continue;
            if (m[1] === 'w' && !growsH) continue;          // square icon buttons stay square
            edits.push([a + m.index, m[0].length, m[1] + '-11']); hit = true;
        }
        if (!hit && /\bsize="sm"/.test(tag) && !/(?<![\w-])h-(1[1-9]|[2-9]\d)(?![\w-])/.test(tag)) {
            const cls = tag.match(/className=("|\{`)/);
            if (cls) edits.push([a + tag.indexOf(cls[0]) + cls[0].length, 0, 'h-11 ']);
            else edits.push([a + tag.indexOf('size="sm"'), 0, 'className="h-11" ']);
            hit = true;
        }
        if (hit) counts.touch++;
    }
    edits.sort((x, y) => y[0] - x[0]);
    let out = src;
    for (const [at, len, to] of edits) out = out.slice(0, at) + to + out.slice(at + len);
    return [out, counts];
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const total = { touch: 0, radius: 0, text: 0 }; let files = 0;
    for (const f of FILES) {
        const p = path.join(ROOT, f); const src = fs.readFileSync(p, 'utf8');
        const [out, c] = fix(src);
        if (out !== src) { files++; if (!DRY) fs.writeFileSync(p, out); }
        for (const k in c) total[k] += c[k];
    }
    console.log(`${DRY ? '[dry] ' : ''}${files} files changed:`, JSON.stringify(total));
}
