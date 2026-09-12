import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck, Info, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
    PERMISSION_GROUPS,
    CONFIGURABLE_ROLES,
    ROLE_LABELS,
    DEFAULT_ROLE_PERMISSIONS,
} from '@/lib/posPermissions';

/**
 * Role permission matrix.
 *
 * An owner ticks what each role may do. Anything a role lacks is not hidden
 * away permanently — the POS asks for an authorising staff number and PIN, and
 * records who acted and who approved. That way a waiter can still get a
 * discount applied during a rush without being handed a manager's PIN.
 *
 * Enforcement is server-side from the staff session. These tick boxes decide
 * policy; they are not themselves the control.
 */
export default function POSPermissionSettings({ restaurantId, restaurant }) {
    const [matrix, setMatrix] = useState({});
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        const existing = restaurant?.role_permissions;
        setMatrix(
            existing && Object.keys(existing).length > 0
                ? existing
                : DEFAULT_ROLE_PERMISSIONS,
        );
        setDirty(false);
    }, [restaurant?.role_permissions]);

    const has = (role, key) => Array.isArray(matrix[role]) && matrix[role].includes(key);

    const toggle = (role, key) => {
        setMatrix(prev => {
            const current = Array.isArray(prev[role]) ? prev[role] : [];
            const next = current.includes(key)
                ? current.filter(k => k !== key)
                : [...current, key];
            return { ...prev, [role]: next };
        });
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            await base44.entities.Restaurant.update(restaurantId, { role_permissions: matrix });
            toast.success('Permissions updated');
            setDirty(false);
        } catch (e) {
            toast.error('Could not save permissions: ' + (e?.message || 'unknown error'));
        } finally {
            setSaving(false);
        }
    };

    const resetToDefaults = () => {
        setMatrix(DEFAULT_ROLE_PERMISSIONS);
        setDirty(true);
        toast.info('Reset to defaults — press Save to apply');
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    Staff Permissions
                </CardTitle>
                <CardDescription>
                    Choose what each role can do on the POS
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                        If someone attempts something their role doesn&rsquo;t allow, the POS asks for an
                        authorising <strong>staff number and PIN</strong> from someone who does. The action
                        then goes ahead and both people are recorded &mdash; who did it and who approved it.
                        Nothing is blocked outright, so service never stops.
                    </span>
                </div>

                <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-sm border-separate border-spacing-0">
                        <thead>
                            <tr>
                                <th className="text-left font-semibold text-gray-700 pb-3 pr-3 min-w-[240px]">
                                    Permission
                                </th>
                                {CONFIGURABLE_ROLES.map(role => (
                                    <th key={role} className="pb-3 px-2 text-center font-semibold text-gray-700 whitespace-nowrap">
                                        {ROLE_LABELS[role]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {PERMISSION_GROUPS.map(group => (
                                <React.Fragment key={group.group}>
                                    <tr>
                                        <td
                                            colSpan={CONFIGURABLE_ROLES.length + 1}
                                            className="pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-gray-400"
                                        >
                                            {group.group}
                                        </td>
                                    </tr>
                                    {group.items.map(item => (
                                        <tr key={item.key} className="border-t border-gray-100">
                                            <td className="py-2.5 pr-3 align-top">
                                                <p className="font-medium text-gray-900 leading-tight">{item.label}</p>
                                                <p className="text-xs text-gray-500 leading-tight mt-0.5">{item.desc}</p>
                                            </td>
                                            {CONFIGURABLE_ROLES.map(role => (
                                                <td key={role} className="py-2.5 px-2 text-center align-middle">
                                                    <Checkbox
                                                        checked={has(role, item.key)}
                                                        onCheckedChange={() => toggle(role, item.key)}
                                                        aria-label={`${ROLE_LABELS[role]}: ${item.label}`}
                                                        className="h-5 w-5"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <Button
                        onClick={save}
                        disabled={saving || !dirty}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                        {saving ? 'Saving…' : 'Save Permissions'}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetToDefaults}>
                        <RotateCcw className="h-4 w-4 mr-1.5" />
                        Reset to defaults
                    </Button>
                    {dirty && <span className="text-xs text-amber-600 ml-auto">Unsaved changes</span>}
                </div>
            </CardContent>
        </Card>
    );
}
