import { describe, it, expect } from 'vitest';
import { audit } from '../../../scripts/check-pos-design.mjs';
import { fix } from '../../../scripts/fix-pos-design.mjs';

/**
 * The design-rule audit and fixer (posDesign.js scale). The first fixer run
 * renamed a JS variable in POSPayment.jsx (`const rounded = ...` became
 * `const rounded-xl = ...`) and broke the build. Class names live only in
 * strings; these hold that line.
 */
describe('design-rule audit and fixer', () => {
    it('REGRESSION GUARD: a JS variable named rounded is code, never a class', () => {
        const src = 'for (const step of [10]) {\n    const rounded = Math.ceil(owed / step) * step;\n    if (rounded > owed) opts.push(rounded);\n}';
        expect(audit(src)).toEqual([]);
        expect(fix(src)[0]).toBe(src);
    });
    it('an apostrophe in on-screen text does not hide the next line\'s classes', () => {
        const src = "<p>Don't forget</p>\n<div className=\"rounded-lg p-2\" />";
        expect(audit(src).map(b => b.what)).toEqual(['rounded-lg']);
        expect(fix(src)[0]).toBe("<p>Don't forget</p>\n<div className=\"rounded-xl p-2\" />");
    });
    it('comments are never edited', () => {
        const src = '// keep rounded-lg here\n/* text-[9px] */\n<b className="text-[9px]" />';
        expect(fix(src)[0]).toBe('// keep rounded-lg here\n/* text-[9px] */\n<b className="text-[11px]" />');
    });
    it('small tap targets grow to 44px; icon buttons stay square; size="sm" gets a height', () => {
        expect(fix('<Button className="h-8 w-8 rounded-full" />')[0]).toBe('<Button className="h-11 w-11 rounded-full" />');
        expect(fix('<button className={`h-9 px-3 ${x}`} />')[0]).toBe('<button className={`h-11 px-3 ${x}`} />');
        expect(fix('<Button size="sm" className="px-3" />')[0]).toBe('<Button size="sm" className="h-11 px-3" />');
        expect(fix('<Button size="sm" onClick={go} />')[0]).toBe('<Button className="h-11" size="sm" onClick={go} />');
        expect(fix('<div className="h-8 w-8" />')[0]).toBe('<div className="h-8 w-8" />');       // not tappable
        expect(fix('<Button className="w-8 h-12" />')[0]).toBe('<Button className="w-8 h-12" />'); // already tall enough
    });
    it('text snaps to the scale; 11px is the floor', () => {
        expect(fix('<i className="text-[8px] text-[13px] text-[15px] text-[11px]" />')[0])
            .toBe('<i className="text-[11px] text-sm text-base text-[11px]" />');
    });
    it('a fixed file passes the audit', () => {
        const src = '<Button size="sm" className="rounded-md text-[10px]">Go</Button>\n<div className="rounded-3xl" />';
        const [out] = fix(src);
        expect(audit(src).length).toBe(4);
        expect(audit(out)).toEqual([]);
    });
});
