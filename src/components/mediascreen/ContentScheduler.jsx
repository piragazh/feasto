import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, Repeat, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const DAYS_OF_WEEK = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
];

export default function ContentScheduler({ open, onClose, content, onSave }) {
    const [schedule, setSchedule] = useState(content?.schedule || {
        enabled: false,
        start_date: '',
        end_date: '',
        recurring: {
            enabled: false,
            type: 'daily',
            days_of_week: [1, 2, 3, 4, 5],
            time_ranges: [{ start_time: '09:00', end_time: '17:00' }]
        }
    });

    const [priority, setPriority] = useState(content?.priority || 1);

    const handleToggleDay = (day) => {
        const days = schedule.recurring.days_of_week || [];
        setSchedule(prev => ({
            ...prev,
            recurring: {
                ...prev.recurring,
                days_of_week: days.includes(day)
                    ? days.filter(d => d !== day)
                    : [...days, day].sort()
            }
        }));
    };

    const addTimeRange = () => {
        setSchedule(prev => ({
            ...prev,
            recurring: {
                ...prev.recurring,
                time_ranges: [
                    ...(prev.recurring.time_ranges || []),
                    { start_time: '09:00', end_time: '17:00' }
                ]
            }
        }));
    };

    const removeTimeRange = (index) => {
        setSchedule(prev => ({
            ...prev,
            recurring: {
                ...prev.recurring,
                time_ranges: prev.recurring.time_ranges.filter((_, i) => i !== index)
            }
        }));
    };

    const updateTimeRange = (index, field, value) => {
        setSchedule(prev => ({
            ...prev,
            recurring: {
                ...prev.recurring,
                time_ranges: prev.recurring.time_ranges.map((range, i) =>
                    i === index ? { ...range, [field]: value } : range
                )
            }
        }));
    };

    const handleSave = () => {
        if (schedule.enabled) {
            // Validation
            if (schedule.start_date && schedule.end_date) {
                const start = new Date(schedule.start_date);
                const end = new Date(schedule.end_date);
                if (end <= start) {
                    toast.error('End date must be after start date');
                    return;
                }
            }

            if (schedule.recurring.enabled) {
                if (!schedule.recurring.days_of_week || schedule.recurring.days_of_week.length === 0) {
                    toast.error('Please select at least one day');
                    return;
                }
                if (!schedule.recurring.time_ranges || schedule.recurring.time_ranges.length === 0) {
                    toast.error('Please add at least one time range');
                    return;
                }
            }
        }

        onSave({ schedule, priority });
        toast.success('Schedule saved successfully');
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Content Scheduling
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Priority */}
                    <div>
                        <Label>Priority Level (1-10)</Label>
                        <div className="flex items-center gap-4 mt-2">
                            <Input
                                type="number"
                                value={priority}
                                onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
                                min="1"
                                max="10"
                                className="w-24"
                            />
                            <span className="text-sm text-gray-500">
                                Higher priority content shows first when schedules overlap
                            </span>
                        </div>
                    </div>

                    {/* Enable Scheduling */}
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-3">
                            <Clock className="h-5 w-5 text-blue-600" />
                            <div>
                                <Label>Enable Scheduling</Label>
                                <p className="text-xs text-gray-600 mt-1">
                                    Control when this content should display
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={schedule.enabled}
                            onCheckedChange={(checked) => setSchedule(prev => ({ ...prev, enabled: checked }))}
                        />
                    </div>

                    {schedule.enabled && (
                        <Tabs defaultValue="dates">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="dates">Date Range</TabsTrigger>
                                <TabsTrigger value="recurring">Recurring</TabsTrigger>
                            </TabsList>

                            <TabsContent value="dates" className="space-y-4">
                                <div>
                                    <Label>Start Date & Time</Label>
                                    <Input
                                        type="datetime-local"
                                        value={schedule.start_date ? new Date(schedule.start_date).toISOString().slice(0, 16) : ''}
                                        onChange={(e) => setSchedule(prev => ({
                                            ...prev,
                                            start_date: e.target.value ? new Date(e.target.value).toISOString() : ''
                                        }))}
                                        className="mt-1"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Content will start showing from this date/time
                                    </p>
                                </div>

                                <div>
                                    <Label>End Date & Time (Optional)</Label>
                                    <Input
                                        type="datetime-local"
                                        value={schedule.end_date ? new Date(schedule.end_date).toISOString().slice(0, 16) : ''}
                                        onChange={(e) => setSchedule(prev => ({
                                            ...prev,
                                            end_date: e.target.value ? new Date(e.target.value).toISOString() : ''
                                        }))}
                                        className="mt-1"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Leave empty for no end date
                                    </p>
                                </div>

                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-amber-900">
                                        This content will only display between the specified dates. 
                                        Combine with recurring schedules for more precise control.
                                    </p>
                                </div>
                            </TabsContent>

                            <TabsContent value="recurring" className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                                    <div className="flex items-center gap-3">
                                        <Repeat className="h-5 w-5 text-purple-600" />
                                        <div>
                                            <Label>Enable Recurring Schedule</Label>
                                            <p className="text-xs text-gray-600 mt-1">
                                                Show content on specific days and times
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={schedule.recurring.enabled}
                                        onCheckedChange={(checked) => setSchedule(prev => ({
                                            ...prev,
                                            recurring: { ...prev.recurring, enabled: checked }
                                        }))}
                                    />
                                </div>

                                {schedule.recurring.enabled && (
                                    <>
                                        <div>
                                            <Label>Days of Week</Label>
                                            <div className="flex gap-2 mt-2">
                                                {DAYS_OF_WEEK.map(day => (
                                                    <Button
                                                        key={day.value}
                                                        type="button"
                                                        variant={
                                                            schedule.recurring.days_of_week?.includes(day.value)
                                                                ? 'default'
                                                                : 'outline'
                                                        }
                                                        size="sm"
                                                        onClick={() => handleToggleDay(day.value)}
                                                        className="flex-1"
                                                    >
                                                        {day.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <Label>Time Ranges</Label>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={addTimeRange}
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Add Range
                                                </Button>
                                            </div>

                                            <div className="space-y-2">
                                                {(schedule.recurring.time_ranges || []).map((range, index) => (
                                                    <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                                                        <Input
                                                            type="time"
                                                            value={range.start_time}
                                                            onChange={(e) => updateTimeRange(index, 'start_time', e.target.value)}
                                                            className="flex-1"
                                                        />
                                                        <span className="text-gray-500">to</span>
                                                        <Input
                                                            type="time"
                                                            value={range.end_time}
                                                            onChange={(e) => updateTimeRange(index, 'end_time', e.target.value)}
                                                            className="flex-1"
                                                        />
                                                        {schedule.recurring.time_ranges.length > 1 && (
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => removeTimeRange(index)}
                                                            >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <p className="text-xs text-blue-900">
                                                <strong>Example:</strong> Select Mon-Fri with time range 09:00-17:00 
                                                to show content only during business hours on weekdays.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </TabsContent>
                        </Tabs>
                    )}

                    {/* Schedule Summary */}
                    {schedule.enabled && (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <Label className="text-sm font-semibold mb-2 block">Schedule Summary</Label>
                            <div className="space-y-2 text-sm text-gray-700">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline">Priority: {priority}</Badge>
                                </div>
                                {schedule.start_date && (
                                    <p>• Starts: {new Date(schedule.start_date).toLocaleString()}</p>
                                )}
                                {schedule.end_date && (
                                    <p>• Ends: {new Date(schedule.end_date).toLocaleString()}</p>
                                )}
                                {schedule.recurring.enabled && (
                                    <>
                                        <p>• Recurring on: {
                                            schedule.recurring.days_of_week?.map(d => 
                                                DAYS_OF_WEEK.find(day => day.value === d)?.label
                                            ).join(', ')
                                        }</p>
                                        <p>• Time ranges:</p>
                                        {schedule.recurring.time_ranges?.map((range, i) => (
                                            <p key={i} className="ml-4">
                                                - {range.start_time} to {range.end_time}
                                            </p>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 pt-4 border-t">
                        <Button onClick={handleSave} className="flex-1">
                            Save Schedule
                        </Button>
                        <Button onClick={onClose} variant="outline">
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}