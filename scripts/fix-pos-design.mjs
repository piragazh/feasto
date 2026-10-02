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

const mask = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (s, p) => p + ' '.repeat(s.length - p.length));
const TEXT = (px) => px < 11 ? 'text-[11px]' : px === 11 ? 'text-[11px]' : px <= 12 ? 'text-xs' : px <= 14 ? 'text-sm' : px <= 16 ? 'text-base' : px <= 18 ? 'text-lg' : 'text-xl';

function tappableTags(code) {
    const out = []; const re = /<(button|Button|SelectTrigger|TabsTrigger)\b/g; let m;
    while ((m = re.exec(code))) {
        let i = m.index, depth = 0, q = null;
        for (; i < code.length; i++) {
            const c = code[i];
            if (q) { if (c === q && code[i - 1] !== '\\') q = null; continue; }
            if (c === '"' || c === "'" || c === '`') { q = c; continue; }
            if (c === '{') depth++; else if (c === '}') depth--;
            else if (c === '>' && depth === 0 && code[i - 1] !== '=') break;
        }
        out.push([m.index, i + 1]);
    }
    return out;
}

/** Returns [newSource, counts]. Edits are applied right-to-left so offsets stay valid. */
export function fix(src) {
    const code = mask(src);
    const edits = []; const counts = { touch: 0, radius: 0, text: 0 };
    for (const m of code.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) {
        const to = TEXT(Number(m[1]));
        if (m[0] !== to && m[0] !== 'text-[11px]') { edits.push([m.index, m[0].length, to]); counts.text++; }
    }
    for (const m of code.matchAll(/(?<![\w-])rounded(-(?:sm|md|lg|3xl))?(?![\w-])/g)) {
        edits.push([m.index, m[0].length, m[1] === '-3xl' ? 'rounded-2xl' : 'rounded-xl']); counts.radius++;
    }
    for (const [a, b] of tappableTags(code)) {
        const tag = code.slice(a, b);
        let hit = false;
        for (const m of tag.matchAll(/(?<![\w-])(h|w)-(7|8|9|10)(?![\w-])/g)) {
            if (m[1] === 'w' && !/(?<![\w-])h-(7|8|9|10)(?![\w-])/.test(tag)) continue;   // only square-up when the height grows
            edits.push([a + m.index, m[0].length, `${m[1]}-11`]); hit = true;
        }
        if (!hit && /\bsize="sm"/.test(tag) && !/(?<![\w-])h-(1[1-9]|[2-9]\d)(?![\w-])/.test(tag)) {
            const cls = tag.match(/className=(["`])/) || tag.match(/className=\{`/);
            if (cls) {
                const at = a + tag.indexOf(cls[0]) + cls[0].length;
                edits.push([at, 0, 'h-11 ']);
            } else {
                const sz = tag.indexOf('size="sm"');
                edits.push([a + sz, 0, 'className="h-11" ']);
            }
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
