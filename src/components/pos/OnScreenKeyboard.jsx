import React from 'react';
import { Button } from "@/components/ui/button";
import { Delete, Space } from 'lucide-react';

export default function OnScreenKeyboard({ onKeyPress, onBackspace, onSpace, onClose }) {
    const keys = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t-2 border-gray-700 p-2 z-[9999] shadow-2xl">
            <div className="max-w-4xl mx-auto space-y-1">
                {keys.map((row, rowIndex) => (
                    <div key={rowIndex} className="flex gap-1 justify-center">
                        {row.map(key => (
                            <Button
                                key={key}
                                onClick={() => onKeyPress(key)}
                                className="h-12 min-w-[2.5rem] flex-1 max-w-[4rem] bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg border border-gray-600"
                            >
                                {key}
                            </Button>
                        ))}
                    </div>
                ))}
                <div className="flex gap-1 justify-center">
                    <Button
                        onClick={onBackspace}
                        className="h-12 flex-1 max-w-[8rem] bg-red-600 hover:bg-red-700 text-white font-bold border border-red-500"
                    >
                        <Delete className="h-5 w-5" />
                    </Button>
                    <Button
                        onClick={onSpace}
                        className="h-12 flex-[3] bg-gray-700 hover:bg-gray-600 text-white font-bold border border-gray-600"
                    >
                        <Space className="h-5 w-5" />
                    </Button>
                    <Button
                        onClick={onClose}
                        className="h-12 flex-1 max-w-[8rem] bg-green-600 hover:bg-green-700 text-white font-bold border border-green-500"
                    >
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
}