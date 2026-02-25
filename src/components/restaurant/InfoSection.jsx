import React from 'react';
import { Info, AlertCircle, Star, Bell, Heart, Zap } from 'lucide-react';

const iconMap = {
    info: Info,
    alert: AlertCircle,
    star: Star,
    bell: Bell,
    heart: Heart,
    zap: Zap,
    none: null
};

export default function InfoSection({ infoSection }) {
    if (!infoSection?.enabled || !infoSection?.message) return null;

    const Icon = iconMap[infoSection.icon || 'info'];

    return (
        <div className="mb-4">
            <div
                className="rounded-lg p-4 border-2 flex items-start gap-3"
                style={{
                    backgroundColor: infoSection.background_color || '#f0f9ff',
                    borderColor: infoSection.border_color || '#0ea5e9'
                }}
            >
                {Icon && (
                    <Icon
                        className="h-5 w-5 flex-shrink-0 mt-0.5"
                        style={{ color: infoSection.text_color || '#0369a1' }}
                    />
                )}
                <p
                    className="text-sm leading-relaxed"
                    style={{ color: infoSection.text_color || '#0369a1' }}
                >
                    {infoSection.message}
                </p>
            </div>
        </div>
    );
}