import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, RefreshCw, Circle } from 'lucide-react';

export default function PrinterStatusBadge({ service, label }) {
    const [status, setStatus] = useState(() => service.getConnectionStatus());

    useEffect(() => {
        service.setConnectionStatusCallback(() => setStatus(service.getConnectionStatus()));
        setStatus(service.getConnectionStatus());
        service.startHeartbeat(6000);
        return () => {
            service.stopHeartbeat();
            service.setConnectionStatusCallback(null);
        };
    }, [service]);

    const { connected, reconnecting, printerName } = status;

    if (reconnecting) return (
        <Badge className="bg-amber-100 text-amber-700 gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />Reconnecting…
        </Badge>
    );
    if (connected) return (
        <Badge className="bg-green-100 text-green-700 gap-1">
            <CheckCircle2 className="h-3 w-3" />{printerName || label} — Connected
        </Badge>
    );
    return (
        <Badge className="bg-gray-100 text-gray-500 gap-1">
            <Circle className="h-3 w-3" />{label} — Not Connected
        </Badge>
    );
}