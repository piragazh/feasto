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
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries(['all-restaurants']);
            
            if (variables.custom_domain === null) {
                toast.success('Domain removed successfully');
            } else if (variables.domain_verified) {
                toast.success('Domain verified successfully');
            } else {
                toast.success('Domain saved successfully. Don\'t forget to configure DNS!');
            }
            
            setShowDialog(false);
            setSelectedRestaurant(null);
            setDomain('');
        },
        onError: (error) => {
            const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error occurred';
            toast.error(`Failed to update domain: ${errorMessage}`);
        }
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

        // Remove protocol if user accidentally included it
        let cleanDomain = domain.toLowerCase().trim()
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');

        // Comprehensive domain validation
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*\.[a-zA-Z]{2,}$/;
        if (!domainRegex.test(cleanDomain)) {
            toast.error('Invalid domain format. Use: example.com or subdomain.example.com');
            return;
        }

        // Check for localhost or IP addresses
        if (cleanDomain.includes('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(cleanDomain)) {
            toast.error('Cannot use localhost or IP addresses as custom domain');
            return;
        }

        // Check if domain is already used by another restaurant
        const existingDomain = restaurants.find(r => 
            r.id !== selectedRestaurant.id && 
            r.custom_domain?.toLowerCase() === cleanDomain
        );
        if (existingDomain) {
            toast.error(`Domain already assigned to ${existingDomain.name}`);
            return;
        }

        // Check for invalid characters
        if (cleanDomain.includes(' ') || cleanDomain.includes('_')) {
            toast.error('Domain cannot contain spaces or underscores');
            return;
        }

        updateDomainMutation.mutate({
            id: selectedRestaurant.id,
            custom_domain: cleanDomain,
            domain_verified: false
        });
    };

    const handleVerify = (restaurant) => {
        if (!restaurant.custom_domain) {
            toast.error('No domain configured to verify');
            return;
        }
        
        if (!confirm(`Verify domain "${restaurant.custom_domain}"? Make sure DNS is properly configured.`)) {
            return;
        }

        updateDomainMutation.mutate({
            id: restaurant.id,
            custom_domain: restaurant.custom_domain,
            domain_verified: true
        });
    };

    const handleRemove = (restaurant) => {
        if (!restaurant.custom_domain) {
            toast.error('No domain to remove');
            return;
        }

        if (!confirm(`Remove custom domain "${restaurant.custom_domain}" from ${restaurant.name}? This action cannot be undone.`)) {
            return;
        }

        updateDomainMutation.mutate({
            id: restaurant.id,
            custom_domain: null,
            domain_verified: false
        });
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

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(instructions)
                .then(() => toast.success('DNS instructions copied to clipboard'))
                .catch(() => toast.error('Failed to copy to clipboard'));
        } else {
            toast.error('Clipboard not supported in this browser');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Domain Management</h2>
                    <p className="text-gray-600 text-sm">Configure custom domains for restaurants</p>
                </div>
                <Button 
                    onClick={() => {
                        const instructions = `DNS Configuration Guide for Custom Domain

Step 1: Log in to your domain registrar
(GoDaddy, Namecheap, Cloudflare, Google Domains, etc.)

Step 2: Find DNS Settings
Look for "DNS Management" or "DNS Settings" in your domain control panel

Step 3: Choose ONE DNS Configuration Method

OPTION A - CNAME Record (Recommended for subdomains):
Type: CNAME
Name/Host: www (for www.example.com)
         OR order (for order.example.com)
         OR subdomain name
Points to/Target: ${window.location.hostname}
TTL: 3600 (or leave as default)

OPTION B - A Record (For root domain):
Type: A
Name/Host: @ (for root domain like example.com)
IP Address: [Contact administrator for server IP address]
TTL: 3600 (or leave as default)

Step 4: Save and Wait
- Save your DNS changes
- Wait 10-60 minutes for DNS propagation
- Some registrars may take up to 48 hours

Step 5: Verify Domain
Return to this page and click "Mark as Verified"

Notes:
- Cannot use IP addresses or localhost as custom domains
- CNAME works best for subdomains (www, order, etc.)
- A Record required for root/apex domains
- Contact support if you need the server IP address`;

                        navigator.clipboard.writeText(instructions).then(() => 
                            toast.success('Full DNS instructions copied to clipboard!')
                        ).catch(() => {
                            const textarea = document.createElement('textarea');
                            textarea.value = instructions;
                            document.body.appendChild(textarea);
                            textarea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textarea);
                            toast.success('Instructions copied!');
                        });
                    }} 
                    variant="outline"
                >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Full DNS Guide
                </Button>
            </div>

            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                        <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-semibold text-blue-900 mb-2">How Custom Domains Work</h3>
                            <p className="text-sm text-blue-800 mb-3">
                                When a customer visits the custom domain, they'll see that restaurant's page as the landing page.
                            </p>
                            <div className="bg-white rounded-lg p-3 border border-blue-200">
                                <p className="text-sm font-semibold text-blue-900 mb-2">DNS Configuration Options:</p>
                                <div className="space-y-3 text-sm text-blue-800">
                                    <p className="font-medium">1. Go to your domain registrar's DNS settings (GoDaddy, Namecheap, Cloudflare, etc.)</p>
                                    <p className="font-medium">2. Choose ONE of the following options:</p>
                                    
                                    <div className="space-y-2">
                                        <div className="border-l-4 border-blue-400 pl-3">
                                            <p className="font-semibold text-blue-900 mb-1">Option A: CNAME Record (Recommended for subdomains)</p>
                                            <div className="bg-blue-50 p-2 rounded font-mono text-xs">
                                                <div>Type: <strong>CNAME</strong></div>
                                                <div>Name: <strong>www</strong> or <strong>order</strong> (subdomain)</div>
                                                <div>Target: <strong>{window.location.hostname}</strong></div>
                                                <div>TTL: <strong>3600</strong></div>
                                            </div>
                                        </div>
                                        
                                        <div className="border-l-4 border-green-400 pl-3">
                                            <p className="font-semibold text-green-900 mb-1">Option B: A Record (For root domain)</p>
                                            <div className="bg-green-50 p-2 rounded font-mono text-xs">
                                                <div>Type: <strong>A</strong></div>
                                                <div>Name: <strong>@</strong> (root domain)</div>
                                                <div>IP Address: <strong>[Contact support for IP]</strong></div>
                                                <div>TTL: <strong>3600</strong></div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <p className="font-medium">3. Save and wait 10-60 minutes for DNS propagation</p>
                                    <p className="font-medium">4. Return here and click "Mark as Verified"</p>
                                </div>
                            </div>
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
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                                <p className="font-semibold text-orange-900 text-sm">⚠️ DNS Configuration Required</p>
                                <div className="text-xs text-orange-800 space-y-2">
                                    <p className="font-semibold">Step 1: Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)</p>
                                    <p className="font-semibold">Step 2: Choose ONE of these DNS configurations:</p>
                                    
                                    <div className="space-y-2">
                                        <div className="bg-white rounded p-2 border border-orange-200">
                                            <p className="font-semibold text-orange-900 mb-1">Option A: CNAME (Best for subdomains)</p>
                                            <div className="font-mono text-xs space-y-0.5">
                                                <div><span className="text-gray-600">Type:</span> <strong className="text-orange-900">CNAME</strong></div>
                                                <div><span className="text-gray-600">Name:</span> <strong className="text-orange-900">www</strong> or <strong className="text-orange-900">order</strong></div>
                                                <div><span className="text-gray-600">Points to:</span> <strong className="text-orange-900">{window.location.hostname}</strong></div>
                                                <div><span className="text-gray-600">TTL:</span> <strong className="text-orange-900">3600</strong></div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-white rounded p-2 border border-orange-200">
                                            <p className="font-semibold text-orange-900 mb-1">Option B: A Record (For root domain)</p>
                                            <div className="font-mono text-xs space-y-0.5">
                                                <div><span className="text-gray-600">Type:</span> <strong className="text-orange-900">A</strong></div>
                                                <div><span className="text-gray-600">Name:</span> <strong className="text-orange-900">@</strong></div>
                                                <div><span className="text-gray-600">IP Address:</span> <strong className="text-red-600">[Contact admin for server IP]</strong></div>
                                                <div><span className="text-gray-600">TTL:</span> <strong className="text-orange-900">3600</strong></div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <p className="font-semibold pt-1">Step 3: Save changes and wait 10-60 minutes for propagation</p>
                                    <p className="font-semibold">Step 4: Return here and click "Mark as Verified"</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            const text = `CNAME Record (for subdomain):

Type: CNAME
Name: www (or order)
Points to: ${window.location.hostname}
TTL: 3600`;
                                            navigator.clipboard.writeText(text).then(() => 
                                                toast.success('CNAME details copied!')
                                            ).catch(() => {
                                                const textarea = document.createElement('textarea');
                                                textarea.value = text;
                                                document.body.appendChild(textarea);
                                                textarea.select();
                                                document.execCommand('copy');
                                                document.body.removeChild(textarea);
                                                toast.success('CNAME details copied!');
                                            });
                                        }}
                                        className="flex-1"
                                    >
                                        <Copy className="h-3 w-3 mr-1" />
                                        Copy CNAME
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            const text = `A Record (for root domain):

Type: A
Name: @
IP Address: [Contact admin for server IP]
TTL: 3600`;
                                            navigator.clipboard.writeText(text).then(() => 
                                                toast.success('A Record details copied!')
                                            ).catch(() => {
                                                const textarea = document.createElement('textarea');
                                                textarea.value = text;
                                                document.body.appendChild(textarea);
                                                textarea.select();
                                                document.execCommand('copy');
                                                document.body.removeChild(textarea);
                                                toast.success('A Record copied!');
                                            });
                                        }}
                                        className="flex-1"
                                    >
                                        <Copy className="h-3 w-3 mr-1" />
                                        Copy A Record
                                    </Button>
                                </div>
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