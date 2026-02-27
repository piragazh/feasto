import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, Search } from 'lucide-react';
import NumericKeypad from './NumericKeypad';

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

    const handleKeypadInput = (value) => {
        if (value === 'backspace') {
            setItemNo(itemNo.slice(0, -1));
        } else if (value === 'clear') {
            setItemNo('');
        } else {
            setItemNo(itemNo + value);
            setNotFound(false);
            setSelectedItem(null);
        }
    };

    const handleKeypadInput = (value) => {
        if (value === 'backspace') {
            setItemNo(itemNo.slice(0, -1));
        } else if (value === 'clear') {
            setItemNo('');
        } else {
            setItemNo(itemNo + value);
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

                <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
                    {!selectedItem ? (
                        <>
                            <div>
                                <label className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-600'} block mb-2`}>
                                    Enter Menu Item Number
                                </label>
                                <Input
                                    type="text"
                                    value={itemNo}
                                    onChange={(e) => {
                                        setItemNo(e.target.value);
                                        setNotFound(false);
                                        setSelectedItem(null);
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="e.g., 43, 101, A5"
                                    className={`${isDark ? 'bg-[#0f1117] border-white/[0.08]' : 'bg-gray-50 border-gray-200'} text-lg font-bold text-center`}
                                    readOnly
                                />
                            </div>

                            <NumericKeypad 
                                onInput={handleKeypadInput}
                                isDark={isDark}
                                extraButtons={[
                                    { label: 'Find', onClick: handleSearch, variant: 'default', className: 'col-span-2 bg-orange-500 hover:bg-orange-600' },
                                    { label: 'Clear', value: 'clear', variant: 'outline', className: 'col-span-2' }
                                ]}
                            />

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