import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit2, Trash2, Crown, Award, Star, Gift } from 'lucide-react';
import { toast } from 'sonner';

const TIERS = [
  { name: 'Bronze', minPoints: 0, icon: Gift },
  { name: 'Silver', minPoints: 200, icon: Star },
  { name: 'Gold', minPoints: 500, icon: Award },
  { name: 'Platinum', minPoints: 1000, icon: Crown }
];

const BENEFIT_TYPES = [
  { value: 'free_delivery', label: 'Free Delivery' },
  { value: 'bonus_points', label: 'Bonus Points' },
  { value: 'early_access', label: 'Early Access to Rewards' },
  { value: 'priority_support', label: 'Priority Support' },
  { value: 'exclusive_offers', label: 'Exclusive Offers' },
  { value: 'birthday_bonus', label: 'Birthday Bonus' },
  { value: 'custom', label: 'Custom Benefit' }
];

export default function TierBenefitsManagement() {
  const [activeTab, setActiveTab] = useState('Bronze');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBenefit, setEditingBenefit] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  
  const [formData, setFormData] = useState({
    benefit_name: '',
    benefit_description: '',
    benefit_type: 'custom',
    benefit_value: ''
  });

  const queryClient = useQueryClient();

  const { data: tierBenefits = {} } = useQuery({
    queryKey: ['tier-benefits'],
    queryFn: async () => {
      const benefits = await base44.entities.LoyaltyTierBenefit.list();
      const grouped = {};
      TIERS.forEach(tier => {
        grouped[tier.name] = benefits.filter(b => b.tier_name === tier.name && b.is_active);
      });
      return grouped;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const tier = TIERS.find(t => t.name === activeTab);
      return base44.entities.LoyaltyTierBenefit.create({
        ...data,
        tier_name: activeTab,
        tier_min_points: tier.minPoints,
        benefit_value: data.benefit_value ? parseFloat(data.benefit_value) : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier-benefits'] });
      resetForm();
      toast.success('Benefit added successfully');
    },
    onError: () => toast.error('Failed to add benefit')
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.LoyaltyTierBenefit.update(editingBenefit.id, {
        benefit_name: data.benefit_name,
        benefit_description: data.benefit_description,
        benefit_type: data.benefit_type,
        benefit_value: data.benefit_value ? parseFloat(data.benefit_value) : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier-benefits'] });
      resetForm();
      toast.success('Benefit updated successfully');
    },
    onError: () => toast.error('Failed to update benefit')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return base44.entities.LoyaltyTierBenefit.update(id, { is_active: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier-benefits'] });
      setDeleteConfirmOpen(false);
      toast.success('Benefit removed');
    },
    onError: () => toast.error('Failed to remove benefit')
  });

  const resetForm = () => {
    setFormData({ benefit_name: '', benefit_description: '', benefit_type: 'custom', benefit_value: '' });
    setEditingBenefit(null);
    setIsDialogOpen(false);
  };

  const handleSubmit = async () => {
    if (!formData.benefit_name || !formData.benefit_description || !formData.benefit_type) {
      toast.error('Please fill in all fields');
      return;
    }

    if (editingBenefit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const openEditDialog = (benefit) => {
    setEditingBenefit(benefit);
    setFormData({
      benefit_name: benefit.benefit_name,
      benefit_description: benefit.benefit_description,
      benefit_type: benefit.benefit_type,
      benefit_value: benefit.benefit_value || ''
    });
    setIsDialogOpen(true);
  };

  const currentTierBenefits = tierBenefits[activeTab] || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Loyalty Tier Benefits</h2>
        <p className="text-gray-600 mt-1">Define and manage benefits for each loyalty tier</p>
      </div>

      {/* Tier Selection */}
      <div className="flex gap-2 flex-wrap">
        {TIERS.map((tier) => {
          const TierIcon = tier.icon;
          return (
            <button
              key={tier.name}
              onClick={() => setActiveTab(tier.name)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                activeTab === tier.name
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-orange-300'
              }`}
            >
              <TierIcon className="h-5 w-5" />
              <div className="text-left">
                <p className="font-semibold text-sm">{tier.name}</p>
                <p className="text-xs text-gray-600">{tier.minPoints}+ points</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Add Benefit Button */}
      <Button
        onClick={() => {
          resetForm();
          setIsDialogOpen(true);
        }}
        className="bg-orange-500 hover:bg-orange-600 gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Benefit to {activeTab}
      </Button>

      {/* Benefits List */}
      <Card>
        <CardHeader>
          <CardTitle>{activeTab} Tier Benefits</CardTitle>
          <CardDescription>
            These benefits are automatically applied to members of the {activeTab} tier
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentTierBenefits.length === 0 ? (
            <div className="text-center py-8">
              <Gift className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No benefits defined for {activeTab} tier yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentTierBenefits.map((benefit) => {
                const benefitTypeLabel = BENEFIT_TYPES.find(t => t.value === benefit.benefit_type)?.label || benefit.benefit_type;
                return (
                  <div
                    key={benefit.id}
                    className="flex items-start justify-between p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{benefit.benefit_name}</p>
                      <p className="text-sm text-gray-600 mt-1">{benefit.benefit_description}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {benefitTypeLabel}
                        </Badge>
                        {benefit.benefit_value && (
                          <Badge variant="outline" className="text-xs">
                            Value: {benefit.benefit_value}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(benefit)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          setDeleteTarget(benefit);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBenefit ? 'Edit Benefit' : 'Add Benefit to ' + activeTab}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Benefit Name</label>
              <Input
                placeholder="e.g., Free Delivery on All Orders"
                value={formData.benefit_name}
                onChange={(e) => setFormData({ ...formData, benefit_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Benefit Type</label>
              <Select value={formData.benefit_type} onValueChange={(value) => setFormData({ ...formData, benefit_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BENEFIT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                placeholder="Describe the benefit in detail"
                value={formData.benefit_description}
                onChange={(e) => setFormData({ ...formData, benefit_description: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Benefit Value (optional)</label>
              <Input
                placeholder="e.g., 1.5 for 1.5x points multiplier"
                value={formData.benefit_value}
                onChange={(e) => setFormData({ ...formData, benefit_value: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingBenefit ? 'Update' : 'Add'} Benefit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove Benefit</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove "{deleteTarget?.benefit_name}"? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}