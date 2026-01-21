import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from 'lucide-react';

export default function OrderSearch({ onSearch }) {
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (e) => {
        e.preventDefault();
        onSearch(searchQuery);
        setSearchQuery('');
    };

    return (
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <Input
                type="text"
                placeholder="Search by Order ID or Customer Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            />
            <Button 
                type="submit"
                className="bg-orange-500 hover:bg-orange-600 text-white"
            >
                <Search className="h-4 w-4 mr-2" />
                Search
            </Button>
        </form>
    );
}