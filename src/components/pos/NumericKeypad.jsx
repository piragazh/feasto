import React from 'react';
import { Button } from '@/components/ui/button';
import { Delete } from 'lucide-react';

/**
 * String-based numeric keypad — avoids the "typing 0 resets to 0" bug.
 * `rawValue` is a string like "1050" meaning £10.50 (last two digits = pence).
 */
export default function NumericKeypad({ rawValue = '', onRawChange, onComplete, isDark = true }) {
    const numericValue = rawValue === '' ? 0 : parseInt(rawValue, 10) / 100;

    const append = (digit) => {
        if (rawValue === '' && digit === '0') return; // don't allow leading zeros
        const next = rawValue + digit;
        if (next.length > 7) return; // max £99999.99
        onRawChange(next);
    };

    const backspace = () => {
        onRawChange(rawValue.slice(0, -1));
    };

    const clear = () => onRawChange('');

    const displayCls = isDark ? 'bg-gray-700' : 'bg-gray-100';
    const labelCls = isDark ? 'text-gray-400' : 'text-gray-500';
    const valueCls = isDark ? 'text-white' : 'text-gray-900';
    const keyCls = isDark
        ? 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'
        : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300';
    const backspaceCls = isDark
        ? 'bg-gray-600 hover:bg-gray-500 text-white border-gray-600'
        : 'bg-gray-200 hover:bg-gray-300 text-gray-900 border-gray-300';

    return (
        <div className="space-y-2">
            {/* Display */}
            <div className={`${displayCls} rounded-lg px-4 py-3 text-right`}>
                <div className={`${labelCls} text-xs mb-0.5`}>Amount</div>
                <div className={`text-3xl font-bold ${valueCls}`}>£{numericValue.toFixed(2)}</div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3].map(k => (
                    <Button key={k} onClick={() => append(String(k))}
                        className={`h-12 text-xl font-bold border ${keyCls}`}>
                        {k}
                    </Button>
                ))}
                <Button onClick={backspace}
                    className={`h-12 text-xl font-bold border ${backspaceCls}`}>
                    <Delete className="h-5 w-5" />
                </Button>

                {[4, 5, 6].map(k => (
                    <Button key={k} onClick={() => append(String(k))}
                        className={`h-12 text-xl font-bold border ${keyCls}`}>
                        {k}
                    </Button>
                ))}
                <Button onClick={clear}
                    className="h-12 text-sm font-bold bg-red-800 hover:bg-red-700 text-white border border-gray-600">
                    CLR
                </Button>

                {[7, 8, 9].map(k => (
                    <Button key={k} onClick={() => append(String(k))}
                        className={`h-12 text-xl font-bold border ${keyCls}`}>
                        {k}
                    </Button>
                ))}
                <Button onClick={onComplete}
                    className="row-span-2 h-full text-base font-bold bg-green-600 hover:bg-green-700 text-white">
                    OK
                </Button>

                <Button onClick={() => append('0')}
                    className={`col-span-2 h-12 text-xl font-bold border ${keyCls}`}>
                    0
                </Button>
                <Button onClick={() => append('00')}
                    className={`h-12 text-xl font-bold border ${keyCls}`}>
                    00
                </Button>
            </div>
        </div>
    );
}