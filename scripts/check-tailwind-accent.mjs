#!/usr/bin/env node
/**
 * check-tailwind-accent.mjs - the POS theme colour actually reaches the build.
 *
 * 27 Sep: tailwind.config.js had TWO `colors` blocks inside `extend`. In a JS
 * object a repeated key silently REPLACES the earlier one, so the POS palette
 * scale (accent-50..900) was thrown away. Tailwind generates nothing for a
 * class it does not know and never warns, and the build passed - so every
 * accent-* button, tab, price and badge on the till lost its colour.
 *
 * 1. No object in tailwind.config.js repeats a key (any level, any key).
 * 2. The resolved config has the POS scale AND the UI kit's DEFAULT/foreground.
 * 3. Every accent-<shade> class used in src/ is a shade the config defines.
 */
import fs from 'node:fs';
import path from 'node:path';

const checks = []; const ck = (l, ok, d = '') => { checks.push(!!ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(64)} ${d}`); };
const root = new URL('..', import.meta.url).pathname;
const cfgPath = path.join(root, 'tailwind.config.js');

// ── 1. duplicate keys, by a small scanner (strings and comments skipped) ────
function duplicateKeys(src) {
  const dups = []; const stack = [];      // each: { keys:Set, path }
  let i = 0, pendingKey = null;
  const line = (p) => src.slice(0, p).split('\n').length;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1;
      const str = src.slice(i + 1, j); i = j + 1;
      const after = src.slice(i).match(/^\s*:/);
      if (after && stack.length) { pendingKey = str; record(str, i); }
      continue;
    }
    if (c === '{') { stack.push({ keys: new Set(), path: pendingKey || '(object)' }); pendingKey = null; i++; continue; }
    if (c === '}') { stack.pop(); i++; continue; }
    const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(src.slice(i, i + 64));
    if (m) {
      const after = src.slice(i + m[0].length).match(/^\s*:(?!:)/);
      if (after && stack.length && !/\?\s*$/.test(src.slice(Math.max(0, i - 40), i))) { pendingKey = m[0]; record(m[0], i); }
      i += m[0].length; continue;
    }
    i++;
  }
  function record(k, at) {
    const top = stack[stack.length - 1];
    if (top.keys.has(k)) dups.push(`${top.path}.${k} (line ${line(at)})`);
    top.keys.add(k);
  }
  return dups;
}
const cfgSrc = fs.readFileSync(cfgPath, 'utf8');
const dups = duplicateKeys(cfgSrc);
ck('REGRESSION GUARD: no key is defined twice in tailwind.config.js', dups.length === 0, dups.join('; '));

// ── 2. the resolved config ──────────────────────────────────────────────────
const { default: resolveConfig } = await import('tailwindcss/resolveConfig.js');
const cfg = resolveConfig((await import(cfgPath)).default);
const accent = cfg.theme.colors.accent || {};
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const missing = SHADES.filter(s => !String(accent[s] || '').includes(`--pos-accent-${s}`));
ck('POS palette: accent-50..900 follow --pos-accent-*', missing.length === 0, missing.length ? `missing ${missing.join(',')}` : '10 shades');
ck("UI kit accent kept (bg-accent, text-accent-foreground)",
  /--accent\)/.test(accent.DEFAULT || '') && /--accent-foreground/.test(accent.foreground || ''));
ck('orange-* still follows the palette (the ~400 older classes)', String(cfg.theme.colors.orange?.['500'] || '').includes('--pos-accent-500'));

// ── 3. every accent shade used in the code exists ───────────────────────────
const used = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(p); continue; }
    if (!/\.(jsx?|tsx?)$/.test(e.name)) continue;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/\b(?:[a-z]+:)*(?:bg|text|border|ring|from|to|via|shadow|outline|fill|stroke|divide|placeholder|decoration|accent|caret)-accent-(\d+)\b/g)) {
      if (!used.has(m[1])) used.set(m[1], path.relative(root, p));
    }
  }
})(path.join(root, 'src'));
const unknown = [...used.keys()].filter(s => !accent[s]);
ck('every accent-<shade> class used in src/ exists in the build', unknown.length === 0,
  unknown.length ? unknown.map(s => `accent-${s} (${used.get(s)})`).join(', ') : `${used.size} shades in use`);

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
