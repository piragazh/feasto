import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function NotificationBell({ userEmail }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: notifications = [] } = useQuery({
        queryKey: ['notifications', userEmail],
        queryFn: () => base44.entities.Notification.filter({ user_email: userEmail }, '-created_date', 50),
        refetchInterval: 5000,
        enabled: !!userEmail
    });

    const { data: settings } = useQuery({
        queryKey: ['notification-sound-setting'],
        queryFn: async () => {
            const result = await base44.asServiceRole.entities.SystemSettings.filter({ 
                setting_key: 'notification_sound_url' 
            });
            return result?.[0] || null;
        }
    });

    const markAsReadMutation = useMutation({
        mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
        onSuccess: () => queryClient.invalidateQueries(['notifications'])
    });

    const markAllAsReadMutation = useMutation({
        mutationFn: async () => {
            const unread = notifications.filter(n => !n.is_read);
            await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { is_read: true })));
        },
        onSuccess: () => queryClient.invalidateQueries(['notifications'])
    });

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const playNotificationSound = () => {
        if (settings?.setting_value) {
            const audio = new Audio(settings.setting_value);
            audio.play().catch(err => console.log('Audio play error:', err));
        }
    };

    const handleNotificationClick = (notification) => {
        if (!notification.is_read) {
            markAsReadMutation.mutate(notification.id);
        }
        if (notification.order_id) {
            navigate(createPageUrl('Orders'));
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500">
                            {unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold">Notifications</h3>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAllAsReadMutation.mutate()}
                            className="text-xs"
                        >
                            <CheckCheck className="h-3 w-3 mr-1" />
                            Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="h-96">
                    {notifications.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No notifications yet
                        </div>
                    ) : (
                        <div>
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                                        !notification.is_read ? 'bg-blue-50' : ''
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-1">
                                        <p className="font-semibold text-sm">{notification.title}</p>
                                        {!notification.is_read && (
                                            <span className="h-2 w-2 bg-blue-500 rounded-full mt-1"></span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600">{notification.message}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {format(new Date(notification.created_date), 'MMM d, h:mm a')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}