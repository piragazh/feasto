import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Bot, UserRound, ArrowLeft, ShoppingBag, RefreshCw } from 'lucide-react';
import { waAdmin } from './whatsappApi';

const STATE_LABEL = {
    browsing: { text: 'Browsing', cls: 'bg-gray-100 text-gray-700' },
    cart: { text: 'Basket', cls: 'bg-blue-100 text-blue-800' },
    awaiting_payment: { text: 'At checkout', cls: 'bg-amber-100 text-amber-800' },
    handoff: { text: 'Staff', cls: 'bg-purple-100 text-purple-800' },
    closed: { text: 'Closed', cls: 'bg-gray-100 text-gray-500' },
};

const time = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return d.toLocaleString('en-GB', today ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const displayNumber = (waId) => (String(waId || '').startsWith('44') ? `0${String(waId).slice(2)}` : `+${waId}`);

export default function WhatsAppInbox({ restaurant }) {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState(null);
    const [messages, setMessages] = useState([]);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);

    const loadConversations = useCallback(async () => {
        try {
            const res = await waAdmin('list_conversations', { restaurant_id: restaurant.id });
            setConversations(res.conversations || []);
            setActive((cur) => (cur ? (res.conversations || []).find((c) => c.id === cur.id) || cur : cur));
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    }, [restaurant.id]);

    const loadMessages = useCallback(async (conversationId) => {
        try {
            const res = await waAdmin('get_messages', { conversation_id: conversationId });
            setMessages(res.messages || []);
        } catch (e) {
            toast.error(e.message);
        }
    }, []);

    useEffect(() => {
        loadConversations();
        const t = setInterval(loadConversations, 15000);
        return () => clearInterval(t);
    }, [loadConversations]);

    useEffect(() => {
        if (!active?.id) return undefined;
        loadMessages(active.id);
        const t = setInterval(() => loadMessages(active.id), 8000);
        return () => clearInterval(t);
    }, [active?.id, loadMessages]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

    const send = async () => {
        if (!reply.trim() || !active) return;
        setSending(true);
        try {
            await waAdmin('staff_reply', { conversation_id: active.id, text: reply.trim() });
            setReply('');
            await Promise.all([loadMessages(active.id), loadConversations()]);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSending(false);
        }
    };

    const toggleHandoff = async () => {
        if (!active) return;
        const handoff = active.state !== 'handoff';
        try {
            const res = await waAdmin('set_handoff', { conversation_id: active.id, handoff });
            setActive({ ...active, state: res.state });
            toast.success(handoff ? 'AI paused — you are answering this chat' : 'AI assistant is back on for this chat');
            loadConversations();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const windowOpen = active?.last_inbound_at && Date.now() - new Date(active.last_inbound_at).getTime() < 24 * 3600 * 1000;

    return (
        <div className="bg-white border rounded-xl overflow-hidden grid md:grid-cols-[300px_1fr] min-h-[560px]">
            {/* Conversation list */}
            <div className={`border-r ${active ? 'hidden md:block' : ''}`}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <p className="font-semibold text-gray-900 text-sm">Chats</p>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={loadConversations} aria-label="Refresh chats">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
                {loading ? (
                    <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></div>
                ) : conversations.length === 0 ? (
                    <p className="p-6 text-sm text-gray-500 text-center">No WhatsApp chats yet.</p>
                ) : (
                    <ul className="divide-y max-h-[620px] overflow-y-auto">
                        {conversations.map((c) => {
                            const st = STATE_LABEL[c.state] || STATE_LABEL.browsing;
                            return (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onClick={() => { setActive(c); setMessages([]); }}
                                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${active?.id === c.id ? 'bg-green-50' : ''}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium text-sm text-gray-900 truncate">{c.customer_name || displayNumber(c.customer_wa_id)}</p>
                                            <span className="text-[11px] text-gray-400 shrink-0">{time(c.updated_date)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <p className="text-xs text-gray-500 truncate">{c.last_message_preview || '—'}</p>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {c.unread_count > 0 && (
                                                    <span className="bg-green-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{c.unread_count}</span>
                                                )}
                                                <Badge className={`${st.cls} text-[10px] px-1.5 py-0`}>{st.text}</Badge>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Thread */}
            <div className={`flex flex-col ${active ? '' : 'hidden md:flex'}`}>
                {!active ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6">Select a chat</div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 px-4 py-3 border-b">
                            <Button size="icon" variant="ghost" className="h-8 w-8 md:hidden" onClick={() => setActive(null)} aria-label="Back to chats">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm text-gray-900 truncate">{active.customer_name || displayNumber(active.customer_wa_id)}</p>
                                <p className="text-xs text-gray-500">{displayNumber(active.customer_wa_id)}</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={toggleHandoff}>
                                {active.state === 'handoff'
                                    ? (<><Bot className="h-4 w-4 mr-1.5" />Resume AI</>)
                                    : (<><UserRound className="h-4 w-4 mr-1.5" />Take over</>)}
                            </Button>
                        </div>

                        {(active.cart || []).length > 0 && (
                            <div className="px-4 py-2 bg-blue-50 border-b text-xs text-blue-900 flex items-start gap-2">
                                <ShoppingBag className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>{active.cart.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</span>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-[#efeae2] max-h-[460px]">
                            {messages.map((m) => {
                                const out = m.direction === 'outbound';
                                return (
                                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words ${out ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                                            {out && m.sender !== 'ai' && (
                                                <p className="text-[10px] font-semibold text-gray-500 mb-0.5 uppercase">{m.sender === 'staff' ? 'Staff' : 'System'}</p>
                                            )}
                                            {m.body}
                                            <p className="text-[10px] text-gray-500 text-right mt-1">
                                                {time(m.created_date)}{out && m.status ? ` · ${m.status}` : ''}
                                            </p>
                                            {m.status === 'failed' && m.error && <p className="text-[11px] text-red-600 mt-0.5">{m.error}</p>}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={bottomRef} />
                        </div>

                        <div className="border-t p-3">
                            {windowOpen ? (
                                <div className="flex gap-2">
                                    <Textarea
                                        rows={2} value={reply} onChange={(e) => setReply(e.target.value)}
                                        placeholder="Reply as the restaurant… (pauses the AI for this chat)"
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                                    />
                                    <Button onClick={send} disabled={sending || !reply.trim()} className="bg-green-600 hover:bg-green-700 self-end" aria-label="Send reply">
                                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 text-center">
                                    The customer last messaged over 24 hours ago. WhatsApp only lets you reply after they message again.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
