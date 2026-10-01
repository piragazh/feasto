import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from 'lucide-react';

/** "Proof of play": what actually showed on screen, how often and for how long. */

const formatDuration = (s) => {
    const sec = Math.round(Number(s) || 0);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
};

export default function StudioPlayReport({ restaurantId }) {
    const [days, setDays] = useState('7');

    const { data, isLoading, isError } = useQuery({
        queryKey: ['play-report', restaurantId, days],
        queryFn: async () => {
            const res = await base44.functions.invoke('screenDevice', { action: 'play_report', restaurant_id: restaurantId, days: Number(days) });
            return res?.data ?? res;
        },
        enabled: !!restaurantId,
        staleTime: 60000,
    });

    const content = data?.content || [];
    const maxSeconds = Math.max(1, ...content.map(c => c.seconds || 0));

    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-orange-500" />
                        <div>
                            <h3 className="font-semibold text-gray-900">Proof of play</h3>
                            <p className="text-xs text-gray-500">What your paired screens actually showed</p>
                        </div>
                    </div>
                    <Select value={days} onValueChange={setDays}>
                        <SelectTrigger className="h-8 w-32" aria-label="Report period"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">Today</SelectItem>
                            <SelectItem value="7">Last 7 days</SelectItem>
                            <SelectItem value="30">Last 30 days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {isLoading ? (
                    <p className="text-sm text-gray-400">Loading…</p>
                ) : isError ? (
                    <p className="text-sm text-gray-500">Couldn't load the report.</p>
                ) : content.length === 0 ? (
                    <p className="text-sm text-gray-500">No plays recorded yet. Screens report once they're paired (Screens &amp; Playlists → Pair device).</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-500 border-b">
                                    <th className="py-2 pr-3 font-medium">Content</th>
                                    <th className="py-2 pr-3 font-medium text-right">Plays</th>
                                    <th className="py-2 pr-3 font-medium text-right">On screen</th>
                                    <th className="py-2 font-medium w-1/3"><span className="sr-only">Share</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {content.slice(0, 15).map(c => (
                                    <tr key={c.content_id} className="border-b last:border-0">
                                        <td className="py-2 pr-3">
                                            <p className="text-gray-900 truncate max-w-[220px]">{c.title || 'Untitled'}</p>
                                            <p className="text-xs text-gray-400 truncate max-w-[220px]">{(c.screens || []).join(', ')}</p>
                                        </td>
                                        <td className="py-2 pr-3 text-right tabular-nums">{(c.plays || 0).toLocaleString('en-GB')}</td>
                                        <td className="py-2 pr-3 text-right tabular-nums">{formatDuration(c.seconds)}</td>
                                        <td className="py-2">
                                            <div className="h-2 rounded-full bg-gray-100">
                                                <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.round(((c.seconds || 0) / maxSeconds) * 100)}%` }} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
