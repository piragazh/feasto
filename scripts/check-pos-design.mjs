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

const ALLOWED_ARBITRARY_TEXT = new Set(['text-[11px]']);   // POS_TEXT.micro

/** The opening tag of every tappable element: <button>, <Button>, <SelectTrigger>, role="button". */
function tappableTags(src) {
    const out = [];
    const re = /<(button|Button|SelectTrigger|TabsTrigger)\b/g;
    let m;
    while ((m = re.exec(src))) {
        // walk to the end of the opening tag, respecting {...} and quotes
        let i = m.index, depth = 0, q = null;
        for (; i < src.length; i++) {
            const c = src[i];
            if (q) { if (c === q && src[i - 1] !== '\\') q = null; continue; }
            if (c === '"' || c === "'" || c === '`') { q = c; continue; }
            if (c === '{') depth++;
            else if (c === '}') depth--;
            else if (c === '>' && depth === 0 && src[i - 1] !== '=') break;
        }
        out.push({ at: m.index, tag: src.slice(m.index, i + 1) });
    }
    return out;
}
const lineOf = (src, at) => src.slice(0, at).split('\n').length;

export function audit(src) {
    const breaches = [];
    const code = src.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
                    .replace(/(^|[^:])\/\/.*$/gm, (s, p) => p + ' '.repeat(s.length - p.length));
    for (const m of code.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) {
        if (!ALLOWED_ARBITRARY_TEXT.has(m[0])) breaches.push({ rule: Number(m[1]) < 11 ? 'text<11px' : 'text-off-scale', line: lineOf(code, m.index), what: m[0] });
    }
    for (const m of code.matchAll(/(?<![\w-])rounded(-(?:sm|md|lg|3xl))?(?![\w-])/g)) {
        if (m[1] === undefined && /rounded(?=[-\w])/.test(code.slice(m.index, m.index + 9))) continue;
        breaches.push({ rule: 'radius-off-scale', line: lineOf(code, m.index), what: m[0] });
    }
    for (const { at, tag } of tappableTags(code)) {
        const small = tag.match(/(?<![\w-])h-(7|8|9|10)(?![\w-])/);
        const smallSize = /\bsize="sm"/.test(tag) && !/(?<![\w-])h-(1[1-9]|[2-9]\d)(?![\w-])/.test(tag);
        if (small) breaches.push({ rule: 'touch<44px', line: lineOf(code, at), what: small[0] });
        else if (smallSize) breaches.push({ rule: 'touch<44px', line: lineOf(code, at), what: 'size="sm"' });
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
