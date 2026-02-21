import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Zap, AlertCircle } from 'lucide-react';

export default function OrderSummary({ order }) {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        generateSummary();
    }, [order.id]);

    const generateSummary = async () => {
        try {
            setLoading(true);
            setError(null);

            const prompt = `Generate a concise 1-2 sentence summary of this order. Focus on: items ordered, customer special requests/notes, and delivery/pickup type. Be brief and factual.

Order Details:
- Items: ${order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
- Type: ${order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'collection' ? 'Collection/Pickup' : order.order_type}
- Address: ${order.delivery_address ? order.delivery_address : 'N/A'}
- Special Notes: ${order.notes || 'None'}
- Customer Phone: ${order.phone || 'Not provided'}`;

            const result = await base44.integrations.Core.InvokeLLM({
                prompt,
            });

            setSummary(result);
        } catch (err) {
            setError('Could not generate summary');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-blue-600">Generating summary...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 rounded-lg p-3 border border-red-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <span className="text-xs text-red-600">{error}</span>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
            <div className="flex gap-2">
                <Zap className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                    <p className="text-xs font-medium text-indigo-900 leading-relaxed">
                        {summary}
                    </p>
                </div>
            </div>
        </div>
    );
}