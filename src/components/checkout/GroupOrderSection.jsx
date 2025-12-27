import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function GroupOrderSection({ groupOrderId, shareCode, onCreateGroupOrder, isHost }) {
    const [copied, setCopied] = useState(false);

    const copyShareLink = () => {
        const shareLink = `${window.location.origin}${createPageUrl('GroupOrder')}?code=${shareCode}`;
        navigator.clipboard.writeText(shareLink);
        setCopied(true);
        toast.success('Link copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
    };

    if (!groupOrderId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-orange-500" />
                        Group Order
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-600 mb-4">
                        Start a group order and invite friends to add their items before checking out together.
                    </p>
                    <Button onClick={onCreateGroupOrder} variant="outline" className="w-full">
                        <Users className="h-4 w-4 mr-2" />
                        Start Group Order
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-orange-500" />
                        Group Order Active
                    </CardTitle>
                    {isHost && <Badge className="bg-orange-500">Host</Badge>}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-gray-700">
                    Share this link with friends so they can add their items:
                </p>
                <div className="flex gap-2">
                    <Button
                        onClick={copyShareLink}
                        variant="outline"
                        className="flex-1"
                    >
                        {copied ? (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Link
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={() => window.open(`${window.location.origin}${createPageUrl('GroupOrder')}?code=${shareCode}`, '_blank')}
                        variant="outline"
                        size="icon"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                </div>
                <p className="text-xs text-gray-500">
                    Code: <span className="font-mono font-semibold">{shareCode}</span>
                </p>
            </CardContent>
        </Card>
    );
}