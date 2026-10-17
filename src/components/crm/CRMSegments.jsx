import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Send, Pencil, Users } from 'lucide-react';
import { toast } from 'sonner';
import { crm, SKIP_REASON, money } from './crmClient';

// Fields the rule builder offers; `type` decides which operators and input appear.
export const RULE_FIELDS = [
    { field: 'stage', label: 'Stage', type: 'enum', options: [['new', 'New'], ['active', 'Active'], ['at_risk', 'At risk'], ['lapsed', 'Lapsed']] },
    { field: 'is_vip', label: 'Is VIP', type: 'bool' },
    { field: 'order_count', label: 'Number of orders', type: 'number' },
    { field: 'total_spend', label: 'Total spend (£)', type: 'number' },
    { field: 'avg_order_value', label: 'Average order (£)', type: 'number' },
    { field: 'days_since_last_order', label: 'Days since last order', type: 'number' },
    { field: 'days_since_first_order', label: 'Days since first order', type: 'number' },
    { field: 'favourite_item', label: 'Favourite item', type: 'text' },
    { field: 'order_type', label: 'Orders by', type: 'enum', options: [['delivery', 'Delivery'], ['collection', 'Collection'], ['dine_in', 'Dine-in']] },
    { field: 'order_source', label: 'Orders through', type: 'enum', options: [['online', 'Online'], ['pos', 'Till / phone'], ['kiosk', 'Kiosk'], ['table', 'Table QR']] },
    { field: 'tag', label: 'Tag', type: 'text' },
    { field: 'birthday_month', label: 'Birthday month (1-12)', type: 'number' },
    { field: 'consent_sms', label: 'Agreed to SMS', type: 'bool' },
    { field: 'consent_email', label: 'Agreed to email', type: 'bool' },
    { field: 'has_email', label: 'Has an email', type: 'bool' },
];
const OPS = {
    number: [['gte', 'at least'], ['lte', 'at most'], ['eq', 'exactly']],
    enum: [['eq', 'is'], ['neq', 'is not']],
    text: [['contains', 'contains']],
    bool: [['is_true', 'yes'], ['is_false', 'no']],
};

function ConditionRow({ c, onChange, onRemove }) {
    const def = RULE_FIELDS.find(f => f.field === c.field) || RULE_FIELDS[0];
    return (
        <div className="flex flex-wrap gap-2 items-center">
            <Select value={c.field} onValueChange={(field) => { const d = RULE_FIELDS.find(f => f.field === field); onChange({ field, op: OPS[d.type][0][0], value: d.type === 'enum' ? d.options[0][0] : '' }); }}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{RULE_FIELDS.map(f => <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={c.op} onValueChange={(op) => onChange({ ...c, op })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{OPS[def.type].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
            {def.type === 'enum' && (
                <Select value={c.value} onValueChange={(value) => onChange({ ...c, value })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{def.options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
            )}
            {(def.type === 'number' || def.type === 'text') && (
                <Input className="w-32" type={def.type === 'number' ? 'number' : 'text'} value={c.value} onChange={e => onChange({ ...c, value: e.target.value })} />
            )}
            <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
        </div>
    );
}

function Reach({ preview }) {
    if (!preview) return null;
    return (
        <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1.5">
            <div className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" />{preview.count} customers match</div>
            {['sms', 'email'].map(ch => (
                <div key={ch} className="text-gray-700">
                    <span className="font-medium">{ch === 'sms' ? 'SMS' : 'Email'}:</span> {preview.channels[ch].reachable} can be messaged
                    {Object.entries(preview.channels[ch].blocked).length > 0 && (
                        <span className="text-gray-500"> · {Object.entries(preview.channels[ch].blocked).map(([r, n]) => `${n} ${SKIP_REASON[r]?.toLowerCase() || r}`).join(', ')}</span>
                    )}
                </div>
            ))}
            {preview.sample?.length > 0 && (
                <div className="text-xs text-gray-500 pt-1">e.g. {preview.sample.slice(0, 5).map(s => `${s.name} (${s.orders} orders, ${money(s.spend)})`).join(' · ')}</div>
            )}
        </div>
    );
}

function SegmentEditor({ restaurantId, segment, onClose }) {
    const qc = useQueryClient();
    const [name, setName] = useState(segment?.name || '');
    const [match, setMatch] = useState(segment?.rules?.match || 'all');
    const [conditions, setConditions] = useState(segment?.rules?.conditions || [{ field: 'days_since_last_order', op: 'gte', value: '30' }]);
    const [preview, setPreview] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            crm(restaurantId, 'segment_preview', { rules: { match, conditions } }).then(setPreview).catch(() => setPreview(null));
        }, 400);
        return () => clearTimeout(t);
    }, [restaurantId, match, JSON.stringify(conditions)]);

    const save = async () => {
        setSaving(true);
        try {
            await crm(restaurantId, 'segment_save', { segment_id: segment?.id, name, rules: { match, conditions } });
            toast.success('Segment saved');
            qc.invalidateQueries({ queryKey: ['crm-segments', restaurantId] });
            onClose();
        } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{segment ? 'Edit segment' : 'New segment'}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <Input placeholder="Segment name, e.g. Weekend family orders" value={name} onChange={e => setName(e.target.value)} />
                    <div className="flex items-center gap-2 text-sm">
                        Customers who match
                        <Select value={match} onValueChange={setMatch}>
                            <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="all">all</SelectItem><SelectItem value="any">any</SelectItem></SelectContent>
                        </Select>
                        of these:
                    </div>
                    <div className="space-y-2">
                        {conditions.map((c, i) => (
                            <ConditionRow key={i} c={c}
                                onChange={(nc) => setConditions(cs => cs.map((x, j) => j === i ? nc : x))}
                                onRemove={() => setConditions(cs => cs.filter((_, j) => j !== i))} />
                        ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setConditions(cs => [...cs, { field: 'order_count', op: 'gte', value: '2' }])}><Plus className="h-4 w-4 mr-1" />Add condition</Button>
                    <Reach preview={preview} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button className="bg-orange-500 hover:bg-orange-600" disabled={saving || !name.trim()} onClick={save}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save segment</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function CRMSegments({ restaurantId, onStartCampaign }) {
    const qc = useQueryClient();
    const [editing, setEditing] = useState(null);
    const { data, isLoading, error } = useQuery({
        queryKey: ['crm-segments', restaurantId],
        queryFn: () => crm(restaurantId, 'segments_list'),
    });

    const remove = async (s) => {
        if (!window.confirm(`Delete segment "${s.name}"?`)) return;
        try { await crm(restaurantId, 'segment_delete', { segment_id: s.id }); qc.invalidateQueries({ queryKey: ['crm-segments', restaurantId] }); }
        catch (e) { toast.error(e.message); }
    };

    if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
    if (error) return <p className="text-sm text-red-600">{error.message}</p>;

    const Row = ({ s, custom }) => (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
                <div className="font-medium text-gray-900">{s.name}</div>
                <div className="text-xs text-gray-500 truncate">{s.description || `${s.rules?.conditions?.length || 0} conditions`}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold w-10 text-right">{s.count}</span>
                {custom && <Button variant="ghost" size="icon" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>}
                {custom && <Button variant="ghost" size="icon" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-gray-400" /></Button>}
                <Button size="sm" variant="outline" disabled={!s.count} onClick={() => onStartCampaign(s.key, s.name)}><Send className="h-3.5 w-3.5 mr-1" />Campaign</Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Ready-made audiences, plus your own. Counts update as customers order.</p>
                <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" />New segment</Button>
            </div>
            <Card><CardContent className="p-0 divide-y">{data.system.map(s => <Row key={s.key} s={s} />)}</CardContent></Card>
            {data.custom.length > 0 && (
                <>
                    <h3 className="text-sm font-semibold text-gray-700">Your segments</h3>
                    <Card><CardContent className="p-0 divide-y">{data.custom.map(s => <Row key={s.key} s={s} custom />)}</CardContent></Card>
                </>
            )}
            {editing && <SegmentEditor restaurantId={restaurantId} segment={editing.id ? editing : null} onClose={() => setEditing(null)} />}
        </div>
    );
}

export { Reach };
