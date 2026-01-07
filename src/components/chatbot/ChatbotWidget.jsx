// ============================================
// AI CHATBOT WIDGET - Floating chat interface
// ============================================
// This component provides a popup chat window where users can:
// - Ask questions and get AI-powered responses
// - Get help with orders, deliveries, and policies
// - Escalate complex issues to human support

import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client'; // SDK to call backend
import { Button } from "@/components/ui/button"; // UI Components
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send, Loader2, User, Bot, AlertCircle } from 'lucide-react'; // Icons
import { motion, AnimatePresence } from 'framer-motion'; // Animations
import { toast } from 'sonner'; // Notifications
import EscalationDialog from './EscalationDialog'; // Popup for creating support tickets

export default function ChatbotWidget() {
    // ============================================
    // STATE MANAGEMENT
    // ============================================
    
    // Chat window visibility
    const [isOpen, setIsOpen] = useState(false); // Is chat popup open?
    
    // Conversation messages array
    const [messages, setMessages] = useState([
        {
            role: 'assistant', // Message from bot
            content: 'Hi! I\'m your MealDrop assistant. How can I help you today? I can answer questions about your orders, delivery times, restaurant hours, and refund policies.',
            timestamp: new Date().toISOString() // When message was sent
        }
    ]);
    
    // User input
    const [inputMessage, setInputMessage] = useState(''); // Text being typed
    
    // Loading states
    const [isLoading, setIsLoading] = useState(false); // Waiting for AI response?
    
    // Escalation to human support
    const [showEscalation, setShowEscalation] = useState(false); // Show escalation dialog?
    
    // Reference to scroll to bottom of messages
    const messagesEndRef = useRef(null);

    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    // Scroll chat to show latest message
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Auto-scroll when new messages arrive
    useEffect(() => {
        scrollToBottom();
    }, [messages]); // Runs whenever messages array changes

    // ============================================
    // SEND MESSAGE TO AI
    // ============================================
    const handleSendMessage = async () => {
        // Don't send if empty or already loading
        if (!inputMessage.trim() || isLoading) return;

        // Create user message object
        const userMessage = {
            role: 'user', // Message from customer
            content: inputMessage, // Text they typed
            timestamp: new Date().toISOString()
        };

        // Add user message to chat
        setMessages(prev => [...prev, userMessage]);
        
        // Clear input field
        setInputMessage('');
        
        // Show loading indicator
        setIsLoading(true);

        try {
            // ---- CALL BACKEND FUNCTION ----
            // Send message to AI chatbot backend
            const response = await base44.functions.invoke('chatbotQuery', {
                message: inputMessage, // Current message
                conversationHistory: messages // Previous conversation
            });

            // ---- PROCESS AI RESPONSE ----
            // Create bot message object
            const botMessage = {
                role: 'assistant', // Message from AI
                content: response.data.response, // AI's answer
                timestamp: response.data.timestamp,
                needsEscalation: response.data.needsEscalation // Does this need human help?
            };

            // Add bot response to chat
            setMessages(prev => [...prev, botMessage]);

            // ---- CHECK FOR ESCALATION ----
            // If AI says human support needed, show escalation dialog
            if (response.data.needsEscalation) {
                setTimeout(() => {
                    setShowEscalation(true); // Open support ticket form
                }, 1000); // Wait 1 second before showing
            }
        } catch (error) {
            // ---- ERROR HANDLING ----
            toast.error('Failed to send message. Please try again.');
            
            // Show error message in chat
            const errorMessage = {
                role: 'assistant',
                content: 'I\'m having trouble connecting right now. Please try again or contact support directly.',
                timestamp: new Date().toISOString(),
                isError: true // Flag as error for styling
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            // Hide loading indicator (runs whether success or error)
            setIsLoading(false);
        }
    };

    // ============================================
    // AFTER ESCALATION COMPLETE
    // ============================================
    const handleEscalationComplete = () => {
        // Close escalation dialog
        setShowEscalation(false);
        
        // Add confirmation message to chat
        const confirmMessage = {
            role: 'assistant',
            content: 'Your issue has been escalated to our support team. They\'ll get back to you shortly via email. Is there anything else I can help with?',
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, confirmMessage]);
    };

    // ============================================
    // QUICK QUESTION BUTTONS
    // ============================================
    // Pre-written questions users can click for instant answers
    const quickQuestions = [
        'Where is my order?',
        'How long until delivery?',
        'How do I request a refund?',
        'What are the restaurant hours?'
    ];

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="fixed bottom-20 md:bottom-24 right-2 md:right-4 z-50 w-[calc(100vw-16px)] md:w-96"
                    >
                        <Card className="shadow-2xl border-2">
                            <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                            <Bot className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">MealDrop Assistant</CardTitle>
                                            <div className="flex items-center gap-1 text-xs">
                                                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                                <span>Online</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsOpen(false)}
                                        className="text-white hover:bg-white/20 rounded-full"
                                    >
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {/* Messages */}
                                <div className="h-64 md:h-96 overflow-y-auto p-4 space-y-4 bg-gray-50">
                                    {messages.map((msg, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            {msg.role === 'assistant' && (
                                                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <Bot className="h-4 w-4 text-orange-600" />
                                                </div>
                                            )}
                                            <div
                                                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                                                    msg.role === 'user'
                                                        ? 'bg-orange-500 text-white'
                                                        : msg.isError
                                                        ? 'bg-red-50 text-red-900 border border-red-200'
                                                        : 'bg-white border'
                                                }`}
                                            >
                                                <p className="text-sm leading-relaxed">{msg.content}</p>
                                                {msg.needsEscalation && (
                                                    <Badge className="mt-2 bg-blue-100 text-blue-800 hover:bg-blue-100">
                                                        <AlertCircle className="h-3 w-3 mr-1" />
                                                        Escalation available
                                                    </Badge>
                                                )}
                                            </div>
                                            {msg.role === 'user' && (
                                                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <User className="h-4 w-4 text-gray-600" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="flex gap-2 justify-start">
                                            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                                                <Bot className="h-4 w-4 text-orange-600" />
                                            </div>
                                            <div className="bg-white border rounded-2xl px-4 py-3">
                                                <div className="flex gap-1">
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Quick Questions */}
                                {messages.length === 1 && (
                                    <div className="p-3 bg-white border-t">
                                        <p className="text-xs text-gray-500 mb-2">Quick questions:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {quickQuestions.map((q, idx) => (
                                                <Button
                                                    key={idx}
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setInputMessage(q);
                                                        setTimeout(() => handleSendMessage(), 100);
                                                    }}
                                                    className="text-xs h-8"
                                                >
                                                    {q}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Input */}
                                <div className="p-4 bg-white border-t">
                                    <div className="flex gap-2">
                                        <Input
                                            value={inputMessage}
                                            onChange={(e) => setInputMessage(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                            placeholder="Type your message..."
                                            disabled={isLoading}
                                            className="flex-1"
                                        />
                                        <Button
                                            onClick={handleSendMessage}
                                            disabled={!inputMessage.trim() || isLoading}
                                            className="bg-orange-500 hover:bg-orange-600"
                                        >
                                            {isLoading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Send className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Button */}
            <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="fixed bottom-24 md:bottom-6 right-4 md:right-4 z-50"
            >
                <Button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg"
                >
                    {isOpen ? (
                        <X className="h-5 w-5 md:h-6 md:w-6" />
                    ) : (
                        <MessageCircle className="h-5 w-5 md:h-6 md:w-6" />
                    )}
                </Button>
            </motion.div>

            {/* Escalation Dialog */}
            <EscalationDialog
                isOpen={showEscalation}
                onClose={() => setShowEscalation(false)}
                conversationHistory={messages}
                onComplete={handleEscalationComplete}
            />
        </>
    );
}