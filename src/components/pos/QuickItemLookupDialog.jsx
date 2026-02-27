import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, Search } from 'lucide-react';

export default function QuickItemLookupDialog({ open, onClose, menuItems, onItemFound, isDark }) {
    const [itemNo, setItemNo] = useState('');
    const [notFound, setNotFound] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const handleSearch = () => {
        const found = menuItems.find(
            item => item.menu_item_no && 
            item.menu_item_no.toLowerCase() === itemNo.toLowerCase().trim()
        );
        
        if (found) {
            setSelectedItem(found);
            setNotFound(false);
        } else {
            setSelectedItem(null);
            setNotFound(true);
        }
    };

    const handleAdd = () => {
        if (selectedItem) {
            onItemFound(selectedItem);
            handleReset();
            onClose();
        }
    };

    const handleReset = () => {
        setItemNo('');
        setSelectedItem(null);
        setNotFound(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            if (selectedItem) handleAdd();
            else handleSearch();
        }
    };

    const handleNumpadInput = (char) => {
        if (char === 'backspace') {
            setItemNo(prev => prev.slice(0, -1));
        } else {
            setItemNo(prev => prev + char);
            setNotFound(false);
            setSelectedItem(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${isDark ? 'bg-[#1a1d27] border-white/[0.06]' : 'bg-white border-gray-200'} max-w-sm p-0 flex flex-col`}>
                <DialogHeader className={`px-4 py-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                    <DialogTitle className={isDark ? 'text-white' : 'text-gray-900'} asChild>
                        <div className="flex items-center gap-2">
                            <Search className="h-5 w-5 text-orange-500" />
                            Quick Item Lookup
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="p-4 space-y-4">
                    {!selectedItem ? (
                        <>
                            <div>
                                <label className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-600'} block mb-2`}>
                                    Enter Menu Item Number
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        autoFocus
                                        type="text"
                                        value={itemNo}
                                        onChange={(e) => {
                                            setItemNo(e.target.value);
                                            setNotFound(false);
                                            setSelectedItem(null);
                                        }}
                                        onKeyDown={handleKeyDown}
                                        placeholder="e.g., 43, 101, A5"
                                        className={`${isDark ? 'bg-[#0f1117] border-white/[0.08]' : 'bg-gray-50 border-gray-200'} text-lg font-bold`}
                                    />
                                    <Button
                                        onClick={handleSearch}
                                        className="bg-orange-500 hover:bg-orange-600 text-white px-6"
                                    >
                                        Find
                                    </Button>
                                </div>
                            </div>

                            {notFound && (
                                <div className={`flex items-start gap-2 p-3 rounded-lg ${isDark ? 'bg-red-500/10 border-red-500/30 border' : 'bg-red-50 border-red-200 border'}`}>
                                    <AlertCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                                    <div>
                                        <p className={`text-sm font-semibold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                            Item #{itemNo} not found
                                        </p>
                                        <p className={`text-xs mt-1 ${isDark ? 'text-red-400/70' : 'text-red-600/70'}`}>
                                            Check the menu board number and try again
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Numpad */}
                            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-white/[0.06]">
                                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((btn) => (
                                    <Button
                                        key={btn}
                                        onClick={() => handleNumpadInput(btn)}
                                        className={`h-12 text-lg font-bold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}`}
                                    >
                                        {btn}
                                    </Button>
                                ))}
                                <Button
                                    onClick={() => handleNumpadInput('backspace')}
                                    className={`col-span-3 h-12 ${isDark ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'} text-white font-semibold`}
                                >
                                    <Backspace className="h-4 w-4 mr-2" />
                                    Clear
                                </Button>
                            </div>

                            {/* Numpad */}
                            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-white/[0.06]">
                                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((btn) => (
                                    <Button
                                        key={btn}
                                        onClick={() => handleNumpadInput(btn)}
                                        className={`h-12 text-lg font-bold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}`}
                                    >
                                        {btn}
                                    </Button>
                                ))}
                                <Button
                                    onClick={() => handleNumpadInput('backspace')}
                                    className={`col-span-3 h-12 ${isDark ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'} text-white font-semibold`}
                                >
                                    Clear
                                </Button>
                            </div>

                            <p className={`text-xs text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                Tip: Ask customer to check the menu board number next to the item
                            </p>
                        </>
                    ) : (
                        <>
                            <div className={`p-4 rounded-lg border ${isDark ? 'bg-green-500/10 border-green-500/30' : 'bg-green-50 border-green-200'}`}>
                                <p className={`text-xs font-semibold ${isDark ? 'text-green-400' : 'text-green-600'} mb-2`}>
                                    Item Found
                                </p>
                                <div className="space-y-2">
                                    <div>
                                        <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                            {selectedItem.name}
                                        </p>
                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                                            Menu #{selectedItem.menu_item_no}
                                        </p>
                                    </div>
                                    {selectedItem.description && (
                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                            {selectedItem.description}
                                        </p>
                                    )}
                                    <p className={`text-sm font-bold mt-2 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                                        £{(selectedItem.pos_price != null ? selectedItem.pos_price : selectedItem.price).toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleReset}
                                    className="flex-1"
                                >
                                    Search Again
                                </Button>
                                <Button
                                    onClick={handleAdd}
                                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                                >
                                    Add to Cart
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}