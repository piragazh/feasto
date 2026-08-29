import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Check, Rows, Grid3x3, Maximize2, List } from 'lucide-react';
import { toast } from 'sonner';

const LAYOUTS = [
    {
        id: 'classic',
        label: 'Classic',
        description: 'All options shown at once in a compact scrollable list. Fast for experienced staff.',
        icon: List,
    },
    {
        id: 'stepped',
        label: 'Stepped',
        description: 'One option group per screen with large tap-friendly buttons. Ideal for touch POS terminals.',
        icon: Rows,
    },
    {
        id: 'grid',
        label: 'Grid Tiles',
        description: 'Options shown as 2-column tiles on a single scrollable screen. Great balance of speed and touch usability.',
        icon: Grid3x3,
    },
    {
        id: 'fullscreen',
        label: 'Fullscreen',
        description: 'One option fills the entire screen at a time — maximum tap target. Best for kiosk-style touch terminals.',
        icon: Maximize2,
    },
];

export default function POSCustomizationLayoutSelector({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
        enabled: !!restaurantId,
    });

    const current = restaurant?.pos_customization_layout || 'classic';

    const mutation = useMutation({
        mutationFn: (layout) => base44.entities.Restaurant.update(restaurantId, { pos_customization_layout: layout }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
            toast.success('Customisation layout saved');
        },
        onError: () => toast.error('Failed to save'),
    });

    return (
        <div className="space-y-3">
            {LAYOUTS.map(layout => {
                const Icon = layout.icon;
                const isSelected = current === layout.id;
                return (
                    <button
                        key={layout.id}
                        onClick={() => mutation.mutate(layout.id)}
                        className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                            isSelected
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:border-orange-300 bg-white'
                        }`}
                    >
                        <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${isSelected ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <p className={`font-semibold ${isSelected ? 'text-orange-700' : 'text-gray-900'}`}>{layout.label}</p>
                            <p className="text-sm text-gray-500 mt-0.5">{layout.description}</p>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />}
                    </button>
                );
            })}
        </div>
    );
}