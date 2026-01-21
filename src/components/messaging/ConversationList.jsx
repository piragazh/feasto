import React from 'react';
import { Badge } from "@/components/ui/badge";
import { User, Store, Truck } from 'lucide-react';
import moment from 'moment';

export default function ConversationList({ conversations = [], selectedConversation, onSelectConversation, currentUser }) {
    const getIcon = (iconType) => {
        switch (iconType) {
            case 'restaurant': return Store;
            case 'driver': return Truck;
            default: return User;
        }
    };

    if (!conversations || conversations.length === 0) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-500 text-sm">No conversations yet</p>
            </div>
        );
    }

    return (
        <div className="divide-y">
            {conversations.map((conversation) => {
                const Icon = getIcon(conversation.icon);
                const unreadCount = conversation.unread_count || 0;
                const isSelected = selectedConversation?.id === conversation.id;

                return (
                    <div
                        key={conversation.id}
                        onClick={() => onSelectConversation(conversation)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                            isSelected ? 'bg-orange-50 border-l-4 border-orange-500' : ''
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                conversation.icon === 'restaurant' ? 'bg-blue-100' :
                                conversation.icon === 'driver' ? 'bg-green-100' : 'bg-gray-100'
                            }`}>
                                <Icon className={`h-5 w-5 ${
                                    conversation.icon === 'restaurant' ? 'text-blue-600' :
                                    conversation.icon === 'driver' ? 'text-green-600' : 'text-gray-600'
                                }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <h4 className="font-semibold text-sm truncate">{conversation.displayName}</h4>
                                    {conversation.last_message_time && (
                                        <span className="text-xs text-gray-500">
                                            {moment(conversation.last_message_time).fromNow()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-xs text-gray-600 truncate flex-1">
                                        {conversation.last_message || 'No messages yet'}
                                    </p>
                                    {conversation.type && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                            {conversation.type === 'order' ? 'Order' : 
                                             conversation.type === 'driver' ? 'Driver' : 'Chat'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {unreadCount > 0 && (
                                <Badge className="bg-orange-500 text-white">
                                    {unreadCount}
                                </Badge>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}