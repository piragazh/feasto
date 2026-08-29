import React from 'react';

/**
 * Themed confirmation dialog for the POS.
 *
 * Use this instead of window.confirm(). Native dialogs are a poor fit for a
 * touch terminal: they render at OS scale with small hit targets, ignore the
 * POS light/dark theme, and - critically - some kiosk and fullscreen browser
 * configurations suppress them entirely, in which case confirm() returns false
 * and the action silently never happens with no feedback to staff.
 *
 * Buttons are 48px tall to stay above the touch-target minimum.
 */
export default function POSConfirmDialog({
    open = true,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = true,
    onConfirm,
    onCancel,
    isDark = true,
}) {
    if (!open) return null;

    const panel = isDark ? 'bg-[#151720] border-white/[0.08]' : 'bg-white border-gray-200';
    const titleCls = isDark ? 'text-white' : 'text-gray-900';
    const msgCls = isDark ? 'text-gray-400' : 'text-gray-600';
    const cancelCls = isDark
        ? 'border-white/[0.1] text-gray-300 hover:bg-white/5'
        : 'border-gray-200 text-gray-600 hover:bg-gray-50';
    const confirmCls = destructive
        ? 'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white'
        : 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white';

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
            onClick={onCancel}
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`${panel} border rounded-2xl w-full max-w-sm p-5 shadow-2xl`}
                onClick={e => e.stopPropagation()}
            >
                {title && <h3 className={`${titleCls} font-bold text-base mb-1`}>{title}</h3>}
                <p className={`${msgCls} text-sm leading-snug mb-5`}>{message}</p>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`flex-1 h-12 rounded-xl text-sm font-semibold border transition-colors ${cancelCls}`}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`flex-1 h-12 rounded-xl text-sm font-semibold transition-colors ${confirmCls}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
