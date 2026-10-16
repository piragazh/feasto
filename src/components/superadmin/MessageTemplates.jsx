import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquareText, Smartphone } from 'lucide-react';
import MessageWordingEditor from './templates/MessageWordingEditor';
import WaTemplateBuilder from './templates/WaTemplateBuilder';

/**
 * Super Admin > Message Templates
 *  - Message wording: text of SMS and WhatsApp messages the platform sends (global + per-restaurant)
 *  - WhatsApp templates: Meta-approved templates for messages outside the 24-hour window
 */
export default function MessageTemplates() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Message Templates</h2>
                <p className="text-sm text-gray-500">Edit what customers receive by SMS and WhatsApp, and manage WhatsApp templates approved by Meta.</p>
            </div>
            <Tabs defaultValue="wording">
                <TabsList>
                    <TabsTrigger value="wording"><MessageSquareText className="h-4 w-4 mr-1.5" />Message wording</TabsTrigger>
                    <TabsTrigger value="meta"><Smartphone className="h-4 w-4 mr-1.5" />WhatsApp templates (Meta)</TabsTrigger>
                </TabsList>
                <TabsContent value="wording" className="mt-4"><MessageWordingEditor /></TabsContent>
                <TabsContent value="meta" className="mt-4"><WaTemplateBuilder /></TabsContent>
            </Tabs>
        </div>
    );
}
