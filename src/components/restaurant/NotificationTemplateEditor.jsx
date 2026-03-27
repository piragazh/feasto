import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const STATUSES = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'ready_for_collection', 'cancelled'];
const CHANNELS = ['sms', 'whatsapp'];
const VARIABLES = [
  { name: 'order_number', desc: 'Order number' },
  { name: 'restaurant_name', desc: 'Restaurant name' },
  { name: 'eta', desc: 'Estimated time of arrival' },
  { name: 'delivery_address', desc: 'Delivery address' },
  { name: 'customer_name', desc: 'Customer name' },
  { name: 'items_count', desc: 'Number of items' }
];

export default function NotificationTemplateEditor({ restaurantId, channelFilter = null }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['notification-templates', restaurantId],
    queryFn: () => base44.entities.NotificationTemplate.filter({ restaurant_id: restaurantId })
  });

  const filteredTemplates = channelFilter 
    ? templates.filter(t => t.channel === channelFilter)
    : templates;

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.NotificationTemplate.create({
      restaurant_id: restaurantId,
      ...data
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates', restaurantId] });
      setFormData({});
      toast.success('Template created');
    },
    onError: () => toast.error('Failed to create template')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => base44.entities.NotificationTemplate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates', restaurantId] });
      setEditingId(null);
      setFormData({});
      toast.success('Template updated');
    },
    onError: () => toast.error('Failed to update template')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.NotificationTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates', restaurantId] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template')
  });

  const handleEdit = (template) => {
    setEditingId(template.id);
    setFormData(template);
  };

  const handleSave = () => {
    if (!formData.channel || !formData.status || !formData.template_text) {
      toast.error('All fields required');
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({});
  };

  if (isLoading) return <div className="text-center py-4">Loading templates...</div>;

  return (
    <div className="space-y-6">
      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Edit Template' : 'Create Template'}</CardTitle>
          <CardDescription>Customize notification messages for order updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Channel</label>
              <Select value={formData.channel || ''} onValueChange={(val) => setFormData({ ...formData, channel: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(ch => (
                    <SelectItem key={ch} value={ch}>{ch.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={formData.status || ''} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(st => (
                    <SelectItem key={st} value={st}>{st.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Message Template</label>
            <Textarea
              value={formData.template_text || ''}
              onChange={(e) => setFormData({ ...formData, template_text: e.target.value })}
              placeholder="e.g., Hi {customer_name}, your order #{order_number} at {restaurant_name} is being prepared. ETA: {eta}"
              className="h-24"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {VARIABLES.map(v => (
                <Badge key={v.name} variant="outline" className="text-xs cursor-pointer" 
                  onClick={() => setFormData({ ...formData, template_text: (formData.template_text || '') + `{${v.name}}` })}>
                  {v.name}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save Template
            </Button>
            {editingId && (
              <Button variant="outline" onClick={handleCancel}>
                <RotateCcw className="w-4 h-4 mr-2" /> Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Templates List */}
      <div className="space-y-2">
        {filteredTemplates.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No templates yet</p>
        ) : (
          filteredTemplates.map(template => (
            <Card key={template.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Badge>{template.channel.toUpperCase()}</Badge>
                      <Badge variant="outline">{template.status.replace(/_/g, ' ')}</Badge>
                      {!template.is_active && <Badge variant="secondary">Disabled</Badge>}
                    </div>
                    <p className="text-sm text-gray-700">{template.template_text}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(template)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(template.id)}>Delete</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}