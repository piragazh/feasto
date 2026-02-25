import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function SmsNotificationSettings({ restaurantId, currentSettings }) {
  const [settings, setSettings] = useState(currentSettings || {
    enabled: true,
    confirmed: true,
    preparing: false,
    out_for_delivery: false,
    delivered: false,
    ready_for_collection: true
  });
  const [isSaving, setIsSaving] = useState(false);

  const statusOptions = [
    { key: 'confirmed', label: 'Order Confirmed', description: 'Customer receives order confirmation' },
    { key: 'preparing', label: 'Preparing Order', description: 'Notify customer order is being prepared' },
    { key: 'out_for_delivery', label: 'Out for Delivery', description: 'Notify customer driver is en route' },
    { key: 'delivered', label: 'Order Delivered', description: 'Confirm order has been delivered' },
    { key: 'ready_for_collection', label: 'Ready for Collection', description: 'Notify customer to collect order' }
  ];

  const handleToggle = (key) => {
    if (key === 'enabled') {
      setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
    } else {
      setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await base44.entities.Restaurant.update(restaurantId, {
        sms_notification_settings: settings
      });
      toast.success('SMS notification settings saved');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMS Notification Settings</CardTitle>
        <p className="text-sm text-gray-500 mt-2">Control which order statuses trigger customer SMS notifications</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Enable SMS Notifications</h3>
              <p className="text-sm text-gray-600">Master toggle for all SMS notifications</p>
            </div>
            <div className="flex items-center">
              <Checkbox
                checked={settings.enabled}
                onCheckedChange={() => handleToggle('enabled')}
              />
            </div>
          </div>
        </div>

        {/* Status Notifications */}
        {settings.enabled && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Notification Triggers</h3>
            <div className="grid gap-4">
              {statusOptions.map((option) => (
                <div
                  key={option.key}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={settings[option.key]}
                        onCheckedChange={() => handleToggle(option.key)}
                        disabled={!settings.enabled}
                      />
                      <label className="font-medium text-gray-900 cursor-pointer">
                        {option.label}
                      </label>
                    </div>
                    <p className="text-sm text-gray-600 ml-6 mt-1">
                      {option.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!settings.enabled && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-600">
            SMS notifications are disabled. Enable them above to configure individual triggers.
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}