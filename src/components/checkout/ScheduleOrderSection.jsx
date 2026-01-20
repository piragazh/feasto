import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Calendar, Clock } from 'lucide-react';

export default function ScheduleOrderSection({ isScheduled, onScheduleToggle, scheduledFor, onScheduleChange, restaurant, orderType }) {
    const minDateTime = new Date();
    minDateTime.setHours(minDateTime.getHours() + 1);
    const minDateTimeString = minDateTime.toISOString().slice(0, 16);

    // Get next available time slot based on restaurant hours (memoized)
    const getNextAvailableTime = React.useMemo(() => () => {
        if (!restaurant) return minDateTimeString;
        
        const now = new Date();
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        
        let hours;
        if (orderType === 'collection' && restaurant.collection_hours) {
            hours = restaurant.collection_hours[dayName];
        } else if (orderType === 'delivery' && restaurant.delivery_hours) {
            hours = restaurant.delivery_hours[dayName];
        } else {
            hours = restaurant.opening_hours?.[dayName];
        }

        if (!hours || hours.closed) {
            // Find next open day
            for (let i = 1; i <= 7; i++) {
                const nextDay = new Date(now);
                nextDay.setDate(nextDay.getDate() + i);
                const nextDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nextDay.getDay()];
                
                let nextHours;
                if (orderType === 'collection' && restaurant.collection_hours) {
                    nextHours = restaurant.collection_hours[nextDayName];
                } else if (orderType === 'delivery' && restaurant.delivery_hours) {
                    nextHours = restaurant.delivery_hours[nextDayName];
                } else {
                    nextHours = restaurant.opening_hours?.[nextDayName];
                }

                if (nextHours && !nextHours.closed) {
                    const [hour, min] = nextHours.open.split(':').map(Number);
                    nextDay.setHours(hour, min, 0, 0);
                    return nextDay.toISOString().slice(0, 16);
                }
            }
            return minDateTimeString;
        }

        const [openHour, openMin] = hours.open.split(':').map(Number);
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const openTime = openHour * 60 + openMin;

        // If current time + 1 hour is before opening, set to opening time
        if (currentTime + 60 < openTime) {
            const nextAvailable = new Date(now);
            nextAvailable.setHours(openHour, openMin, 0, 0);
            return nextAvailable.toISOString().slice(0, 16);
        }

        return minDateTimeString;
    }, [restaurant, orderType, minDateTimeString]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-orange-500" />
                    Schedule Order
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-base">Order for later?</Label>
                        <p className="text-sm text-gray-500">Schedule your order for a specific time</p>
                    </div>
                    <Switch checked={isScheduled} onCheckedChange={onScheduleToggle} />
                </div>
                
                {isScheduled && (
                    <div>
                        <Label className="flex items-center gap-2 mb-2">
                            <Clock className="h-4 w-4" />
                            {orderType === 'collection' ? 'Collection' : 'Delivery'} Time
                        </Label>
                        <Input
                            type="datetime-local"
                            min={getNextAvailableTime()}
                            value={scheduledFor}
                            onChange={(e) => onScheduleChange(e.target.value)}
                            className="h-12"
                            required={isScheduled}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Schedule during {orderType === 'collection' ? 'collection' : 'delivery'} hours only
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}