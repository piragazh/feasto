import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EscalationDialog({ isOpen, onClose, conversationHistory, onComplete }) {
    const [formData, setFormData] = useState({
        subject: '',
        description: '',
        category: 'general_inquiry',
        priority: 'medium'
    });
    const [submitted, setSubmitted] = useState(false);

    const createTicketMutation = useMutation({
        mutationFn: async (ticketData) => {
            const user = await base44.auth.me();
            return base44.entities.SupportTicket.create({
                ...ticketData,
                customer_email: user.email,
                chat_history: conversationHistory,
                status: 'open'
            });
        },
        onSuccess: () => {
            setSubmitted(true);
            toast.success('Support ticket created successfully');
            setTimeout(() => {
                handleClose();
            }, 2000);
        },
        onError: () => {
            toast.error('Failed to create support ticket');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.subject || !formData.description) {
            toast.error('Please fill in all required fields');
            return;
        }
        createTicketMutation.mutate(formData);
    };

    const handleClose = () => {
        setFormData({
            subject: '',
            description: '',
            category: 'general_inquiry',
            priority: 'medium'
        });
        setSubmitted(false);
        onClose();
        if (onComplete) onComplete();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                {submitted ? (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">Ticket Created!</h3>
                        <p className="text-gray-600">
                            Our support team will get back to you shortly via email.
                        </p>
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-orange-500" />
                                Escalate to Support
                            </DialogTitle>
                            <DialogDescription>
                                Create a support ticket and our team will assist you as soon as possible.
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label htmlFor="subject">Subject *</Label>
                                <Input
                                    id="subject"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    placeholder="Brief description of your issue"
                                    required
                                />
                            </div>

                            <div>
                                <Label htmlFor="category">Category</Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="order_issue">Order Issue</SelectItem>
                                        <SelectItem value="delivery_problem">Delivery Problem</SelectItem>
                                        <SelectItem value="payment_issue">Payment Issue</SelectItem>
                                        <SelectItem value="refund_request">Refund Request</SelectItem>
                                        <SelectItem value="general_inquiry">General Inquiry</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="priority">Priority</Label>
                                <Select
                                    value={formData.priority}
                                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="urgent">Urgent</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="description">Description *</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Please provide detailed information about your issue..."
                                    rows={4}
                                    required
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleClose}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={createTicketMutation.isPending}
                                    className="flex-1 bg-orange-500 hover:bg-orange-600"
                                >
                                    {createTicketMutation.isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        'Create Ticket'
                                    )}
                                </Button>
                            </div>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}