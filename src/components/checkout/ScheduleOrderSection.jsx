import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Calendar, Clock } from 'lucide-react';

export default function ScheduleOrderSection({ isScheduled, onScheduleToggle, scheduledFor, onScheduleChange }) {
    const minDateTime = new Date();
    minDateTime.setHours(minDateTime.getHours() + 1);
    const minDateTimeString = minDateTime.toISOString().slice(0, 16);

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
                            Delivery Time
                        </Label>
                        <Input
                            type="datetime-local"
                            min={minDateTimeString}
                            value={scheduledFor}
                            onChange={(e) => onScheduleChange(e.target.value)}
                            className="h-12"
                            required={isScheduled}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Schedule at least 1 hour in advance
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}