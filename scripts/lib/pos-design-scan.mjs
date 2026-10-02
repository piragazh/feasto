/**
 * pos-design-scan.mjs - shared by check-pos-design.mjs and fix-pos-design.mjs.
 *
 * Class names only ever live inside string literals ('...', "...", `...`).
 * Matching "rounded" anywhere renamed a JS variable in POSPayment.jsx
 * (`const rounded = Math.ceil(owed / step) * step`) and broke the build - so
 * every rule now applies ONLY to characters inside a string.
 */

/** Comments blanked to spaces (length kept, so offsets still line up). */
export function maskComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, (s, p) => p + ' '.repeat(s.length - p.length));
}

/**
 * inString[i] === 1 when code[i] is inside a string literal. Handles template
 * literals with ${...} (code inside, strings inside that again), escapes, and
 * JSX text: a '...' or "..." cannot cross a newline in JS, so an apostrophe in
 * on-screen text ("Don't") is dropped at the end of its line, not taken as a
 * string that swallows the file.
 */
export function stringMask(code) {
    const f = new Uint8Array(code.length);
    const tpl = [];               // brace depth for each open ${ ... }
    let mode = 'code', start = -1, i = 0;
    while (i < code.length) {
        const c = code[i];
        if (mode === 'code') {
            if (c === '\'' || c === '"') { mode = c; start = i + 1; }
            else if (c === '`') mode = '`';
            else if (c === '{' && tpl.length) tpl[tpl.length - 1]++;
            else if (c === '}' && tpl.length) {
                if (tpl[tpl.length - 1] === 0) { tpl.pop(); mode = '`'; }
                else tpl[tpl.length - 1]--;
            }
            i++; continue;
        }
        if (mode === '\'' || mode === '"') {
            if (c === '\\') { f[i] = 1; if (i + 1 < code.length) f[i + 1] = 1; i += 2; continue; }
            if (c === mode) { mode = 'code'; i++; continue; }
            if (c === '\n') { for (let k = start; k < i; k++) f[k] = 0; mode = 'code'; i++; continue; }   // not a string after all
            f[i] = 1; i++; continue;
        }
        // template literal
        if (c === '\\') { f[i] = 1; if (i + 1 < code.length) f[i + 1] = 1; i += 2; continue; }
        if (c === '`') { mode = 'code'; i++; continue; }
        if (c === '$' && code[i + 1] === '{') { tpl.push(0); mode = 'code'; i += 2; continue; }
        f[i] = 1; i++;
    }
    return f;
}

/** Opening tag of every tappable element, [start, end). */
export function tappableTags(code) {
    const out = []; const re = /<(button|Button|SelectTrigger|TabsTrigger)\b/g; let m;
    while ((m = re.exec(code))) {
        let i = m.index, depth = 0, q = null;
        for (; i < code.length; i++) {
            const c = code[i];
            if (q) { if (c === q && code[i - 1] !== '\\') q = null; continue; }
            if (c === '"' || c === '\'' || c === '`') { q = c; continue; }
            if (c === '{') depth++; else if (c === '}') depth--;
            else if (c === '>' && depth === 0 && code[i - 1] !== '=') break;
        }
        out.push([m.index, i + 1]);
    }
    return out;
}

export const RADIUS_RE = /(?<![\w-])rounded(-(?:sm|md|lg|3xl))?(?![\w-])/g;
export const TEXT_RE = /\btext-\[(\d+(?:\.\d+)?)px\]/g;
export const SMALL_H_RE = /(?<![\w-])h-(7|8|9|10)(?![\w-])/;
