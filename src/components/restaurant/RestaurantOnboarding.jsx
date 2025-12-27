import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, ArrowRight, ArrowLeft, Sparkles, Store, UtensilsCrossed, MapPin, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const STEPS = [
    { id: 'welcome', title: 'Welcome', icon: Sparkles },
    { id: 'profile', title: 'Restaurant Profile', icon: Store },
    { id: 'menu', title: 'First Menu Items', icon: UtensilsCrossed },
    { id: 'delivery', title: 'Delivery Setup', icon: MapPin },
    { id: 'tour', title: 'Dashboard Tour', icon: LayoutDashboard },
];

export default function RestaurantOnboarding({ restaurant, onComplete }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [profileData, setProfileData] = useState({
        name: restaurant?.name || '',
        cuisine_type: restaurant?.cuisine_type || '',
        address: restaurant?.address || '',
        description: restaurant?.description || '',
        delivery_time: restaurant?.delivery_time || '30-45 min',
        delivery_fee: restaurant?.delivery_fee || 2.99,
        minimum_order: restaurant?.minimum_order || 15,
    });
    const [menuItems, setMenuItems] = useState([
        { name: '', price: '', category: 'Main', description: '' }
    ]);
    
    const queryClient = useQueryClient();

    const updateRestaurantMutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurant.id, data),
        onSuccess: () => queryClient.invalidateQueries(['restaurant']),
    });

    const createMenuItemsMutation = useMutation({
        mutationFn: (items) => base44.entities.MenuItem.bulkCreate(
            items.map(item => ({ ...item, restaurant_id: restaurant.id, is_available: true }))
        ),
        onSuccess: () => queryClient.invalidateQueries(['menu-items']),
    });

    const completeOnboardingMutation = useMutation({
        mutationFn: () => base44.auth.updateMe({ onboarding_completed: true }),
        onSuccess: () => {
            toast.success('Welcome aboard! Your restaurant is ready to accept orders.');
            onComplete();
        },
    });

    const progress = ((currentStep + 1) / STEPS.length) * 100;

    const handleNext = async () => {
        if (currentStep === 1) {
            // Save restaurant profile
            if (!profileData.name || !profileData.cuisine_type) {
                toast.error('Please fill in restaurant name and cuisine type');
                return;
            }
            await updateRestaurantMutation.mutateAsync(profileData);
        } else if (currentStep === 2) {
            // Save menu items
            const validItems = menuItems.filter(item => item.name && item.price);
            if (validItems.length === 0) {
                toast.error('Please add at least one menu item');
                return;
            }
            await createMenuItemsMutation.mutateAsync(validItems);
        } else if (currentStep === 3) {
            // Save delivery settings
            await updateRestaurantMutation.mutateAsync({
                delivery_time: profileData.delivery_time,
                delivery_fee: profileData.delivery_fee,
                minimum_order: profileData.minimum_order,
            });
        }

        if (currentStep === STEPS.length - 1) {
            await completeOnboardingMutation.mutateAsync();
        } else {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    const addMenuItem = () => {
        setMenuItems([...menuItems, { name: '', price: '', category: 'Main', description: '' }]);
    };

    const updateMenuItem = (index, field, value) => {
        const updated = [...menuItems];
        updated[index][field] = value;
        setMenuItems(updated);
    };

    const removeMenuItem = (index) => {
        setMenuItems(menuItems.filter((_, i) => i !== index));
    };

    return (
        <Dialog open={true} onOpenChange={() => {}}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="space-y-6">
                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Restaurant Setup</h2>
                            <span className="text-sm text-gray-500">
                                Step {currentStep + 1} of {STEPS.length}
                            </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <div className="flex justify-between text-xs text-gray-500">
                            {STEPS.map((step, idx) => {
                                const Icon = step.icon;
                                return (
                                    <div key={step.id} className={`flex items-center gap-1 ${idx === currentStep ? 'text-orange-600 font-semibold' : ''}`}>
                                        <Icon className="h-3 w-3" />
                                        <span className="hidden sm:inline">{step.title}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step Content */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="min-h-[400px]"
                        >
                            {currentStep === 0 && (
                                <div className="text-center py-8">
                                    <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Sparkles className="h-10 w-10 text-white" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900 mb-4">
                                        Welcome to Foodie!
                                    </h3>
                                    <p className="text-gray-600 max-w-md mx-auto mb-6">
                                        Let's get your restaurant set up in just a few minutes. We'll guide you through
                                        creating your profile, adding menu items, and configuring delivery options.
                                    </p>
                                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto text-left">
                                        <div className="bg-orange-50 p-4 rounded-lg">
                                            <CheckCircle className="h-6 w-6 text-orange-600 mb-2" />
                                            <p className="text-sm font-semibold">Easy Setup</p>
                                            <p className="text-xs text-gray-600">Get started in minutes</p>
                                        </div>
                                        <div className="bg-orange-50 p-4 rounded-lg">
                                            <CheckCircle className="h-6 w-6 text-orange-600 mb-2" />
                                            <p className="text-sm font-semibold">Real-time Orders</p>
                                            <p className="text-xs text-gray-600">Instant notifications</p>
                                        </div>
                                        <div className="bg-orange-50 p-4 rounded-lg">
                                            <CheckCircle className="h-6 w-6 text-orange-600 mb-2" />
                                            <p className="text-sm font-semibold">AI Insights</p>
                                            <p className="text-xs text-gray-600">Smart recommendations</p>
                                        </div>
                                        <div className="bg-orange-50 p-4 rounded-lg">
                                            <CheckCircle className="h-6 w-6 text-orange-600 mb-2" />
                                            <p className="text-sm font-semibold">Customer Reviews</p>
                                            <p className="text-xs text-gray-600">Build your reputation</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStep === 1 && (
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Restaurant Profile</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <Label>Restaurant Name *</Label>
                                            <Input
                                                value={profileData.name}
                                                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                                                placeholder="e.g., Joe's Pizza Place"
                                            />
                                        </div>
                                        <div>
                                            <Label>Cuisine Type *</Label>
                                            <Select
                                                value={profileData.cuisine_type}
                                                onValueChange={(value) => setProfileData({ ...profileData, cuisine_type: value })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select cuisine type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {['Pizza', 'Burgers', 'Chinese', 'Indian', 'Thai', 'Sushi', 'Mexican', 'Italian', 'American', 'Healthy'].map(type => (
                                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Address</Label>
                                            <Input
                                                value={profileData.address}
                                                onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                                                placeholder="123 Main St, City, State"
                                            />
                                        </div>
                                        <div>
                                            <Label>Description</Label>
                                            <Textarea
                                                value={profileData.description}
                                                onChange={(e) => setProfileData({ ...profileData, description: e.target.value })}
                                                placeholder="Tell customers about your restaurant..."
                                                rows={3}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold text-gray-900">Add Menu Items</h3>
                                        <Button onClick={addMenuItem} size="sm" variant="outline">
                                            Add Another Item
                                        </Button>
                                    </div>
                                    <p className="text-sm text-gray-600">Add at least one item to get started. You can add more later.</p>
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                        {menuItems.map((item, index) => (
                                            <div key={index} className="border rounded-lg p-4 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-700">Item {index + 1}</span>
                                                    {menuItems.length > 1 && (
                                                        <Button
                                                            onClick={() => removeMenuItem(index)}
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-red-500"
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <Label>Item Name *</Label>
                                                        <Input
                                                            value={item.name}
                                                            onChange={(e) => updateMenuItem(index, 'name', e.target.value)}
                                                            placeholder="e.g., Margherita Pizza"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label>Price ($) *</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={item.price}
                                                            onChange={(e) => updateMenuItem(index, 'price', parseFloat(e.target.value))}
                                                            placeholder="12.99"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label>Category</Label>
                                                    <Select
                                                        value={item.category}
                                                        onValueChange={(value) => updateMenuItem(index, 'category', value)}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {['Starters', 'Main', 'Sides', 'Desserts', 'Drinks'].map(cat => (
                                                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label>Description</Label>
                                                    <Textarea
                                                        value={item.description}
                                                        onChange={(e) => updateMenuItem(index, 'description', e.target.value)}
                                                        placeholder="Brief description..."
                                                        rows={2}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Delivery Settings</h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Configure your delivery options. You can update these anytime.
                                    </p>
                                    <div className="space-y-4">
                                        <div>
                                            <Label>Estimated Delivery Time</Label>
                                            <Input
                                                value={profileData.delivery_time}
                                                onChange={(e) => setProfileData({ ...profileData, delivery_time: e.target.value })}
                                                placeholder="e.g., 30-45 min"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">This helps set customer expectations</p>
                                        </div>
                                        <div>
                                            <Label>Delivery Fee ($)</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={profileData.delivery_fee}
                                                onChange={(e) => setProfileData({ ...profileData, delivery_fee: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <Label>Minimum Order Amount ($)</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={profileData.minimum_order}
                                                onChange={(e) => setProfileData({ ...profileData, minimum_order: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                            <p className="text-sm text-blue-900">
                                                💡 <strong>Tip:</strong> Competitive delivery fees and reasonable minimum orders help
                                                attract more customers while maintaining profitability.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStep === 4 && (
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Your Dashboard Overview</h3>
                                    <div className="space-y-4">
                                        <div className="bg-white border-2 border-orange-200 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                                                    <Store className="h-5 w-5 text-orange-600" />
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-900">Live Orders</h4>
                                                    <p className="text-sm text-gray-600">
                                                        Accept, reject, and manage incoming orders in real-time. Update order status
                                                        and communicate with customers.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-white border-2 border-purple-200 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                                                    <UtensilsCrossed className="h-5 w-5 text-purple-600" />
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-900">Menu Management</h4>
                                                    <p className="text-sm text-gray-600">
                                                        Add, edit, and manage your menu items. Toggle availability and mark popular items.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-white border-2 border-pink-200 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center shrink-0">
                                                    <Sparkles className="h-5 w-5 text-pink-600" />
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-900">AI Meal Deal Suggestions</h4>
                                                    <p className="text-sm text-gray-600">
                                                        Get AI-powered suggestions for creating popular meal deals based on your menu
                                                        and order trends.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-white border-2 border-green-200 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-900">Reviews & Ratings</h4>
                                                    <p className="text-sm text-gray-600">
                                                        View customer reviews and respond to feedback to build your reputation.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-gradient-to-r from-orange-50 to-pink-50 border border-orange-200 rounded-lg p-4 mt-4">
                                            <p className="text-sm font-semibold text-gray-900 mb-2">
                                                🎉 You're all set!
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Complete the setup to start receiving orders. Explore the dashboard to discover
                                                more features like coupons, analytics, and customer messaging.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Navigation Buttons */}
                    <div className="flex justify-between pt-4 border-t">
                        <Button
                            onClick={handleBack}
                            variant="outline"
                            disabled={currentStep === 0}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                        <Button
                            onClick={handleNext}
                            disabled={updateRestaurantMutation.isPending || createMenuItemsMutation.isPending || completeOnboardingMutation.isPending}
                            className="bg-orange-500 hover:bg-orange-600"
                        >
                            {currentStep === STEPS.length - 1 ? 'Complete Setup' : 'Next'}
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}