import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

// ---------------------------------------------------------------------------
// Uploads: only formats every signage browser / TV app can actually play.
// HEIC (iPhone photos) and .mov (iPhone video) look fine on the manager's
// phone but show a black slide on Android TVs, Fire sticks and Chrome.
// ---------------------------------------------------------------------------
export const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';
export const MAX_IMAGE_MB = 20;
export const MAX_VIDEO_MB = 200;

const OK_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const OK_VIDEO = ['video/mp4', 'video/webm'];
const EXT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm' };

/** Returns a plain-English reason the file can't be used, or null if it's fine. */
export function checkMediaFile(file) {
    if (!file) return 'No file selected';
    const name = String(file.name || '');
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const type = String(file.type || '').toLowerCase() || EXT_TYPE[ext] || '';

    if (/hei[cf]/.test(type) || ext === 'heic' || ext === 'heif') {
        return `"${name}" is an iPhone HEIC photo, which TV screens can't show. On the iPhone, set Camera → Formats → Most Compatible, or export it as JPG.`;
    }
    if (type === 'video/quicktime' || ext === 'mov') {
        return `"${name}" is a .mov video, which most TV screens can't play. Export it as MP4 first.`;
    }
    const isImage = OK_IMAGE.includes(type);
    const isVideo = OK_VIDEO.includes(type);
    if (!isImage && !isVideo) {
        return `"${name}" isn't a supported format. Use JPG, PNG, WebP or GIF images, or MP4/WebM video.`;
    }
    const mb = (Number(file.size) || 0) / (1024 * 1024);
    const limit = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (mb > limit) {
        return `"${name}" is ${Math.round(mb)} MB. ${isVideo ? 'Videos' : 'Images'} must be under ${limit} MB so screens can download them quickly.`;
    }
    return null;
}

/** The media_type a PromotionalContent row should get for this file. */
export function mediaTypeForFile(file) {
    const name = String(file?.name || '');
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const type = String(file?.type || '').toLowerCase() || EXT_TYPE[ext] || '';
    return type.startsWith('video/') ? 'video' : type === 'image/gif' ? 'gif' : 'image';
}

// ---------------------------------------------------------------------------
// Number box that saves when you finish typing (blur / Enter), not on every
// keystroke. A keystroke-save box turns "15" into "105": clearing the box
// saves the fallback 10, then typing 5 appends to it.
// ---------------------------------------------------------------------------
export function clampInt(raw, { min = 1, max = 3600, fallback = min } = {}) {
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

export function CommitNumberInput({ value, onCommit, min = 1, max = 3600, fallback, className, ...rest }) {
    const [text, setText] = useState(String(value ?? ''));
    useEffect(() => { setText(String(value ?? '')); }, [value]);

    const commit = () => {
        const next = clampInt(text, { min, max, fallback: fallback ?? value ?? min });
        setText(String(next));
        if (next !== Number(value)) onCommit(next);
    };

    return (
        <Input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
            onClick={(e) => e.stopPropagation()}
            className={className}
            {...rest}
        />
    );
}

// ---------------------------------------------------------------------------
// <input type="datetime-local"> works in the viewer's own clock. Feeding it
// toISOString() shows UTC, so in British Summer Time every saved time looked
// an hour early and re-saving silently shifted it.
// ---------------------------------------------------------------------------
export function toLocalInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInputValue(value) {
    if (!value) return '';
    const d = new Date(value); // a datetime-local string is parsed as local time
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
