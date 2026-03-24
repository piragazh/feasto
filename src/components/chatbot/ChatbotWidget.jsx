import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send, Loader2, Bot, ShoppingCart, ChevronRight, Zap, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EscalationDialog from './EscalationDialog';

// ── helpers ─────────────────────────────────────────────────────────────────
const getCart = () => {
    try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
};
const getCartTotal = (cart) => cart.reduce((s, i) => s + i.price * i.quantity, 0);

const STATUS_LABELS = {
    pending: '🕐 Received',
    confirmed: '✅ Confirmed',
    preparing: '👨‍🍳 Preparing',
    out_for_delivery: '🛵 Out for delivery',
    ready_for_collection: '🏪 Ready to collect',
    delivered: '🎉 Delivered',
    collected: '🎉 Collected',
    cancelled: '❌ Cancelled',
};

// ── sub-components ───────────────────────────────────────────────────────────
function ItemCard({ item, onAdd }) {
    return (
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-2 shadow-sm">
            {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            ) : (
                <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0 text-xl">🍽️</div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                <p className="text-sm font-bold text-orange-600">£{item.price?.toFixed(2)}</p>
                {item.reason && <p className="text-xs text-gray-400 truncate">{item.reason}</p>}
            </div>
            <Button
                size="sm"
                onClick={() => onAdd(item)}
                className="bg-orange-500 hover:bg-orange-600 text-white h-8 px-3 text-xs flex-shrink-0"
            >
                Add
            </Button>
        </div>
    );
}

function OrderTracker({ trackData }) {
    if (!trackData?.status) return null;
    const label = STATUS_LABELS[trackData.status] || trackData.status;
    const stages = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
    const idx = stages.indexOf(trackData.status);
    return (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mt-1">
            <p className="text-xs font-semibold text-orange-700 mb-1">{trackData.restaurant}</p>
            <p className="text-sm font-bold text-gray-900 mb-2">{label}</p>
            <div className="flex gap-1">
                {stages.slice(0, 5).map((s, i) => (
                    <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-orange-500' : 'bg-gray-200'}`} />
                ))}
            </div>
        </div>
    );
}

function CartSummaryBar({ cart }) {
    if (!cart.length) return null;
    const total = getCartTotal(cart);
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    return (
        <div className="flex items-center gap-2 bg-orange-500 text-white px-3 py-2 text-xs font-medium">
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>{count} item{count !== 1 ? 's' : ''} • £{total.toFixed(2)}</span>
            <button
                className="ml-auto text-white/80 hover:text-white underline text-xs"
                onClick={() => window.location.href = '/Checkout'}
            >
                Checkout →
            </button>
        </div>
    );
}

function MessageBubble({ msg, onAddItem, onQuickAction }) {
    const isUser = msg.role === 'user';
    return (
        <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
                <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-orange-600" />
                </div>
            )}
            <div className={`max-w-[80%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                {msg.content && (
                    <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                            ? 'bg-orange-500 text-white rounded-tr-sm'
                            : msg.isError
                            ? 'bg-red-50 text-red-900 border border-red-200'
                            : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                    }`}>
                        {msg.content}
                    </div>
                )}

                {/* Order tracker */}
                {msg.trackData && <OrderTracker trackData={msg.trackData} />}

                {/* Suggested items */}
                {msg.suggestedItems?.length > 0 && (
                    <div className="space-y-1.5 w-full">
                        {msg.suggestedItems.map((item, i) => (
                            <ItemCard key={i} item={item} onAdd={onAddItem} />
                        ))}
                    </div>
                )}

                {/* Quick action buttons */}
                {msg.quickActions?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {msg.quickActions.map((action, i) => (
                            <button
                                key={i}
                                onClick={() => onQuickAction(action)}
                                className="bg-white border border-orange-200 text-orange-700 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-orange-50 transition-colors"
                            >
                                {action}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── main component ───────────────────────────────────────────────────────────
export default function ChatbotWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [currentRestaurant, setCurrentRestaurant] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showEscalation, setShowEscalation] = useState(false);
    const [cart, setCart] = useState([]);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Sync cart every second
    useEffect(() => {
        const sync = () => setCart(getCart());
        sync();
        const id = setInterval(sync, 1000);
        return () => clearInterval(id);
    }, []);

    // Detect restaurant context
    useEffect(() => {
        const getRestaurant = async () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const id = urlParams.get('id');
                if (id) {
                    const r = await base44.entities.Restaurant.filter({ id });
                    if (r[0]) setCurrentRestaurant(r[0]);
                }
            } catch {}
        };
        getRestaurant();
    }, []);

    // Welcome message
    useEffect(() => {
        const cartItems = getCart();
        let greeting;
        if (cartItems.length > 0) {
            const total = getCartTotal(cartItems);
            greeting = `Hey! 👋 You've got ${cartItems.reduce((s,i) => s + i.quantity, 0)} items in your cart (£${total.toFixed(2)}).\n\nWant to add anything else, or shall I help you find a deal?`;
        } else if (currentRestaurant) {
            greeting = `Hey! 👋 I'm your assistant for ${currentRestaurant.name}.\n\nI can help you build your order, find the best deals, or track your delivery.\n\nWhat are you after? 🍽️`;
        } else {
            greeting = `Hey! 👋 I'm your MealDrop assistant.\n\nI can help you find food, track orders, and discover deals.\n\nWhat can I get you?`;
        }

        setMessages([{
            role: 'assistant',
            content: greeting,
            quickActions: cartItems.length > 0
                ? ['Add more items', 'Best deals', 'Go to checkout']
                : ['🔥 Show best sellers', '💥 Best deals', '📦 Track my order'],
            timestamp: new Date().toISOString()
        }]);
    }, [currentRestaurant]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const sendMessage = useCallback(async (text) => {
        const msg = (text || inputMessage).trim();
        if (!msg || isLoading) return;

        setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
        setInputMessage('');
        setIsLoading(true);

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const restaurantId = urlParams.get('id') || currentRestaurant?.id || null;
            const currentCart = getCart();

            const res = await base44.functions.invoke('chatbotQuery', {
                message: msg,
                conversationHistory: messages.slice(-8),
                restaurantId,
                cartItems: currentCart,
                cartTotal: getCartTotal(currentCart)
            });

            const { response, suggestedItems = [], quickActions = [], trackData = null, needsEscalation } = res.data;

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response,
                suggestedItems,
                quickActions,
                trackData,
                timestamp: new Date().toISOString()
            }]);

            if (needsEscalation) setTimeout(() => setShowEscalation(true), 800);
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Sorry, I had a hiccup! Try again or ask me something else. 😅",
                isError: true,
                timestamp: new Date().toISOString()
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [inputMessage, isLoading, messages, currentRestaurant]);

    const handleAddItem = useCallback((item) => {
        const cart = getCart();
        const existing = cart.find(c => c.id === item.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({ id: item.id, name: item.name, price: item.price, quantity: 1, restaurant_id: item.restaurant_id });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        setCart([...cart]);

        // Confirm and upsell
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ Added ${item.name} to your cart!\nCart total: £${getCartTotal(cart).toFixed(2)}`,
            quickActions: ['Add more', 'Show deals', 'Checkout →'],
            timestamp: new Date().toISOString()
        }]);
    }, []);

    const handleEscalationComplete = () => {
        setShowEscalation(false);
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: "Done! Your issue has been sent to the restaurant. They'll be in touch shortly. Anything else I can help with?",
            quickActions: ['Show menu', 'Track order'],
            timestamp: new Date().toISOString()
        }]);
    };

    const unreadCount = 0; // Could be extended

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ duration: 0.18 }}
                        className="fixed bottom-20 md:bottom-24 right-2 md:right-4 z-50 w-[calc(100vw-16px)] md:w-[380px]"
                    >
                        <div className="flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-gray-100 bg-white" style={{ height: '540px', maxHeight: 'calc(100vh - 120px)' }}>
                            {/* Header */}
                            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                                {currentRestaurant?.logo_url ? (
                                    <img src={currentRestaurant.logo_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white/30" />
                                ) : (
                                    <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                                        <Bot className="h-5 w-5 text-white" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-bold text-sm truncate">
                                        {currentRestaurant ? `${currentRestaurant.name}` : 'MealDrop Assistant'}
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                        <span className="text-white/80 text-xs">Smart ordering assistant</span>
                                    </div>
                                </div>
                                <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Cart bar */}
                            <CartSummaryBar cart={cart} />

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                                {messages.map((msg, idx) => (
                                    <MessageBubble
                                        key={idx}
                                        msg={msg}
                                        onAddItem={handleAddItem}
                                        onQuickAction={(action) => sendMessage(action)}
                                    />
                                ))}
                                {isLoading && (
                                    <div className="flex gap-2 items-start">
                                        <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Bot className="h-3.5 w-3.5 text-orange-600" />
                                        </div>
                                        <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" />
                                                <span className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                                                <span className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="bg-white border-t border-gray-100 px-3 py-3 flex-shrink-0">
                                <div className="flex gap-2">
                                    <input
                                        ref={inputRef}
                                        value={inputMessage}
                                        onChange={(e) => setInputMessage(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                        placeholder="Ask me anything…"
                                        disabled={isLoading}
                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 transition-all disabled:opacity-50"
                                    />
                                    <button
                                        onClick={() => sendMessage()}
                                        disabled={!inputMessage.trim() || isLoading}
                                        className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-4 w-4 text-white animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4 text-white" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating button */}
            <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => setIsOpen(o => !o)}
                className="fixed bottom-24 md:bottom-6 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg flex items-center justify-center transition-all"
            >
                <AnimatePresence mode="wait">
                    {isOpen ? (
                        <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                            <X className="h-6 w-6 text-white" />
                        </motion.div>
                    ) : (
                        <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                            <MessageCircle className="h-6 w-6 text-white" />
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Cart count badge */}
                {cart.length > 0 && !isOpen && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {cart.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                )}
            </motion.button>

            <EscalationDialog
                isOpen={showEscalation}
                onClose={() => setShowEscalation(false)}
                conversationHistory={messages}
                onComplete={handleEscalationComplete}
            />
        </>
    );
}