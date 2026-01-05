import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Globe } from 'lucide-react';

export default function CustomDomainError({ domain, error }) {
    const handleRefresh = () => {
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full">
                <CardContent className="pt-12 pb-12">
                    <div className="text-center space-y-6">
                        <div className="flex justify-center">
                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertTriangle className="h-10 w-10 text-red-600" />
                            </div>
                        </div>

                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">
                                Domain Configuration Error
                            </h1>
                            <p className="text-gray-600">
                                We're having trouble loading this custom domain
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-6 text-left space-y-4">
                            <div className="flex items-start gap-3">
                                <Globe className="h-5 w-5 text-gray-500 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-gray-900 mb-1">Domain: {domain}</p>
                                    <p className="text-sm text-gray-600">
                                        Error: {error || 'DNS resolution failed'}
                                    </p>
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <p className="font-semibold text-gray-900 mb-3">Common Issues:</p>
                                <ul className="space-y-2 text-sm text-gray-700">
                                    <li className="flex items-start gap-2">
                                        <span className="text-orange-500 font-bold">1.</span>
                                        <span><strong>DNS not configured:</strong> Check that your domain's DNS records (CNAME or A record) point to the correct server</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-orange-500 font-bold">2.</span>
                                        <span><strong>Domain not verified:</strong> Ask your administrator to verify the domain in the Super Admin panel</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-orange-500 font-bold">3.</span>
                                        <span><strong>DNS propagation:</strong> Recent DNS changes can take up to 48 hours to propagate worldwide</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-orange-500 font-bold">4.</span>
                                        <span><strong>SSL certificate:</strong> SSL certificates are automatically provisioned but may take a few minutes after DNS setup</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="border-t pt-4">
                                <p className="font-semibold text-gray-900 mb-2">Required DNS Configuration:</p>
                                <div className="bg-white rounded border p-3 text-xs font-mono space-y-1">
                                    <p className="text-gray-600">CNAME Record (recommended):</p>
                                    <p className="text-gray-900">Name: www or @ (root)</p>
                                    <p className="text-gray-900">Target: {window.location.hostname.replace(domain, 'your-platform-domain.com')}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-center">
                            <Button
                                onClick={handleRefresh}
                                variant="outline"
                                className="gap-2"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Try Again
                            </Button>
                            <Button
                                onClick={() => window.location.href = 'https://mealdrop.com'}
                                className="bg-orange-500 hover:bg-orange-600"
                            >
                                Go to Main Platform
                            </Button>
                        </div>

                        <p className="text-xs text-gray-500">
                            If the issue persists, please contact your administrator or support team.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}