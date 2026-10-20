#!/usr/bin/env node
/**
 * check-ai-core-parity.mjs - the AI ordering core must price a basket exactly as
 * checkout validation does, or an AI order is refused (cash) or refunded (card).
 *
 * aiOrderingCore keeps a COPY of calcItemServerPrice from verifyAndCreateOrder.
 * This fails the moment the two copies drift (comments and whitespace ignored).
 * Item availability parity is covered by check-item-availability.mjs.
 */
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [];
const ck = (label, ok, detail = '') => { checks.push(!!ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${label.padEnd(66)} ${detail}`); };

function fnBody(src, name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) return null;
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) {
            return src.slice(start, i + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
        }
    }
    return null;
}

const validator = fnBody(read('base44/functions/verifyAndCreateOrder/entry.ts'), 'calcItemServerPrice');
const core = fnBody(read('base44/functions/aiOrderingCore/entry.ts'), 'calcItemServerPrice');
ck('verifyAndCreateOrder has calcItemServerPrice', !!validator);
ck('aiOrderingCore has calcItemServerPrice', !!core);
ck('aiOrderingCore prices items exactly like checkout validation', validator && core && validator === core,
    validator && core && validator !== core ? 'DIFFERS - copy the validator version into aiOrderingCore' : '');

const ok = checks.filter(Boolean).length;
console.log(`\n  ${ok}/${checks.length} correct`);
process.exit(ok === checks.length ? 0 : 1);
