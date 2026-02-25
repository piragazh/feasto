import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

const LAYOUTS = [
    {
        id: 'standard',
        name: 'Standard',
        description: 'Categories left · Menu centre · Cart right',
        preview: (
            <div className="grid grid-cols-12 gap-1 h-16 w-full">
                <div className="col-span-2 bg-orange-400/60 rounded" />
                <div className="col-span-7 bg-blue-400/60 rounded" />
                <div className="col-span-3 bg-green-400/60 rounded" />
            </div>
        ),
    },
    {
        id: 'compact',
        name: 'Compact',
        description: 'Narrow categories · Wide menu · Slim cart',
        preview: (
            <div className="grid grid-cols-12 gap-1 h-16 w-full">
                <div className="col-span-1 bg-orange-400/60 rounded" />
                <div className="col-span-8 bg-blue-400/60 rounded" />
                <div className="col-span-3 bg-green-400/60 rounded" />
            </div>
        ),
    },
    {
        id: 'menu_focus',
        name: 'Menu Focus',
        description: 'No category panel · Full-width menu · Cart right',
        preview: (
            <div className="grid grid-cols-12 gap-1 h-16 w-full">
                <div className="col-span-9 bg-blue-400/60 rounded" />
                <div className="col-span-3 bg-green-400/60 rounded" />
            </div>
        ),
    },
    {
        id: 'cart_focus',
        name: 'Cart Focus',
        description: 'Categories left · Menu centre · Wide cart',
        preview: (
            <div className="grid grid-cols-12 gap-1 h-16 w-full">
                <div className="col-span-2 bg-orange-400/60 rounded" />
                <div className="col-span-5 bg-blue-400/60 rounded" />
                <div className="col-span-5 bg-green-400/60 rounded" />
            </div>
        ),
    },
];

export default function POSLayoutSelector({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
        enabled: !!restaurantId,
    });

    const mutation = useMutation({
        mutationFn: (layout) => base44.entities.Restaurant.update(restaurantId, { pos_layout: layout }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
            toast.success('POS layout saved');
        },
        onError: () => toast.error('Failed to save layout'),
    });

    const current = restaurant?.pos_layout || 'standard';

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LAYOUTS.map(layout => {
                    const active = current === layout.id;
                    return (
                        <button
                            key={layout.id}
                            onClick={() => mutation.mutate(layout.id)}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                active
                                    ? 'border-orange-500 bg-orange-50'
                                    : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50'
                            }`}
                        >
                            {active && (
                                <span className="absolute top-3 right-3 text-orange-500">
                                    <CheckCircle2 className="h-5 w-5" />
                                </span>
                            )}
                            <div className="mb-3">{layout.preview}</div>
                            <p className="font-semibold text-gray-900 text-sm">{layout.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{layout.description}</p>
                        </button>
                    );
                })}
            </div>
            <div className="flex gap-2 text-xs text-gray-400 pt-1">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400/60 inline-block" /> Categories</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400/60 inline-block" /> Menu</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400/60 inline-block" /> Cart</span>
            </div>
        </div>
    );
}