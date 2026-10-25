// Resize and compress an image in the browser before it is uploaded, so a
// multi-megabyte phone photo doesn't slow down the storefront's first paint.

const MAX_INPUT_BYTES = 20 * 1024 * 1024;           // refuse anything bigger than 20 MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'];

export class ImageRejectedError extends Error {}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decode(file) {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            /* fall back to <img> below */
        }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        await img.decode();
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * @param {File} file
 * @param {{ maxWidth?: number, minWidth?: number, quality?: number, output?: 'photo'|'png', label?: string }} [opts]
 *   output 'png' keeps transparency (logos); 'photo' (default) compresses to WebP or JPEG.
 * @returns {Promise<{ file: File, width: number, height: number, originalBytes: number, warning: string|null }>}
 * Throws ImageRejectedError with a user-facing message when the file can't be used.
 */
export async function prepareImage(file, { maxWidth = 1920, minWidth = 1200, quality = 0.82, output = 'photo', label = 'photo' } = {}) {
    if (!file || !ACCEPTED.includes(file.type)) {
        throw new ImageRejectedError('Please choose a JPG, PNG, WebP, GIF or HEIC image.');
    }
    if (file.size > MAX_INPUT_BYTES) {
        throw new ImageRejectedError('That photo is over 20 MB. Please choose a smaller one.');
    }

    let bitmap;
    try {
        bitmap = await decode(file);
    } catch {
        throw new ImageRejectedError("This browser couldn't open that photo. Try saving it as a JPG first.");
    }

    const width = bitmap.width;
    const height = bitmap.height;
    const scale = Math.min(1, maxWidth / width);
    const outW = Math.round(width * scale);
    const outH = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, outW, outH);
    bitmap.close?.();

    let blob;
    if (output === 'png') {
        blob = await canvasToBlob(canvas, 'image/png');
    } else {
        // WebP where supported; browsers that can't encode it fall back to PNG, so use JPEG then.
        blob = await canvasToBlob(canvas, 'image/webp', quality);
        if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }
    if (!blob) throw new ImageRejectedError('Could not process that photo. Please try another.');

    // Keep the original when it was already small and needed no resizing.
    const useOriginal = scale === 1 && file.size <= blob.size && file.type !== 'image/heic' && file.type !== 'image/heif';
    const ext = { 'image/webp': 'webp', 'image/png': 'png' }[blob.type] || 'jpg';
    const base = (file.name || 'hero').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'hero';
    const out = useOriginal ? file : new File([blob], `${base}.${ext}`, { type: blob.type });

    return {
        file: out,
        width: outW,
        height: outH,
        originalBytes: file.size,
        warning: width < minWidth
            ? `This ${label} is only ${width}px wide, so it may look blurry. ${minWidth}px or wider works best.`
            : null,
    };
}

export function formatBytes(n) {
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
