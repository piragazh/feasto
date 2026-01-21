import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export default function NumericKeypad({ value, onChange, onComplete, placeholder = "0", max }) {
    const handleClick = (num) => {
        const newValue = (value + num.toString()).slice(0, max ? max.toString().length : undefined);
        onChange(parseFloat(newValue) || 0);
    };

    const handleBackspace = () => {
        const newValue = Math.floor(value / 10);
        onChange(newValue);
    };

    const handleDecimal = () => {
        if (!value.toString().includes('.')) {
            onChange(parseFloat(value + '.'));
        }
    };

    return (
        <div className="space-y-3">
            <div className="bg-gray-700 rounded-lg p-4 text-right">
                <div className="text-gray-400 text-sm mb-1">Amount</div>
                <div className="text-4xl font-bold text-white">£{value.toFixed(2)}</div>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, '←'].map(key => (
                    <Button
                        key={key}
                        onClick={() => key === '←' ? handleBackspace() : handleClick(key)}
                        className="h-16 text-2xl font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
                    >
                        {key === '←' ? <X className="h-6 w-6" /> : key}
                    </Button>
                ))}
                {[4, 5, 6, '·'].map(key => (
                    <Button
                        key={key}
                        onClick={() => key === '·' ? handleDecimal() : handleClick(key)}
                        className="h-16 text-2xl font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
                    >
                        {key}
                    </Button>
                ))}
                {[7, 8, 9, '00'].map(key => (
                    <Button
                        key={key}
                        onClick={() => handleClick(key)}
                        className="h-16 text-2xl font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
                    >
                        {key}
                    </Button>
                ))}
                <Button
                    onClick={() => onChange(0)}
                    className="col-span-2 h-16 text-2xl font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
                >
                    0
                </Button>
                <Button
                    onClick={onComplete}
                    className="col-span-2 h-16 text-xl font-bold bg-green-600 hover:bg-green-700 text-white"
                >
                    OK
                </Button>
            </div>
        </div>
    );
}