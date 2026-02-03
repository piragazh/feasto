import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Clock, MapPin, Truck, Store, Save, Upload, Image as ImageIcon, BookOpen, Search, X, Palette, Printer, TestTube } from 'lucide-react';
import { toast } from 'sonner';
import ProfileManagement from './ProfileManagement';
import BluetoothPrinterManager from './BluetoothPrinterManager';
import { printerService } from './PrinterService';

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
        alert_phone: '',
        delivery_fee: '',
        minimum_order: '',
        collection_enabled: false,
        accepts_cash_on_delivery: true,
        logo_url: '',
        food_hygiene_rating: '',
        food_hygiene_certificate_url: '',
        seo_keywords: [],
        seo_description: '',
        loyalty_program_enabled: true,
        loyalty_points_multiplier: 1,
        theme_primary_color: '#f97316',
        opening_hours: {},
        delivery_hours: {},
        collection_hours: {},
        printer_config: {
            printer_width: '80mm',
            font_size: 'medium',
            font_weight: 'normal',
            font_style: 'normal',
            header_font_size: 'large',
            header_font_weight: 'bold',
            item_font_size: 'medium',
            total_font_size: 'large',
            total_font_weight: 'bold',
            template: 'standard',
            header_text: '',
            footer_text: '',
            show_logo: true,
            show_order_number: true,
            show_customer_details: true,
            auto_print: false,
            bluetooth_printer: null,
            command_set: 'esc_pos',
            custom_sections: {
                show_qr_code: false,
                show_barcode: false,
                show_social_media: false,
                show_allergen_info: false,
                custom_message_position: 'footer'
            }
        }
    });
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingCertificate, setUploadingCertificate] = useState(false);
    const [newKeyword, setNewKeyword] = useState('');
    const [testPrinting, setTestPrinting] = useState(false);

    React.useEffect(() => {
        if (restaurant) {
            // Initialize hours with defaults for all days and fields
            const initializeHours = (hours) => {
                const initialized = { ...hours };
                DAYS.forEach(day => {
                    initialized[day] = {
                        open: initialized[day]?.open || '09:00',
                        close: initialized[day]?.close || '22:00',
                        closed: initialized[day]?.closed || false
                    };
                });
                return initialized;
            };

            setFormData({
                name: restaurant.name || '',
                description: restaurant.description || '',
                address: restaurant.address || '',
                phone: restaurant.phone || '',
                alert_phone: restaurant.alert_phone || '',
                delivery_fee: restaurant.delivery_fee || '',
                minimum_order: restaurant.minimum_order || '',
                collection_enabled: restaurant.collection_enabled || false,
                accepts_cash_on_delivery: restaurant.accepts_cash_on_delivery !== false,
                logo_url: restaurant.logo_url || '',
                food_hygiene_rating: restaurant.food_hygiene_rating || '',
                food_hygiene_certificate_url: restaurant.food_hygiene_certificate_url || '',
                seo_keywords: restaurant.seo_keywords || [],
                seo_description: restaurant.seo_description || '',
                loyalty_program_enabled: restaurant.loyalty_program_enabled !== false,
                loyalty_points_multiplier: restaurant.loyalty_points_multiplier || 1,
                theme_primary_color: restaurant.theme_primary_color || '#f97316',
                opening_hours: initializeHours(restaurant.opening_hours || {}),
                delivery_hours: initializeHours(restaurant.delivery_hours || {}),
                collection_hours: initializeHours(restaurant.collection_hours || {}),
                printer_config: {
                    printer_width: restaurant.printer_config?.printer_width || '80mm',
                    font_size: restaurant.printer_config?.font_size || 'medium',
                    font_weight: restaurant.printer_config?.font_weight || 'normal',
                    font_style: restaurant.printer_config?.font_style || 'normal',
                    header_font_size: restaurant.printer_config?.header_font_size || 'large',
                    header_font_weight: restaurant.printer_config?.header_font_weight || 'bold',
                    item_font_size: restaurant.printer_config?.item_font_size || 'medium',
                    total_font_size: restaurant.printer_config?.total_font_size || 'large',
                    total_font_weight: restaurant.printer_config?.total_font_weight || 'bold',
                    template: restaurant.printer_config?.template || 'standard',
                    header_text: restaurant.printer_config?.header_text || '',
                    footer_text: restaurant.printer_config?.footer_text || '',
                    show_logo: restaurant.printer_config?.show_logo !== false,
                    show_order_number: restaurant.printer_config?.show_order_number !== false,
                    show_customer_details: restaurant.printer_config?.show_customer_details !== false,
                    auto_print: restaurant.printer_config?.auto_print || false,
                    bluetooth_printer: restaurant.printer_config?.bluetooth_printer || null,
                    command_set: restaurant.printer_config?.command_set || 'esc_pos',
                    custom_sections: restaurant.printer_config?.custom_sections || {
                        show_qr_code: false,
                        show_barcode: false,
                        show_social_media: false,
                        show_allergen_info: false,
                        custom_message_position: 'footer'
                    }
                }
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
            alert_phone: formData.alert_phone,
            delivery_fee: parseFloat(formData.delivery_fee) || 0,
            minimum_order: parseFloat(formData.minimum_order) || 0,
            collection_enabled: formData.collection_enabled,
            accepts_cash_on_delivery: formData.accepts_cash_on_delivery,
            logo_url: formData.logo_url,
            food_hygiene_rating: formData.food_hygiene_rating ? parseInt(formData.food_hygiene_rating) : null,
            food_hygiene_certificate_url: formData.food_hygiene_certificate_url,
            seo_keywords: formData.seo_keywords,
            seo_description: formData.seo_description,
            loyalty_program_enabled: formData.loyalty_program_enabled,
            loyalty_points_multiplier: formData.loyalty_points_multiplier,
            theme_primary_color: formData.theme_primary_color
        });
    };

    const addKeyword = () => {
        if (!newKeyword.trim()) return;
        if (formData.seo_keywords.includes(newKeyword.trim())) {
            toast.error('Keyword already added');
            return;
        }
        setFormData({ 
            ...formData, 
            seo_keywords: [...formData.seo_keywords, newKeyword.trim()] 
        });
        setNewKeyword('');
    };

    const removeKeyword = (keyword) => {
        setFormData({
            ...formData,
            seo_keywords: formData.seo_keywords.filter(k => k !== keyword)
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
                <Button
                    variant={activeSection === 'printing' ? 'default' : 'outline'}
                    onClick={() => setActiveSection('printing')}
                >
                    <Printer className="h-4 w-4 mr-2" />
                    Printing
                </Button>
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
                        <div>
                            <Label>SMS Alert Phone (For New Orders) 📱</Label>
                            <Input
                                value={formData.alert_phone}
                                onChange={(e) => setFormData({ ...formData, alert_phone: e.target.value })}
                                placeholder="07XXX XXXXXX"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Receive SMS alerts for new orders on this number
                            </p>
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
                        <div className="space-y-3">
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
                            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                                <Switch
                                    checked={formData.accepts_cash_on_delivery}
                                    onCheckedChange={(checked) => setFormData({ ...formData, accepts_cash_on_delivery: checked })}
                                />
                                <div>
                                    <Label className="text-sm font-semibold">Accept Cash on Delivery</Label>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Allow customers to pay with cash when order is delivered
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="border-t pt-4 space-y-4">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Search className="h-5 w-5 text-blue-500" />
                                SEO Settings
                            </h3>
                            <p className="text-sm text-gray-600">
                                Improve your restaurant's visibility in Google search results. Great for custom domains!
                            </p>
                            <div>
                                <Label>SEO Meta Description</Label>
                                <Textarea
                                    value={formData.seo_description}
                                    onChange={(e) => setFormData({ ...formData, seo_description: e.target.value })}
                                    placeholder="e.g., Best Italian pizza in London. Fresh ingredients, authentic recipes. Order online for fast delivery!"
                                    rows={3}
                                    maxLength={160}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.seo_description.length}/160 characters - This appears in Google search results
                                </p>
                            </div>
                            <div>
                                <Label>SEO Keywords</Label>
                                <div className="flex gap-2 mb-2">
                                    <Input
                                        value={newKeyword}
                                        onChange={(e) => setNewKeyword(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                                        placeholder="e.g., best pizza London, Italian restaurant"
                                    />
                                    <Button type="button" onClick={addKeyword}>Add</Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {formData.seo_keywords.map((keyword, idx) => (
                                        <div key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                                            {keyword}
                                            <button
                                                type="button"
                                                onClick={() => removeKeyword(keyword)}
                                                className="hover:text-blue-900"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Add keywords customers might search for (e.g., "best pizza near me", "authentic Italian", "halal food London")
                                </p>
                            </div>
                        </div>

                        <div className="border-t pt-4 space-y-4">
                            <h3 className="font-semibold text-lg">Loyalty Program</h3>
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div>
                                    <p className="font-medium">Participate in Loyalty Program</p>
                                    <p className="text-sm text-gray-500">Customers earn points when ordering from you</p>
                                </div>
                                <Switch
                                    checked={formData.loyalty_program_enabled !== false}
                                    onCheckedChange={(checked) => setFormData({ ...formData, loyalty_program_enabled: checked })}
                                />
                            </div>
                            {formData.loyalty_program_enabled !== false && (
                                <div>
                                    <Label>Points Multiplier</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min="0.5"
                                        max="5"
                                        value={formData.loyalty_points_multiplier || 1}
                                        onChange={(e) => setFormData({ ...formData, loyalty_points_multiplier: parseFloat(e.target.value) })}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Customers earn {formData.loyalty_points_multiplier || 1} points per £1 spent
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="border-t pt-4 space-y-4">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Palette className="h-5 w-5 text-purple-500" />
                                Theme & Branding
                            </h3>
                            <div>
                                <Label>Primary Theme Color</Label>
                                <div className="flex gap-4 items-center">
                                    <Input
                                        type="color"
                                        value={formData.theme_primary_color}
                                        onChange={(e) => setFormData({ ...formData, theme_primary_color: e.target.value })}
                                        className="h-12 w-20 cursor-pointer"
                                    />
                                    <div className="flex-1">
                                        <Input
                                            type="text"
                                            value={formData.theme_primary_color}
                                            onChange={(e) => setFormData({ ...formData, theme_primary_color: e.target.value })}
                                            placeholder="#f97316"
                                            className="font-mono"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Customize your restaurant's theme color for a unique look
                                        </p>
                                    </div>
                                    <div 
                                        className="w-12 h-12 rounded-lg border-2 shadow-sm"
                                        style={{ backgroundColor: formData.theme_primary_color }}
                                    />
                                </div>
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

            {activeSection === 'printing' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Printer className="h-5 w-5" />
                            Receipt Printer Configuration
                        </CardTitle>
                        <p className="text-sm text-gray-600">
                            Configure receipt printing settings for your thermal printer
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <BluetoothPrinterManager
                            selectedPrinter={restaurant?.printer_config?.bluetooth_printer}
                            onPrinterSelect={(printer) => {
                                // Save printer inside printer_config
                                const updatedConfig = {
                                    ...restaurant?.printer_config,
                                    bluetooth_printer: printer
                                };
                                updateMutation.mutate({ 
                                    printer_config: updatedConfig
                                });
                            }}
                        />

                        <div className="border-t pt-6">
                            <Label className="text-base font-semibold mb-4 block">Receipt Settings</Label>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <Label>Printer Width</Label>
                                <select
                                    value={formData.printer_config.printer_width}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        printer_config: { ...formData.printer_config, printer_width: e.target.value }
                                    })}
                                    className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                >
                                    <option value="58mm">58mm (Compact)</option>
                                    <option value="80mm">80mm (Standard)</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Select your thermal printer paper width</p>
                            </div>
                        </div>

                        <div className="border-t pt-6">
                            <Label className="text-base font-semibold mb-4 block">Font Customization</Label>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Base Font Size</Label>
                                    <select
                                        value={formData.printer_config.font_size}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, font_size: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="small">Small</option>
                                        <option value="medium">Medium</option>
                                        <option value="large">Large</option>
                                        <option value="extra-large">Extra Large</option>
                                    </select>
                                </div>
                                <div>
                                    <Label>Base Font Weight</Label>
                                    <select
                                        value={formData.printer_config.font_weight}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, font_weight: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="normal">Normal</option>
                                        <option value="bold">Bold</option>
                                    </select>
                                </div>
                                <div>
                                    <Label>Font Style</Label>
                                    <select
                                        value={formData.printer_config.font_style}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, font_style: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="normal">Normal</option>
                                        <option value="italic">Italic</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <Label className="text-sm font-medium mb-3 block text-gray-700">Section-Specific Fonts</Label>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-sm">Header Font Size</Label>
                                    <select
                                        value={formData.printer_config.header_font_size}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, header_font_size: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="small">Small</option>
                                        <option value="medium">Medium</option>
                                        <option value="large">Large</option>
                                        <option value="extra-large">Extra Large</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Header Font Weight</Label>
                                    <select
                                        value={formData.printer_config.header_font_weight}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, header_font_weight: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="normal">Normal</option>
                                        <option value="bold">Bold</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Items Font Size</Label>
                                    <select
                                        value={formData.printer_config.item_font_size}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, item_font_size: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="small">Small</option>
                                        <option value="medium">Medium</option>
                                        <option value="large">Large</option>
                                        <option value="extra-large">Extra Large</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Total Font Size</Label>
                                    <select
                                        value={formData.printer_config.total_font_size}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, total_font_size: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="small">Small</option>
                                        <option value="medium">Medium</option>
                                        <option value="large">Large</option>
                                        <option value="extra-large">Extra Large</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Total Font Weight</Label>
                                    <select
                                        value={formData.printer_config.total_font_weight}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            printer_config: { ...formData.printer_config, total_font_weight: e.target.value }
                                        })}
                                        className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                                    >
                                        <option value="normal">Normal</option>
                                        <option value="bold">Bold</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div>
                            <Label>Receipt Template</Label>
                            <select
                                value={formData.printer_config.template}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    printer_config: { ...formData.printer_config, template: e.target.value }
                                })}
                                className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                            >
                                <option value="standard">Standard - Balanced layout with all details</option>
                                <option value="detailed">Detailed - Extra information and descriptions</option>
                                <option value="minimal">Minimal - Clean and simple</option>
                                <option value="itemized">Itemized - Focus on items with large text</option>
                                <option value="compact">Compact - Minimize paper usage</option>
                                <option value="custom">Custom - Full customization</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Select the receipt style that suits your needs</p>
                        </div>

                        <div>
                            <Label>Printer Command Set</Label>
                            <select
                                value={formData.printer_config.command_set}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    printer_config: { ...formData.printer_config, command_set: e.target.value }
                                })}
                                className="w-full h-9 px-3 rounded-md border border-input bg-transparent"
                            >
                                <option value="esc_pos">ESC/POS (Standard - Most common)</option>
                                <option value="esc_pos_star">ESC/POS Star (Star Micronics)</option>
                                <option value="esc_bixolon">ESC/POS Bixolon</option>
                                <option value="epson_tm">Epson TM Series</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Select your printer's command language</p>
                        </div>

                        <div>
                            <Label>Custom Header Text</Label>
                            <Textarea
                                value={formData.printer_config.header_text}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    printer_config: { ...formData.printer_config, header_text: e.target.value }
                                })}
                                placeholder="e.g., Welcome to [Restaurant Name]! Order online at..."
                                rows={2}
                            />
                            <p className="text-xs text-gray-500 mt-1">Add custom text at the top of receipts</p>
                        </div>

                        <div>
                            <Label>Custom Footer Text</Label>
                            <Textarea
                                value={formData.printer_config.footer_text}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    printer_config: { ...formData.printer_config, footer_text: e.target.value }
                                })}
                                placeholder="e.g., Thank you for your order! Visit us again soon."
                                rows={2}
                            />
                            <p className="text-xs text-gray-500 mt-1">Add custom thank you message or promotional text</p>
                        </div>

                        {formData.printer_config.template === 'custom' && (
                            <div className="border rounded-lg p-4 bg-purple-50">
                                <Label className="text-base font-semibold mb-3 block">Custom Template Options</Label>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-sm">QR Code</p>
                                            <p className="text-xs text-gray-600">Add QR code for order tracking</p>
                                        </div>
                                        <Switch
                                            checked={formData.printer_config.custom_sections?.show_qr_code}
                                            onCheckedChange={(checked) => setFormData({
                                                ...formData,
                                                printer_config: {
                                                    ...formData.printer_config,
                                                    custom_sections: {
                                                        ...formData.printer_config.custom_sections,
                                                        show_qr_code: checked
                                                    }
                                                }
                                            })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-sm">Barcode</p>
                                            <p className="text-xs text-gray-600">Print order number as barcode</p>
                                        </div>
                                        <Switch
                                            checked={formData.printer_config.custom_sections?.show_barcode}
                                            onCheckedChange={(checked) => setFormData({
                                                ...formData,
                                                printer_config: {
                                                    ...formData.printer_config,
                                                    custom_sections: {
                                                        ...formData.printer_config.custom_sections,
                                                        show_barcode: checked
                                                    }
                                                }
                                            })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-sm">Social Media</p>
                                            <p className="text-xs text-gray-600">Display social media handles</p>
                                        </div>
                                        <Switch
                                            checked={formData.printer_config.custom_sections?.show_social_media}
                                            onCheckedChange={(checked) => setFormData({
                                                ...formData,
                                                printer_config: {
                                                    ...formData.printer_config,
                                                    custom_sections: {
                                                        ...formData.printer_config.custom_sections,
                                                        show_social_media: checked
                                                    }
                                                }
                                            })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-sm">Allergen Info</p>
                                            <p className="text-xs text-gray-600">Show allergen warnings</p>
                                        </div>
                                        <Switch
                                            checked={formData.printer_config.custom_sections?.show_allergen_info}
                                            onCheckedChange={(checked) => setFormData({
                                                ...formData,
                                                printer_config: {
                                                    ...formData.printer_config,
                                                    custom_sections: {
                                                        ...formData.printer_config.custom_sections,
                                                        show_allergen_info: checked
                                                    }
                                                }
                                            })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 border-t pt-4">
                            <Label className="text-base font-semibold">Display Options</Label>
                            <div className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="font-medium">Show Logo</p>
                                    <p className="text-sm text-gray-500">Display restaurant logo on receipt</p>
                                </div>
                                <Switch
                                    checked={formData.printer_config.show_logo}
                                    onCheckedChange={(checked) => setFormData({
                                        ...formData,
                                        printer_config: { ...formData.printer_config, show_logo: checked }
                                    })}
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="font-medium">Show Order Number</p>
                                    <p className="text-sm text-gray-500">Display order number prominently</p>
                                </div>
                                <Switch
                                    checked={formData.printer_config.show_order_number}
                                    onCheckedChange={(checked) => setFormData({
                                        ...formData,
                                        printer_config: { ...formData.printer_config, show_order_number: checked }
                                    })}
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="font-medium">Show Customer Details</p>
                                    <p className="text-sm text-gray-500">Include customer name and address</p>
                                </div>
                                <Switch
                                    checked={formData.printer_config.show_customer_details}
                                    onCheckedChange={(checked) => setFormData({
                                        ...formData,
                                        printer_config: { ...formData.printer_config, show_customer_details: checked }
                                    })}
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                                <div>
                                    <p className="font-medium">Auto Print</p>
                                    <p className="text-sm text-gray-500">Automatically print when new order arrives</p>
                                </div>
                                <Switch
                                    checked={formData.printer_config.auto_print}
                                    onCheckedChange={(checked) => setFormData({
                                        ...formData,
                                        printer_config: { ...formData.printer_config, auto_print: checked }
                                    })}
                                />
                            </div>
                        </div>

                        <div className="border-t pt-6">
                            <Label className="text-base font-semibold mb-3 block">Receipt Preview</Label>
                            <div className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300 overflow-x-auto">
                                <div 
                                    className={`bg-white shadow-lg ${formData.printer_config.printer_width === '58mm' ? 'w-[264px]' : 'w-[380px]'}`}
                                    style={{ fontFamily: 'monospace', margin: '0 auto' }}
                                >
                                    <div className={`p-4 ${formData.printer_config.font_size === 'small' ? 'text-xs' : formData.printer_config.font_size === 'large' ? 'text-base' : 'text-sm'}`}>
                                        {/* Logo */}
                                        {formData.printer_config.show_logo && formData.logo_url && (
                                            <div className="text-center mb-3">
                                                <img src={formData.logo_url} alt="Logo" className="h-12 mx-auto object-contain" />
                                            </div>
                                        )}
                                        
                                        {/* Restaurant Name */}
                                        <div className="text-center font-bold mb-1">{restaurant?.name || 'Restaurant Name'}</div>
                                        <div className="text-center text-xs mb-2">{restaurant?.address || 'Restaurant Address'}</div>
                                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                                        
                                        {/* Custom Header */}
                                        {formData.printer_config.header_text && (
                                            <>
                                                <div className="text-center text-xs mb-2">{formData.printer_config.header_text}</div>
                                                <div className="border-t border-dashed border-gray-400 my-2"></div>
                                            </>
                                        )}
                                        
                                        {/* Order Number */}
                                        {formData.printer_config.show_order_number && (
                                            <div className="text-center font-bold text-lg mb-2">ORDER #1234</div>
                                        )}
                                        
                                        {/* Date & Time */}
                                        <div className="text-xs mb-2">{new Date().toLocaleString()}</div>
                                        <div className="text-xs mb-3">Type: {formData.collection_enabled ? 'Delivery/Collection' : 'Delivery'}</div>
                                        
                                        {/* Customer Details */}
                                        {formData.printer_config.show_customer_details && (
                                            <>
                                                <div className="border-t border-dashed border-gray-400 my-2"></div>
                                                <div className="font-bold text-xs mb-1">Customer:</div>
                                                <div className="text-xs">John Smith</div>
                                                <div className="text-xs mb-2">123 Main St, London</div>
                                            </>
                                        )}
                                        
                                        {/* Items */}
                                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                                        <div className="space-y-1 mb-2">
                                            <div className="whitespace-pre">{`1x Margherita Pizza${' '.repeat(Math.max(1, (formData.printer_config.printer_width === '80mm' ? 30 : 15) - '1x Margherita Pizza'.length))}£12.99`}</div>
                                            {formData.printer_config.template === 'detailed' && (
                                                <div className="text-xs text-gray-600 ml-4">Extra cheese, Mushrooms</div>
                                            )}
                                            <div className="whitespace-pre">{`2x Coca Cola${' '.repeat(Math.max(1, (formData.printer_config.printer_width === '80mm' ? 37 : 22) - '2x Coca Cola'.length))}£5.00`}</div>
                                        </div>
                                        
                                        {/* Totals */}
                                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs">
                                                <span>Subtotal:</span>
                                                <span className="ml-auto">£17.99</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span>Delivery:</span>
                                                <span className="ml-auto">£{formData.delivery_fee || '2.00'}</span>
                                            </div>
                                            <div className="flex justify-between font-bold">
                                                <span>TOTAL:</span>
                                                <span className="ml-auto">£{(17.99 + parseFloat(formData.delivery_fee || 2)).toFixed(2)}</span>
                                            </div>
                                        </div>
                                        
                                        {/* Payment Method */}
                                        {formData.printer_config.template !== 'minimal' && (
                                            <div className="text-xs mt-2">Payment: {formData.accepts_cash_on_delivery ? 'Cash on Delivery' : 'Card'}</div>
                                        )}
                                        
                                        {/* Custom Footer */}
                                        {formData.printer_config.footer_text && (
                                            <>
                                                <div className="border-t border-dashed border-gray-400 my-2"></div>
                                                <div className="text-center text-xs">{formData.printer_config.footer_text}</div>
                                            </>
                                        )}
                                        
                                        <div className="border-t border-dashed border-gray-400 my-2"></div>
                                        <div className="text-center text-xs">Thank you!</div>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2 text-center">
                                Preview shows how your receipt will look with current settings
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <Button 
                                onClick={async () => {
                                    if (!restaurant?.printer_config?.bluetooth_printer) {
                                        toast.error('Please connect a Bluetooth printer first');
                                        return;
                                    }

                                    setTestPrinting(true);
                                    try {
                                        const sampleOrder = {
                                            id: 'TEST123',
                                            order_number: 'TEST-001',
                                            created_date: new Date().toISOString(),
                                            order_type: 'delivery',
                                            guest_name: 'Test Customer',
                                            delivery_address: '123 Test Street, London, SW1A 1AA',
                                            phone: '07700 900000',
                                            items: [
                                                { name: 'Margherita Pizza', quantity: 1, price: 12.99, customizations: { Size: 'Large', Extra: 'Cheese' } },
                                                { name: 'Coca Cola', quantity: 2, price: 2.50 }
                                            ],
                                            subtotal: 17.99,
                                            delivery_fee: 2.50,
                                            discount: 0,
                                            total: 20.49,
                                            payment_method: 'Card',
                                            notes: 'Test print - please ignore'
                                        };

                                        await printerService.printReceipt(sampleOrder, restaurant, formData.printer_config);
                                        toast.success('Test receipt printed successfully!');
                                    } catch (error) {
                                        console.error('Test print failed:', error);
                                        toast.error('Test print failed: ' + error.message);
                                    } finally {
                                        setTestPrinting(false);
                                    }
                                }}
                                variant="outline"
                                className="flex-1"
                                disabled={testPrinting || !restaurant?.printer_config?.bluetooth_printer}
                            >
                                {testPrinting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-2" />
                                        Printing...
                                    </>
                                ) : (
                                    <>
                                        <TestTube className="h-4 w-4 mr-2" />
                                        Test Print
                                    </>
                                )}
                            </Button>
                            <Button 
                                onClick={() => {
                                    updateMutation.mutate({ 
                                        printer_config: formData.printer_config
                                    });
                                }}
                                className="flex-1"
                                disabled={updateMutation.isPending}
                            >
                                <Save className="h-4 w-4 mr-2" />
                                Save Settings
                            </Button>
                        </div>
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
                            const dayData = formData[hoursKey]?.[day] || {};

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