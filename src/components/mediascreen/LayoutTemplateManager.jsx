import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout, Plus, Trash2, Copy, Save, Grid3x3, Maximize, Columns, Rows, Box, Edit, Settings } from 'lucide-react';
import { toast } from 'sonner';

// Pre-built templates
const PRESET_TEMPLATES = [
    {
        id: 'fullscreen',
        name: 'Full Screen',
        description: 'Single full-screen content area',
        icon: Maximize,
        is_preset: true,
        zones: [
            {
                id: 'main',
                name: 'Main Content',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                content_type: 'media'
            }
        ]
    },
    {
        id: 'two-column',
        name: 'Two Column Split',
        description: 'Split screen into two equal columns',
        icon: Columns,
        is_preset: true,
        zones: [
            {
                id: 'left',
                name: 'Left Panel',
                x: 0,
                y: 0,
                width: 50,
                height: 100,
                content_type: 'media'
            },
            {
                id: 'right',
                name: 'Right Panel',
                x: 50,
                y: 0,
                width: 50,
                height: 100,
                content_type: 'media'
            }
        ]
    },
    {
        id: 'three-column',
        name: 'Three Column Split',
        description: 'Split screen into three equal columns',
        icon: Grid3x3,
        is_preset: true,
        zones: [
            {
                id: 'left',
                name: 'Left Panel',
                x: 0,
                y: 0,
                width: 33.33,
                height: 100,
                content_type: 'media'
            },
            {
                id: 'center',
                name: 'Center Panel',
                x: 33.33,
                y: 0,
                width: 33.34,
                height: 100,
                content_type: 'media'
            },
            {
                id: 'right',
                name: 'Right Panel',
                x: 66.67,
                y: 0,
                width: 33.33,
                height: 100,
                content_type: 'media'
            }
        ]
    },
    {
        id: 'main-sidebar',
        name: 'Main + Sidebar',
        description: 'Large main area with sidebar',
        icon: Box,
        is_preset: true,
        zones: [
            {
                id: 'main',
                name: 'Main Content',
                x: 0,
                y: 0,
                width: 70,
                height: 100,
                content_type: 'media'
            },
            {
                id: 'sidebar',
                name: 'Sidebar',
                x: 70,
                y: 0,
                width: 30,
                height: 100,
                content_type: 'media'
            }
        ]
    },
    {
        id: 'header-content',
        name: 'Header + Content',
        description: 'Top header with large content area below',
        icon: Rows,
        is_preset: true,
        zones: [
            {
                id: 'header',
                name: 'Header',
                x: 0,
                y: 0,
                width: 100,
                height: 20,
                content_type: 'media'
            },
            {
                id: 'content',
                name: 'Main Content',
                x: 0,
                y: 20,
                width: 100,
                height: 80,
                content_type: 'media'
            }
        ]
    },
    {
        id: 'quad-split',
        name: 'Quad Split',
        description: 'Four equal quadrants',
        icon: Grid3x3,
        is_preset: true,
        zones: [
            {
                id: 'top-left',
                name: 'Top Left',
                x: 0,
                y: 0,
                width: 50,
                height: 50,
                content_type: 'media'
            },
            {
                id: 'top-right',
                name: 'Top Right',
                x: 50,
                y: 0,
                width: 50,
                height: 50,
                content_type: 'media'
            },
            {
                id: 'bottom-left',
                name: 'Bottom Left',
                x: 0,
                y: 50,
                width: 50,
                height: 50,
                content_type: 'media'
            },
            {
                id: 'bottom-right',
                name: 'Bottom Right',
                x: 50,
                y: 50,
                width: 50,
                height: 50,
                content_type: 'media'
            }
        ]
    }
];

export default function LayoutTemplateManager({ restaurantId, onSelectTemplate, currentTemplate }) {
    const queryClient = useQueryClient();
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateDescription, setTemplateDescription] = useState('');

    const { data: customTemplates = [] } = useQuery({
        queryKey: ['layout-templates', restaurantId],
        queryFn: () => base44.entities.LayoutTemplate.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId
    });

    const createTemplateMutation = useMutation({
        mutationFn: (data) => base44.entities.LayoutTemplate.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['layout-templates']);
            toast.success('Template saved successfully');
            setShowSaveDialog(false);
            setTemplateName('');
            setTemplateDescription('');
        }
    });

    const deleteTemplateMutation = useMutation({
        mutationFn: (id) => base44.entities.LayoutTemplate.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['layout-templates']);
            toast.success('Template deleted');
        }
    });

    const handleSaveCurrentAsTemplate = () => {
        if (!currentTemplate?.zones || currentTemplate.zones.length === 0) {
            toast.error('No layout to save');
            return;
        }
        setShowSaveDialog(true);
    };

    const handleSaveTemplate = () => {
        if (!templateName.trim()) {
            toast.error('Please enter a template name');
            return;
        }

        createTemplateMutation.mutate({
            restaurant_id: restaurantId,
            name: templateName,
            description: templateDescription,
            zones: currentTemplate.zones,
            is_public: false
        });
    };

    const handleDeleteTemplate = (id) => {
        if (window.confirm('Are you sure you want to delete this template?')) {
            deleteTemplateMutation.mutate(id);
        }
    };

    const renderZonePreview = (zones) => {
        return (
            <div className="relative w-full h-24 bg-gray-100 border border-gray-200 rounded overflow-hidden">
                {zones.map((zone, idx) => (
                    <div
                        key={zone.id || idx}
                        className="absolute border-2 border-blue-400 bg-blue-100/50"
                        style={{
                            left: `${zone.x}%`,
                            top: `${zone.y}%`,
                            width: `${zone.width}%`,
                            height: `${zone.height}%`
                        }}
                    >
                        <div className="text-[8px] text-blue-700 font-semibold p-1 truncate">
                            {zone.name}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const allTemplates = [...PRESET_TEMPLATES, ...customTemplates];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Layout className="h-5 w-5" />
                        Layout Templates
                    </h3>
                    <p className="text-sm text-gray-500">
                        Choose a pre-built template or use your custom layouts
                    </p>
                </div>
                {currentTemplate?.zones && currentTemplate.zones.length > 0 && (
                    <Button onClick={handleSaveCurrentAsTemplate} variant="outline" size="sm">
                        <Save className="h-3 w-3 mr-1" />
                        Save Current Layout
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allTemplates.map((template) => {
                    const Icon = template.icon || Layout;
                    const isActive = currentTemplate?.name === template.name || 
                                    (currentTemplate?.id && currentTemplate.id === template.id);
                    
                    return (
                        <Card 
                            key={template.id} 
                            className={`cursor-pointer transition-all hover:shadow-md ${
                                isActive ? 'border-blue-500 border-2 bg-blue-50' : ''
                            }`}
                            onClick={() => onSelectTemplate(template)}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-4 w-4 text-gray-600" />
                                        <CardTitle className="text-sm">{template.name}</CardTitle>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {template.is_preset && (
                                            <Badge variant="outline" className="text-xs">
                                                Preset
                                            </Badge>
                                        )}
                                        {!template.is_preset && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteTemplate(template.id);
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3 text-red-500" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-gray-600 mb-3">
                                    {template.description}
                                </p>
                                {renderZonePreview(template.zones)}
                                <div className="mt-2 text-xs text-gray-500">
                                    {template.zones.length} zone{template.zones.length !== 1 ? 's' : ''}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save Layout as Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Template Name</Label>
                            <Input
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="e.g., My Custom Layout"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Description (optional)</Label>
                            <Input
                                value={templateDescription}
                                onChange={(e) => setTemplateDescription(e.target.value)}
                                placeholder="Describe what this layout is used for"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Preview</Label>
                            <div className="mt-1">
                                {currentTemplate?.zones && renderZonePreview(currentTemplate.zones)}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleSaveTemplate} className="flex-1">
                                <Save className="h-4 w-4 mr-2" />
                                Save Template
                            </Button>
                            <Button onClick={() => setShowSaveDialog(false)} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}