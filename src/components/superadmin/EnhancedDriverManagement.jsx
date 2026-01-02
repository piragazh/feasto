import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    Truck, UserPlus, DollarSign, TrendingUp, Star, 
    MapPin, Clock, Award, Settings, Download, Filter 
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function EnhancedDriverManagement() {
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showSettingsDialog, setShowSettingsDialog] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        email: '',
        vehicle_type: 'bike'
    });
    const [fareSettings, setFareSettings] = useState({
        base_fare: '3.00',
        per_mile_rate: '0.50',
        per_minute_rate: '0.15',
        min_fare: '5.00',
        peak_multiplier: '1.5'
    });

    const queryClient = useQueryClient();

    const { data: drivers = [] } = useQuery({
        queryKey: ['drivers'],
        queryFn: () => base44.entities.Driver.list(),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['driver-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 1000),
    });

    const { data: ratings = [] } = useQuery({
        queryKey: ['driver-ratings'],
        queryFn: () => base44.entities.DriverRating.list(),
    });

    const { data: systemSettings = [] } = useQuery({
        queryKey: ['fare-settings'],
        queryFn: () => base44.entities.SystemSettings.list(),
    });

    // Load fare settings
    React.useEffect(() => {
        const baseFare = systemSettings.find(s => s.setting_key === 'base_fare');
        const perMile = systemSettings.find(s => s.setting_key === 'per_mile_rate');
        const perMinute = systemSettings.find(s => s.setting_key === 'per_minute_rate');
        const minFare = systemSettings.find(s => s.setting_key === 'min_fare');
        const peakMultiplier = systemSettings.find(s => s.setting_key === 'peak_multiplier');

        if (baseFare || perMile || perMinute || minFare || peakMultiplier) {
            setFareSettings({
                base_fare: baseFare?.setting_value || '3.00',
                per_mile_rate: perMile?.setting_value || '0.50',
                per_minute_rate: perMinute?.setting_value || '0.15',
                min_fare: minFare?.setting_value || '5.00',
                peak_multiplier: peakMultiplier?.setting_value || '1.5'
            });
        }
    }, [systemSettings]);

    const inviteDriverMutation = useMutation({
        mutationFn: async (data) => {
            // Invite user
            await base44.users.inviteUser(data.email, 'user');
            // Create driver profile
            return base44.entities.Driver.create({
                full_name: data.full_name,
                phone: data.phone,
                vehicle_type: data.vehicle_type,
                is_available: false,
                total_deliveries: 0,
                rating: 5.0
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver invited successfully');
            setShowAddDialog(false);
            setFormData({ full_name: '', phone: '', email: '', vehicle_type: 'bike' });
        },
        onError: (error) => {
            toast.error('Failed to invite driver: ' + error.message);
        }
    });

    const updateDriverMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Driver.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver updated');
        },
    });

    const deleteDriverMutation = useMutation({
        mutationFn: (id) => base44.entities.Driver.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver removed');
        },
    });

    const saveFareSettingsMutation = useMutation({
        mutationFn: async (settings) => {
            const promises = Object.entries(settings).map(([key, value]) => {
                const existing = systemSettings.find(s => s.setting_key === key);
                if (existing) {
                    return base44.entities.SystemSettings.update(existing.id, { setting_value: value });
                } else {
                    return base44.entities.SystemSettings.create({
                        setting_key: key,
                        setting_value: value,
                        description: `Driver fare: ${key.replace(/_/g, ' ')}`
                    });
                }
            });
            return Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['fare-settings']);
            toast.success('Fare settings updated');
            setShowSettingsDialog(false);
        },
    });

    // Calculate driver statistics
    const driverStats = useMemo(() => {
        return drivers.map(driver => {
            const driverOrders = orders.filter(o => o.driver_id === driver.id && o.status === 'delivered');
            const driverRatings = ratings.filter(r => r.driver_id === driver.id);
            
            const totalEarnings = driverOrders.reduce((sum, order) => {
                // Calculate fare based on distance
                const distance = order.optimized_route?.distance || 3; // miles
                const duration = order.optimized_route?.duration || 20; // minutes
                
                const baseFare = parseFloat(fareSettings.base_fare);
                const distanceFare = distance * parseFloat(fareSettings.per_mile_rate);
                const timeFare = duration * parseFloat(fareSettings.per_minute_rate);
                
                let totalFare = baseFare + distanceFare + timeFare;
                totalFare = Math.max(totalFare, parseFloat(fareSettings.min_fare));
                
                return sum + totalFare;
            }, 0);

            const avgRating = driverRatings.length > 0
                ? driverRatings.reduce((sum, r) => sum + r.rating, 0) / driverRatings.length
                : driver.rating || 5.0;

            const completionRate = driver.total_deliveries > 0
                ? (driverOrders.length / driver.total_deliveries) * 100
                : 100;

            return {
                ...driver,
                deliveries: driverOrders.length,
                earnings: totalEarnings,
                avgRating,
                completionRate,
                avgEarningsPerDelivery: driverOrders.length > 0 ? totalEarnings / driverOrders.length : 0
            };
        }).sort((a, b) => b.earnings - a.earnings);
    }, [drivers, orders, ratings, fareSettings]);

    const totalDrivers = drivers.length;
    const activeDrivers = drivers.filter(d => d.is_available).length;
    const totalEarnings = driverStats.reduce((sum, d) => sum + d.earnings, 0);
    const totalDeliveries = driverStats.reduce((sum, d) => sum + d.deliveries, 0);

    const handleAddDriver = () => {
        if (!formData.full_name || !formData.phone || !formData.email) {
            toast.error('Please fill in all fields');
            return;
        }
        inviteDriverMutation.mutate(formData);
    };

    const toggleAvailability = (driver) => {
        updateDriverMutation.mutate({
            id: driver.id,
            data: { is_available: !driver.is_available }
        });
    };

    const exportDriverReport = () => {
        const csvRows = [];
        csvRows.push('Driver Performance Report');
        csvRows.push(`Generated: ${new Date().toLocaleString()}`);
        csvRows.push('');
        csvRows.push('Driver Name,Phone,Vehicle,Status,Deliveries,Earnings,Avg Rating,Avg Earnings/Delivery');
        
        driverStats.forEach(d => {
            csvRows.push([
                d.full_name,
                d.phone,
                d.vehicle_type,
                d.is_available ? 'Available' : 'Offline',
                d.deliveries,
                `£${d.earnings.toFixed(2)}`,
                d.avgRating.toFixed(1),
                `£${d.avgEarningsPerDelivery.toFixed(2)}`
            ].join(','));
        });

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `driver-report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Driver Management</h2>
                    <p className="text-gray-600">Onboard, manage, and track driver performance</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={exportDriverReport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                    <Button variant="outline" onClick={() => setShowSettingsDialog(true)}>
                        <Settings className="h-4 w-4 mr-2" />
                        Fare Settings
                    </Button>
                    <Button onClick={() => setShowAddDialog(true)} className="bg-orange-500 hover:bg-orange-600">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Onboard Driver
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Drivers</span>
                            <Truck className="h-5 w-5 text-blue-500" />
                        </div>
                        <p className="text-3xl font-bold">{totalDrivers}</p>
                        <p className="text-xs text-gray-500 mt-1">{activeDrivers} currently active</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Earnings</span>
                            <DollarSign className="h-5 w-5 text-green-500" />
                        </div>
                        <p className="text-3xl font-bold">£{totalEarnings.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">All time</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Deliveries</span>
                            <MapPin className="h-5 w-5 text-purple-500" />
                        </div>
                        <p className="text-3xl font-bold">{totalDeliveries}</p>
                        <p className="text-xs text-gray-500 mt-1">Completed orders</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Avg per Delivery</span>
                            <TrendingUp className="h-5 w-5 text-orange-500" />
                        </div>
                        <p className="text-3xl font-bold">
                            £{totalDeliveries > 0 ? (totalEarnings / totalDeliveries).toFixed(2) : '0.00'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Driver earnings</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Top Drivers by Earnings</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={driverStats.slice(0, 10)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="full_name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="earnings" fill="#f97316" name="Earnings (£)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Deliveries by Driver</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={driverStats.slice(0, 10)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="full_name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="deliveries" fill="#3b82f6" name="Deliveries" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Driver List */}
            <Card>
                <CardHeader>
                    <CardTitle>All Drivers</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 px-4 font-semibold">Driver</th>
                                    <th className="text-left py-3 px-4 font-semibold">Vehicle</th>
                                    <th className="text-right py-3 px-4 font-semibold">Deliveries</th>
                                    <th className="text-right py-3 px-4 font-semibold">Earnings</th>
                                    <th className="text-right py-3 px-4 font-semibold">Avg/Delivery</th>
                                    <th className="text-right py-3 px-4 font-semibold">Rating</th>
                                    <th className="text-center py-3 px-4 font-semibold">Status</th>
                                    <th className="text-center py-3 px-4 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {driverStats.map((driver) => (
                                    <tr key={driver.id} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <div>
                                                <p className="font-semibold">{driver.full_name}</p>
                                                <p className="text-xs text-gray-500">{driver.phone}</p>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge variant="outline">{driver.vehicle_type}</Badge>
                                        </td>
                                        <td className="text-right py-3 px-4">{driver.deliveries}</td>
                                        <td className="text-right py-3 px-4 font-semibold text-green-600">
                                            £{driver.earnings.toFixed(2)}
                                        </td>
                                        <td className="text-right py-3 px-4">
                                            £{driver.avgEarningsPerDelivery.toFixed(2)}
                                        </td>
                                        <td className="text-right py-3 px-4">
                                            <div className="flex items-center justify-end gap-1">
                                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                                <span>{driver.avgRating.toFixed(1)}</span>
                                            </div>
                                        </td>
                                        <td className="text-center py-3 px-4">
                                            <Badge variant={driver.is_available ? 'default' : 'secondary'}>
                                                {driver.is_available ? 'Active' : 'Offline'}
                                            </Badge>
                                        </td>
                                        <td className="text-center py-3 px-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => toggleAvailability(driver)}
                                                >
                                                    {driver.is_available ? 'Deactivate' : 'Activate'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        if (confirm('Remove this driver?')) {
                                                            deleteDriverMutation.mutate(driver.id);
                                                        }
                                                    }}
                                                    className="text-red-600"
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Add Driver Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Onboard New Driver</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Full Name *</Label>
                            <Input
                                value={formData.full_name}
                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                placeholder="John Doe"
                            />
                        </div>
                        <div>
                            <Label>Email *</Label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="john@example.com"
                            />
                        </div>
                        <div>
                            <Label>Phone *</Label>
                            <Input
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="+44 7123 456789"
                            />
                        </div>
                        <div>
                            <Label>Vehicle Type *</Label>
                            <select
                                value={formData.vehicle_type}
                                onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                                className="w-full h-10 px-3 border rounded-md"
                            >
                                <option value="bike">Bike</option>
                                <option value="scooter">Scooter</option>
                                <option value="car">Car</option>
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                        <Button onClick={handleAddDriver} disabled={inviteDriverMutation.isPending}>
                            {inviteDriverMutation.isPending ? 'Inviting...' : 'Invite Driver'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Fare Settings Dialog */}
            <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Driver Fare Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Base Fare (£)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={fareSettings.base_fare}
                                onChange={(e) => setFareSettings({ ...fareSettings, base_fare: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Fixed amount per delivery</p>
                        </div>
                        <div>
                            <Label>Per Mile Rate (£)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={fareSettings.per_mile_rate}
                                onChange={(e) => setFareSettings({ ...fareSettings, per_mile_rate: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Amount charged per mile</p>
                        </div>
                        <div>
                            <Label>Per Minute Rate (£)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={fareSettings.per_minute_rate}
                                onChange={(e) => setFareSettings({ ...fareSettings, per_minute_rate: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Amount charged per minute</p>
                        </div>
                        <div>
                            <Label>Minimum Fare (£)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={fareSettings.min_fare}
                                onChange={(e) => setFareSettings({ ...fareSettings, min_fare: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Minimum amount per delivery</p>
                        </div>
                        <div>
                            <Label>Peak Hours Multiplier</Label>
                            <Input
                                type="number"
                                step="0.1"
                                value={fareSettings.peak_multiplier}
                                onChange={(e) => setFareSettings({ ...fareSettings, peak_multiplier: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Multiplier for peak hours (future use)</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-800 font-semibold mb-1">Example Calculation:</p>
                            <p className="text-xs text-blue-700">
                                3 miles, 20 minutes = £{fareSettings.base_fare} + (3 × £{fareSettings.per_mile_rate}) + (20 × £{fareSettings.per_minute_rate}) = 
                                £{(parseFloat(fareSettings.base_fare) + (3 * parseFloat(fareSettings.per_mile_rate)) + (20 * parseFloat(fareSettings.per_minute_rate))).toFixed(2)}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>Cancel</Button>
                        <Button onClick={() => saveFareSettingsMutation.mutate(fareSettings)} disabled={saveFareSettingsMutation.isPending}>
                            Save Settings
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}