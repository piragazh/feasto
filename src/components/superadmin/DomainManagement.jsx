import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Globe, CheckCircle, XCircle, Edit, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function DomainManagement() {
    const [showDialog, setShowDialog] = useState(false);
    const [selectedRestaurant, setSelectedRestaurant] = useState(null);
    const [domain, setDomain] = useState('');
    const queryClient = useQueryClient();

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const updateDomainMutation = useMutation({
        mutationFn: ({ id, custom_domain, domain_verified }) => 
            base44.entities.Restaurant.update(id, { custom_domain, domain_verified }),
        onSuccess: () => {
            queryClient.invalidateQueries(['all-restaurants']);
            toast.success('Domain updated successfully');
            setShowDialog(false);
            setSelectedRestaurant(null);
            setDomain('');
        },
    });

    const handleEdit = (restaurant) => {
        setSelectedRestaurant(restaurant);
        setDomain(restaurant.custom_domain || '');
        setShowDialog(true);
    };

    const handleSave = () => {
        if (!domain) {
            toast.error('Please enter a domain');
            return;
        }

        // Basic domain validation
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
        if (!domainRegex.test(domain)) {
            toast.error('Please enter a valid domain (e.g., restaurant.com)');
            return;
        }

        updateDomainMutation.mutate({
            id: selectedRestaurant.id,
            custom_domain: domain,
            domain_verified: false
        });
    };

    const handleVerify = (restaurant) => {
        updateDomainMutation.mutate({
            id: restaurant.id,
            custom_domain: restaurant.custom_domain,
            domain_verified: true
        });
    };

    const handleRemove = (restaurant) => {
        if (confirm(`Remove custom domain for ${restaurant.name}?`)) {
            updateDomainMutation.mutate({
                id: restaurant.id,
                custom_domain: null,
                domain_verified: false
            });
        }
    };

    const copyDNSInstructions = () => {
        const instructions = `DNS Configuration Instructions:

1. Add a CNAME record:
   - Name: @ (or your subdomain)
   - Value: ${window.location.hostname}
   - TTL: 3600

2. Or add an A record:
   - Name: @ (or your subdomain)
   - Value: [Your server IP]
   - TTL: 3600

3. Wait for DNS propagation (can take up to 48 hours)`;

        navigator.clipboard.writeText(instructions);
        toast.success('DNS instructions copied to clipboard');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Domain Management</h2>
                    <p className="text-gray-600 text-sm">Configure custom domains for restaurants</p>
                </div>
                <Button onClick={copyDNSInstructions} variant="outline">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy DNS Instructions
                </Button>
            </div>

            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                        <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-blue-900 mb-1">How Custom Domains Work</h3>
                            <p className="text-sm text-blue-800 mb-2">
                                When a customer visits the custom domain, they'll see that restaurant's page as the landing page.
                            </p>
                            <p className="text-sm text-blue-800">
                                <strong>Setup:</strong> Restaurant owner needs to point their domain DNS to this platform's server.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4">
                {restaurants.map((restaurant) => (
                    <Card key={restaurant.id}>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-semibold">{restaurant.name}</h3>
                                        {restaurant.custom_domain ? (
                                            <Badge variant={restaurant.domain_verified ? 'default' : 'secondary'}>
                                                {restaurant.domain_verified ? (
                                                    <>
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        Verified
                                                    </>
                                                ) : (
                                                    <>
                                                        <XCircle className="h-3 w-3 mr-1" />
                                                        Pending
                                                    </>
                                                )}
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline">No Domain</Badge>
                                        )}
                                    </div>
                                    {restaurant.custom_domain ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Globe className="h-4 w-4 text-gray-500" />
                                            <a 
                                                href={`https://${restaurant.custom_domain}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline"
                                            >
                                                {restaurant.custom_domain}
                                            </a>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">No custom domain configured</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {restaurant.custom_domain && !restaurant.domain_verified && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleVerify(restaurant)}
                                        >
                                            Mark as Verified
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEdit(restaurant)}
                                    >
                                        <Edit className="h-4 w-4 mr-1" />
                                        {restaurant.custom_domain ? 'Edit' : 'Add'} Domain
                                    </Button>
                                    {restaurant.custom_domain && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleRemove(restaurant)}
                                            className="text-red-600"
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {selectedRestaurant?.custom_domain ? 'Edit' : 'Add'} Custom Domain
                        </DialogTitle>
                    </DialogHeader>
                    {selectedRestaurant && (
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-gray-600 mb-4">
                                    Restaurant: <strong>{selectedRestaurant.name}</strong>
                                </p>
                            </div>
                            <div>
                                <Label>Custom Domain</Label>
                                <Input
                                    placeholder="e.g., pizzahut.com or order.pizzahut.com"
                                    value={domain}
                                    onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Enter the domain without http:// or https://
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                                <p className="font-semibold text-gray-700">DNS Configuration Required:</p>
                                <p className="text-gray-600">
                                    1. Add CNAME record pointing to: <code className="bg-white px-1 py-0.5 rounded">{window.location.hostname}</code>
                                </p>
                                <p className="text-gray-600">
                                    2. Wait for DNS propagation (up to 48 hours)
                                </p>
                                <p className="text-gray-600">
                                    3. Return here to verify the domain
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={updateDomainMutation.isPending}
                            className="bg-orange-500 hover:bg-orange-600"
                        >
                            Save Domain
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}