import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function OpeningHours({ openingHours, isOpen }) {
    const [expanded, setExpanded] = useState(false);

    if (!openingHours) return null;

    const today = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    const todayHours = openingHours[today];

    const isCurrentlyOpen = () => {
        if (!todayHours || todayHours.closed || !todayHours.open || !todayHours.close) return false;
        
        try {
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            const [openHour, openMin] = todayHours.open.split(':').map(Number);
            const [closeHour, closeMin] = todayHours.close.split(':').map(Number);
            
            const openTime = openHour * 60 + openMin;
            const closeTime = closeHour * 60 + closeMin;
            
            return currentTime >= openTime && currentTime <= closeTime;
        } catch (e) {
            return false;
        }
    };

    const formatTime = (time) => {
        if (!time) return null;
        
        // Handle both string and object formats
        const timeStr = typeof time === 'string' ? time : 
                       (typeof time === 'object' && time !== null) ? JSON.stringify(time) : 
                       String(time);
        
        if (!timeStr || !timeStr.includes(':')) return null;
        
        const [hour, min] = timeStr.split(':');
        if (!hour || !min) return null;
        
        const h = parseInt(hour);
        if (isNaN(h)) return null;
        
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return `${displayHour}:${min} ${ampm}`;
    };

    return (
        <Card>
            <CardHeader 
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-orange-500" />
                        <div className="flex flex-col">
                            <span>Opening Hours</span>
                            {todayHours && !todayHours.closed && (
                                <span className="text-sm font-normal text-gray-500">
                                    Today: {formatTime(todayHours.open)} - {formatTime(todayHours.close)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isCurrentlyOpen() ? (
                            <Badge className="bg-green-100 text-green-800">Open Now</Badge>
                        ) : (
                            <Badge className="bg-red-100 text-red-800">Closed</Badge>
                        )}
                        {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                </CardTitle>
            </CardHeader>
            {expanded && (
                <CardContent className="space-y-2">
                    {DAYS.map((day) => {
                        const hours = openingHours[day];
                        const isToday = day === today;
                        
                        const openFormatted = formatTime(hours?.open);
                        const closeFormatted = formatTime(hours?.close);
                        
                        return (
                            <div 
                                key={day}
                                className={`flex justify-between text-sm ${isToday ? 'font-semibold text-orange-600' : 'text-gray-600'}`}
                            >
                                <span className="capitalize">{day}</span>
                                <span>
                                    {!hours ? (
                                        'Not set'
                                    ) : hours.closed === true ? (
                                        'Closed'
                                    ) : openFormatted !== null && closeFormatted !== null ? (
                                        `${openFormatted} - ${closeFormatted}`
                                    ) : (
                                        'Not set'
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </CardContent>
            )}
        </Card>
    );
}