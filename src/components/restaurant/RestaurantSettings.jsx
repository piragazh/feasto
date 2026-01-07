import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Clock, MapPin, Truck, Store, Save, Upload, Image as ImageIcon, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import ProfileManagement from './ProfileManagement';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function RestaurantSettings({ restaurantId }) {
    const queryClient = useQueryClient();
    const [activeSection, setActiveSection] = useState('general');

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        address: '',
        phone: '',
        delivery_fee: '',
        minimum_order: '',
        collection_enabled: false,
        logo_url: '',
        food_hygiene_rating: '',
        food_hygiene_certificate_url: '',
        opening_hours: {},
        delivery_hours: {},
        collection_hours: {}
    });
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingCertificate, setUploadingCertificate] = useState(false);

    React.useEffect(() => {
        if (restaurant) {
            setFormData({
                name: restaurant.name || '',
                description: restaurant.description || '',
                address: restaurant.address || '',
                phone: restaurant.phone || '',
                delivery_fee: restaurant.delivery_fee || '',
                minimum_order: restaurant.minimum_order || '',
                collection_enabled: restaurant.collection_enabled || false,
                logo_url: restaurant.logo_url || '',
                food_hygiene_rating: restaurant.food_hygiene_rating || '',
                food_hygiene_certificate_url: restaurant.food_hygiene_certificate_url || '',
                opening_hours: restaurant.opening_hours || {},
                delivery_hours: restaurant.delivery_hours || {},
                collection_hours: restaurant.collection_hours || {}
            });
        }
    }, [restaurant]);

    const updateMutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant', restaurantId]);
            toast.success('Settings updated successfully');
        },
        onError: () => {
            toast.error('Failed to update settings');
        }
    });

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingLogo(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setFormData({ ...formData, logo_url: file_url });
            toast.success('Logo uploaded successfully');
        } catch (error) {
            toast.error('Failed to upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleCertificateUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingCertificate(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setFormData({ ...formData, food_hygiene_certificate_url: file_url });
            toast.success('Certificate uploaded successfully');
        } catch (error) {
            toast.error('Failed to upload certificate');
        } finally {
            setUploadingCertificate(false);
        }
    };

    const handleSaveGeneral = () => {
        updateMutation.mutate({
            name: formData.name,
            description: formData.description,
            address: formData.address,
            phone: formData.phone,
            delivery_fee: parseFloat(formData.delivery_fee) || 0,
            minimum_order: parseFloat(formData.minimum_order) || 0,
            collection_enabled: formData.collection_enabled,
            logo_url: formData.logo_url,
            food_hygiene_rating: formData.food_hygiene_rating ? parseInt(formData.food_hygiene_rating) : null,
            food_hygiene_certificate_url: formData.food_hygiene_certificate_url
        });
    };

    const handleSaveHours = (type) => {
        const hoursKey = type === 'opening' ? 'opening_hours' : type === 'delivery' ? 'delivery_hours' : 'collection_hours';
        updateMutation.mutate({
            [hoursKey]: formData[hoursKey]
        });
    };

    const updateDayHours = (type, day, field, value) => {
        const hoursKey = type === 'opening' ? 'opening_hours' : type === 'delivery' ? 'delivery_hours' : 'collection_hours';
        setFormData(prev => ({
            ...prev,
            [hoursKey]: {
                ...prev[hoursKey],
                [day]: {
                    ...prev[hoursKey]?.[day],
                    [field]: value
                }
            }
        }));
    };

    const copyHoursToAll = (type, day) => {
        const hoursKey = type === 'opening' ? 'opening_hours' : type === 'delivery' ? 'delivery_hours' : 'collection_hours';
        const dayHours = formData[hoursKey]?.[day];
        if (!dayHours) return;

        const newHours = {};
        DAYS.forEach(d => {
            newHours[d] = { ...dayHours };
        });

        setFormData(prev => ({
            ...prev,
            [hoursKey]: newHours
        }));
        toast.success('Hours copied to all days');
    };

    if (isLoading) {
        return <div className="text-center py-8">Loading settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2 mb-6">
                <Button
                    variant={activeSection === 'general' ? 'default' : 'outline'}
                    onClick={() => setActiveSection('general')}
                >
                    <Store className="h-4 w-4 mr-2" />
                    General Info
                </Button>
                <Button
                    variant={activeSection === 'profile' ? 'default' : 'outline'}
                    onClick={() => setActiveSection('profile')}
                >
                    <BookOpen className="h-4 w-4 mr-2" />
                    Profile & Story
                </Button>
                <Button
                    variant={activeSection === 'opening' ? 'default' : 'outline'}
                    onClick={() => setActiveSection('opening')}
                >
                    <Clock className="h-4 w-4 mr-2" />
                    Opening Hours
                </Button>
                <Button
                    variant={activeSection === 'delivery' ? 'default' : 'outline'}
                    onClick={() => setActiveSection('delivery')}
                >
                    <Truck className="h-4 w-4 mr-2" />
                    Delivery Hours
                </Button>
                {formData.collection_enabled && (
                    <Button
                        variant={activeSection === 'collection' ? 'default' : 'outline'}
                        onClick={() => setActiveSection('collection')}
                    >
                        <Store className="h-4 w-4 mr-2" />
                        Collection Hours
                    </Button>
                )}
            </div>

            {activeSection === 'profile' && (
                <ProfileManagement restaurantId={restaurantId} />
            )}

            {activeSection === 'general' && (
                <Card>
                    <CardHeader>
                        <CardTitle>General Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label>Restaurant Logo</Label>
                            <div className="flex gap-4 items-start">
                                {formData.logo_url && (
                                    <img 
                                        src={formData.logo_url} 
                                        alt="Restaurant Logo" 
                                        className="w-20 h-20 rounded-lg object-cover border"
                                    />
                                )}
                                <div className="flex-1 space-y-2">
                                    <div className="flex gap-2">
                                        <label className="flex-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full"
                                                disabled={uploadingLogo}
                                                asChild
                                            >
                                                <span>
                                                    {uploadingLogo ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                                                            Uploading...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="h-4 w-4 mr-2" />
                                                            Upload Logo
                                                        </>
                                                    )}
                                                </span>
                                            </Button>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleLogoUpload}
                                                disabled={uploadingLogo}
                                            />
                                        </label>
                                    </div>
                                    <div className="text-xs text-gray-500">Or enter URL:</div>
                                    <Input
                                        placeholder="https://example.com/logo.png"
                                        value={formData.logo_url}
                                        onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <Label>Restaurant Name *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label>Address *</Label>
                            <Input
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Phone Number</Label>
                            <Input
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="07XXX XXXXXX"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Delivery Fee (£)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.delivery_fee}
                                    onChange={(e) => setFormData({ ...formData, delivery_fee: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Minimum Order (£)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.minimum_order}
                                    onChange={(e) => setFormData({ ...formData, minimum_order: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <Switch
                                checked={formData.collection_enabled}
                                onCheckedChange={(checked) => setFormData({ ...formData, collection_enabled: checked })}
                            />
                            <div>
                                <Label className="text-sm font-semibold">Enable Collection/Pickup</Label>
                                <p className="text-xs text-gray-600 mt-1">
                                    Allow customers to collect orders from your restaurant
                                </p>
                            </div>
                        </div>

                        <div className="border-t pt-4 space-y-4">
                            <h3 className="font-semibold text-lg">Food Hygiene Information</h3>
                            <div>
                                <Label>Food Hygiene Rating (0-5)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="5"
                                    value={formData.food_hygiene_rating}
                                    onChange={(e) => setFormData({ ...formData, food_hygiene_rating: e.target.value })}
                                    placeholder="Enter rating from 0 to 5"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Enter your official Food Standards Agency rating
                                </p>
                            </div>
                            <div>
                                <Label>Food Hygiene Certificate/Sticker</Label>
                                <div className="flex gap-4 items-start">
                                    {formData.food_hygiene_certificate_url && (
                                        <img 
                                            src={formData.food_hygiene_certificate_url} 
                                            alt="Food Hygiene Certificate" 
                                            className="w-32 h-32 rounded-lg object-contain border bg-gray-50"
                                        />
                                    )}
                                    <div className="flex-1 space-y-2">
                                        <label>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full"
                                                disabled={uploadingCertificate}
                                                asChild
                                            >
                                                <span>
                                                    {uploadingCertificate ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                                                            Uploading...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="h-4 w-4 mr-2" />
                                                            Upload Certificate
                                                        </>
                                                    )}
                                                </span>
                                            </Button>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleCertificateUpload}
                                                disabled={uploadingCertificate}
                                            />
                                        </label>
                                        <div className="text-xs text-gray-500">Or enter URL:</div>
                                        <Input
                                            placeholder="https://example.com/certificate.png"
                                            value={formData.food_hygiene_certificate_url}
                                            onChange={(e) => setFormData({ ...formData, food_hygiene_certificate_url: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Button onClick={handleSaveGeneral} className="w-full" disabled={updateMutation.isPending}>
                            <Save className="h-4 w-4 mr-2" />
                            Save General Settings
                        </Button>
                    </CardContent>
                </Card>
            )}

            {(activeSection === 'opening' || activeSection === 'delivery' || activeSection === 'collection') && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {activeSection === 'opening' && 'Opening Hours'}
                            {activeSection === 'delivery' && 'Delivery Hours'}
                            {activeSection === 'collection' && 'Collection Hours'}
                        </CardTitle>
                        <p className="text-sm text-gray-600">
                            {activeSection === 'opening' && 'Set your restaurant operating hours'}
                            {activeSection === 'delivery' && 'Set when customers can place delivery orders (can differ from opening hours)'}
                            {activeSection === 'collection' && 'Set when customers can collect orders'}
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {DAYS.map((day, idx) => {
                            const hoursKey = activeSection === 'opening' ? 'opening_hours' : activeSection === 'delivery' ? 'delivery_hours' : 'collection_hours';
                            const dayData = formData[hoursKey]?.[day] || { open: '09:00', close: '22:00', closed: false };

                            return (
                                <div key={day} className="border rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="capitalize font-semibold">{day}</Label>
                                        <div className="flex items-center gap-3">
                                            {idx === 0 && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => copyHoursToAll(activeSection, day)}
                                                >
                                                    Copy to All Days
                                                </Button>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={!dayData.closed}
                                                    onCheckedChange={(checked) => updateDayHours(activeSection, day, 'closed', !checked)}
                                                />
                                                <span className="text-sm">{dayData.closed ? 'Closed' : 'Open'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {!dayData.closed && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-xs">Opening Time</Label>
                                                <Input
                                                    type="time"
                                                    value={dayData.open || '09:00'}
                                                    onChange={(e) => updateDayHours(activeSection, day, 'open', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Closing Time</Label>
                                                <Input
                                                    type="time"
                                                    value={dayData.close || '22:00'}
                                                    onChange={(e) => updateDayHours(activeSection, day, 'close', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <Button onClick={() => handleSaveHours(activeSection)} className="w-full" disabled={updateMutation.isPending}>
                            <Save className="h-4 w-4 mr-2" />
                            Save {activeSection === 'opening' ? 'Opening' : activeSection === 'delivery' ? 'Delivery' : 'Collection'} Hours
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}