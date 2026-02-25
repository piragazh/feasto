import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Clock, Users, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function POSWaitlist({ posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel:      isDark ? 'bg-[#151720] border-gray-700'   : 'bg-white border-gray-200',
        card:       isDark ? 'bg-[#1a1d27] border-white/[0.06] hover:border-yellow-500/50' : 'bg-white border-gray-200 hover:border-yellow-400',
        cardSeated: isDark ? 'bg-green-900/30 border-green-700/50'                         : 'bg-green-50 border-green-200',
        text:       isDark ? 'text-white'                      : 'text-gray-900',
        textMuted:  isDark ? 'text-gray-400'                   : 'text-gray-500',
        textSeated: isDark ? 'text-green-200'                  : 'text-green-700',
        label:      isDark ? 'text-gray-400'                   : 'text-gray-600',
        input:      isDark ? 'bg-[#0f1117] border-white/[0.08] text-white'                 : 'bg-gray-50 border-gray-200 text-gray-900',
        summary:    isDark ? 'bg-white/[0.04]'                 : 'bg-gray-50',
        emptyText:  isDark ? 'text-gray-400'                   : 'text-gray-400',
    };
    const [waitlist, setWaitlist] = useState([]);
    const [guestName, setGuestName] = useState('');
    const [partySize, setPartySize] = useState('2');

    const addToWaitlist = () => {
        if (!guestName.trim() || !partySize) {
            toast.error('Please enter guest name and party size');
            return;
        }

        const newGuest = {
            id: `guest_${Date.now()}`,
            name: guestName,
            partySize: parseInt(partySize),
            timestamp: new Date(),
            waitTime: 0,
            status: 'waiting'
        };

        setWaitlist(prev => [...prev, newGuest]);
        setGuestName('');
        setPartySize('2');
        toast.success(`${guestName} added to waitlist`);
    };

    const removeFromWaitlist = (id) => {
        setWaitlist(prev => prev.filter(guest => guest.id !== id));
    };

    const seatGuest = (id) => {
        setWaitlist(prev => prev.map(guest => 
            guest.id === id ? { ...guest, status: 'seated' } : guest
        ));
        const guest = waitlist.find(g => g.id === id);
        toast.success(`${guest.name} has been seated`);
    };

    const getWaitTime = (timestamp) => {
        const minutes = Math.floor((new Date() - timestamp) / 60000);
        return minutes > 0 ? `${minutes}m` : '<1m';
    };

    const waitingGuests = waitlist.filter(g => g.status === 'waiting');
    const seatedGuests = waitlist.filter(g => g.status === 'seated');

    return (
        <div className="grid grid-cols-3 gap-4 h-[calc(100vh-200px)]">
            {/* Add Guest Form */}
            <div className={`${t.panel} rounded-xl border p-4 h-fit`}>
                <h2 className={`${t.text} font-bold text-lg mb-4`}>Add Guest</h2>
                <div className="space-y-3">
                    <div>
                        <label className={`${t.label} text-sm block mb-1`}>Guest Name</label>
                        <Input
                            type="text"
                            placeholder="John Smith"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && addToWaitlist()}
                            className={`${t.input} border`}
                        />
                    </div>
                    <div>
                        <label className={`${t.label} text-sm block mb-1`}>Party Size</label>
                        <Input
                            type="number"
                            min="1"
                            max="20"
                            value={partySize}
                            onChange={(e) => setPartySize(e.target.value)}
                            className={`${t.input} border`}
                        />
                    </div>
                    <Button
                        onClick={addToWaitlist}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-10"
                    >
                        Add to Waitlist
                    </Button>
                </div>

                {/* Summary */}
                <div className={`mt-6 space-y-2 ${t.summary} p-3 rounded-xl`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-yellow-400" />
                            <span className={t.textMuted}>Waiting</span>
                        </div>
                        <span className={`${t.text} font-bold text-lg`}>{waitingGuests.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-400" />
                            <span className={t.textMuted}>Seated</span>
                        </div>
                        <span className={`${t.text} font-bold text-lg`}>{seatedGuests.length}</span>
                    </div>
                </div>
            </div>

            {/* Waiting Guests */}
            <div className={`${t.panel} rounded-xl border p-4 overflow-hidden flex flex-col`}>
                <h2 className={`${t.text} font-bold text-lg mb-4`}>Waiting ({waitingGuests.length})</h2>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {waitingGuests.length === 0 ? (
                        <p className={`${t.emptyText} text-center py-8`}>No guests waiting</p>
                    ) : (
                        waitingGuests.map((guest, index) => (
                            <Card key={guest.id} className={`${t.card} border transition-colors`}>
                                <CardContent className="p-3">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-yellow-500 text-white">{index + 1}</Badge>
                                                <p className={`${t.text} font-bold`}>{guest.name}</p>
                                            </div>
                                            <p className={`${t.textMuted} text-xs mt-1 flex items-center gap-1`}>
                                                <Users className="h-3 w-3" /> {guest.partySize} guests
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <Badge className="bg-blue-600 text-white">
                                                <Clock className="h-3 w-3 mr-1" />
                                                {getWaitTime(guest.timestamp)}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <Button
                                            onClick={() => seatGuest(guest.id)}
                                            size="sm"
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                                        >
                                            Seat
                                        </Button>
                                        <Button
                                            onClick={() => removeFromWaitlist(guest.id)}
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 text-red-400 hover:text-red-300"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>

            {/* Seated Guests */}
            <div className={`${t.panel} rounded-xl border p-4 overflow-hidden flex flex-col`}>
                <h2 className={`${t.text} font-bold text-lg mb-4`}>Seated ({seatedGuests.length})</h2>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {seatedGuests.length === 0 ? (
                        <p className={`${t.emptyText} text-center py-8`}>No seated guests</p>
                    ) : (
                        seatedGuests.map((guest) => (
                            <Card key={guest.id} className={`${t.cardSeated} border`}>
                                <CardContent className="p-3">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className={`${t.text} font-bold`}>{guest.name}</p>
                                            <p className={`${t.textSeated} text-xs mt-1 flex items-center gap-1`}>
                                                <Users className="h-3 w-3" /> {guest.partySize} guests
                                            </p>
                                        </div>
                                        <Check className="h-5 w-5 text-green-400" />
                                    </div>
                                    <Button
                                        onClick={() => removeFromWaitlist(guest.id)}
                                        variant="ghost"
                                        size="sm"
                                        className={`w-full text-xs h-8 ${t.textMuted} hover:${isDark ? 'text-white' : 'text-gray-900'}`}
                                    >
                                        Remove
                                    </Button>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}