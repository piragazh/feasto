import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
    Link as LinkIcon, 
    Copy, 
    Store, 
    MessageSquare,
    CheckCircle,
    Clock,
    DollarSign,
    LayoutDashboard,
    UtensilsCrossed,
    Monitor
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function RestaurantManagement() {
    const [searchQuery, setSearchQuery] = useState('');
    const [onboardingDialog, setOnboardingDialog] = useState(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const updateMediaScreenStatus = useMutation({
        mutationFn: ({ restaurantId, enabled }) => 
            base44.entities.Restaurant.update(restaurantId, { media_screen_enabled: enabled }),
        onSuccess: () => {
            queryClient.invalidateQueries(['all-restaurants']);
            toast.success('Media screen access updated');
        },
    });

    const generateOnboardingLink = useMutation({
        mutationFn: async (restaurantId) => {
            const token = `onboard_${restaurantId}_${Date.now()}`;
            await base44.entities.Restaurant.update(restaurantId, {
                onboarding_token: token,
                onboarding_status: 'in_progress'
            });
            return token;
        },
        onSuccess: (token, restaurantId) => {
            queryClient.invalidateQueries(['all-restaurants']);
            const restaurant = restaurants.find(r => r.id === restaurantId);
            setOnboardingDialog({ restaurant, token });
        },
    });

    const filteredRestaurants = restaurants.filter(r =>
        r.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getOnboardingLink = (token) => {
        if (!token) return '';
        const path = window.location.pathname || '';
        const basePath = path.split('#')[0] || '';
        return `${window.location.origin}${basePath}#/RestaurantOnboarding?token=${token}`;
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    const statusColor = {
        pending: 'bg-yellow-100 text-yellow-800',
        in_progress: 'bg-blue-100 text-blue-800',
        completed: 'bg-green-100 text-green-800',
    };

    return (
        <div className="space-y-6">
            {/* Search */}
            <Card>
                <CardContent className="pt-6">
                    <Input
                        placeholder="Search restaurants..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="max-w-md"
                    />
                </CardContent>
            </Card>

            {/* Restaurant List */}
            <div className="grid gap-4">
                {filteredRestaurants.map(restaurant => (
                    <Card key={restaurant.id}>
                        <CardContent className="pt-6">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-start gap-4">
                                    {restaurant.image_url && (
                                        <img
                                            src={restaurant.image_url}
                                            alt={restaurant.name}
                                            className="w-16 h-16 rounded-lg object-cover"
                                        />
                                    )}
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-lg text-gray-900">{restaurant.name}</h3>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <Badge variant="outline">{restaurant.cuisine_type}</Badge>
                                            <Badge className={statusColor[restaurant.onboarding_status || 'pending']}>
                                                {restaurant.onboarding_status || 'pending'}
                                            </Badge>
                                            {restaurant.commission_rate && (
                                                <Badge className="bg-purple-100 text-purple-800">
                                                    {restaurant.commission_rate}% commission
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 mt-2">{restaurant.address}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                    <Monitor className="h-5 w-5 text-gray-600" />
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium">Media Screen Access</Label>
                                        <p className="text-xs text-gray-500">Enable promotional display screens</p>
                                    </div>
                                    <Switch
                                        checked={restaurant.media_screen_enabled || false}
                                        onCheckedChange={(checked) => 
                                            updateMediaScreenStatus.mutate({ 
                                                restaurantId: restaurant.id, 
                                                enabled: checked 
                                            })
                                        }
                                    />
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => navigate(createPageUrl('RestaurantDashboard') + `?restaurantId=${restaurant.id}`)}
                                    >
                                        <LayoutDashboard className="h-4 w-4 mr-1" />
                                        Dashboard
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => navigate(createPageUrl('POSDashboard') + `?restaurantId=${restaurant.id}`)}
                                        className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                                    >
                                        <UtensilsCrossed className="h-4 w-4 mr-1" />
                                        POS
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => generateOnboardingLink.mutate(restaurant.id)}
                                    >
                                        <LinkIcon className="h-4 w-4 mr-1" />
                                        Onboarding Link
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                    >
                                        <MessageSquare className="h-4 w-4 mr-1" />
                                        Message
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Onboarding Link Dialog */}
            <Dialog open={!!onboardingDialog} onOpenChange={() => setOnboardingDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Onboarding Link Generated</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Share this link with <strong>{onboardingDialog?.restaurant.name}</strong> to complete their onboarding:
                        </p>
                        <div className="bg-gray-50 p-3 rounded-lg break-all text-sm">
                            {onboardingDialog && getOnboardingLink(onboardingDialog.token)}
                        </div>
                        <Button
                            onClick={() => onboardingDialog?.token && copyToClipboard(getOnboardingLink(onboardingDialog.token))}
                            className="w-full"
                            disabled={!onboardingDialog?.token}
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Link
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}