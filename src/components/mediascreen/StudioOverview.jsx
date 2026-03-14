import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monitor, Play, Image as ImageIcon, Palette, Zap, Plus, ExternalLink, Film, TrendingUp } from 'lucide-react';
import { createPageUrl } from '@/utils';
import moment from 'moment';

export default function StudioOverview({ restaurantId, onNavigate }) {
    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: content = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId],
        queryFn: () => base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: mediaFiles = [] } = useQuery({
        queryKey: ['media-files', restaurantId],
        queryFn: () => base44.entities.MediaFile.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const getScreenStatus = (screen) => {
        if (!screen.last_heartbeat) return 'offline';
        const mins = moment().diff(moment(screen.last_heartbeat), 'minutes');
        if (mins < 2) return 'online';
        if (mins < 10) return 'idle';
        return 'offline';
    };

    const onlineCount = screens.filter(s => getScreenStatus(s) === 'online').length;
    const activeContent = content.filter(c => c.is_active).length;
    const totalLoopSecs = content.reduce((sum, c) => sum + (c.duration || 10), 0);

    const stats = [
        { label: 'Total Screens', value: screens.length, icon: Monitor, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
        { label: 'Online Now', value: onlineCount, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
        { label: 'Active Slides', value: activeContent, icon: ImageIcon, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
        { label: 'Media Files', value: mediaFiles.length, icon: Film, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    ];

    const quickActions = [
        { label: 'Manage Playlists', desc: 'Build & order screen content', icon: Play, section: 'playlists', gradient: 'from-blue-500 to-blue-600' },
        { label: 'Upload Media', desc: 'Images, videos & GIFs', icon: ImageIcon, section: 'library', gradient: 'from-emerald-500 to-emerald-600' },
        { label: 'Browse Templates', desc: 'Professional layouts', icon: Palette, section: 'templates', gradient: 'from-violet-500 to-violet-600' },
        { label: 'Live Control', desc: 'Push updates instantly', icon: Zap, section: 'control', gradient: 'from-orange-500 to-orange-600' },
    ];

    return (
        <div className="p-6 max-w-6xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Studio Overview</h1>
                <p className="text-gray-500 text-sm mt-1">Monitor and manage all your digital displays</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={i} className={`border ${stat.border} shadow-none`}>
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{stat.label}</p>
                                        <p className="text-4xl font-bold text-gray-900 mt-1.5 leading-none">{stat.value}</p>
                                    </div>
                                    <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                                        <Icon className={`h-5 w-5 ${stat.color}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Quick actions */}
            <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Quick Actions</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {quickActions.map((action, i) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={i}
                                onClick={() => onNavigate(action.section)}
                                className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 hover:shadow-md transition-all text-left group"
                            >
                                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-4 shadow-md group-hover:scale-105 transition-transform`}>
                                    <Icon className="h-5 w-5 text-white" />
                                </div>
                                <p className="font-bold text-gray-900 text-sm">{action.label}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{action.desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Screens */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Your Screens</p>
                    <Button size="sm" variant="ghost" onClick={() => onNavigate('playlists')} className="text-xs text-orange-500 hover:text-orange-600 h-7">
                        Manage all →
                    </Button>
                </div>

                {screens.length === 0 ? (
                    <Card className="border-2 border-dashed border-gray-200 shadow-none">
                        <CardContent className="py-14 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                                <Monitor className="h-8 w-8 text-gray-400" />
                            </div>
                            <p className="text-gray-700 font-semibold">No screens set up yet</p>
                            <p className="text-xs text-gray-400 mt-1">Add your first screen to get started</p>
                            <Button onClick={() => onNavigate('playlists')} size="sm" className="mt-4 bg-orange-500 hover:bg-orange-600">
                                <Plus className="h-4 w-4 mr-1.5" />
                                Add Your First Screen
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {screens.map(screen => {
                            const status = getScreenStatus(screen);
                            const screenContent = content.filter(c => c.screen_name === screen.screen_name).sort((a,b) => (a.display_order||0) - (b.display_order||0));
                            const screenUrl = `${window.location.origin}${createPageUrl('MediaScreen')}?restaurantId=${restaurantId}&screenName=${encodeURIComponent(screen.screen_name)}`;

                            return (
                                <Card key={screen.id} className="border border-gray-200 shadow-none hover:shadow-md transition-shadow overflow-hidden">
                                    <div className="bg-gray-900 aspect-video relative overflow-hidden flex items-center justify-center">
                                        {screenContent.length > 0 && screenContent[0].media_url ? (
                                            screenContent[0].media_type === 'video' ? (
                                                <video src={screenContent[0].media_url} className="w-full h-full object-cover opacity-80" muted />
                                            ) : (
                                                <img src={screenContent[0].media_url} alt="" className="w-full h-full object-cover opacity-80" />
                                            )
                                        ) : (
                                            <Monitor className="h-10 w-10 text-gray-700" />
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                        <div className="absolute top-3 right-3">
                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm ${
                                                status === 'online' ? 'bg-emerald-500/90 text-white' :
                                                status === 'idle' ? 'bg-yellow-500/90 text-white' :
                                                'bg-gray-700/90 text-gray-300'
                                            }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full bg-current ${status === 'online' ? 'animate-pulse' : ''}`} />
                                                {status}
                                            </div>
                                        </div>
                                        {screenContent.length > 0 && (
                                            <div className="absolute bottom-3 left-3">
                                                <span className="bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
                                                    {screenContent.length} item{screenContent.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 text-sm truncate">{screen.screen_name}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {screen.last_heartbeat ? `Last seen ${moment(screen.last_heartbeat).fromNow()}` : 'Never connected'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 ml-2">
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700" onClick={() => window.open(screenUrl, '_blank')} title="Open screen">
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-orange-500" onClick={() => onNavigate('playlists')} title="Edit playlist">
                                                    <Play className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}