/**
 * Turn a drawn offer slide into a PNG picture (for the Media Library,
 * WhatsApp, Facebook or printing).
 *
 * The slide uses inline styles only, so the browser can re-draw an exact copy
 * of it inside an SVG and paint that onto a canvas — same engine, same result.
 */

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
});

const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not draw the picture'));
    img.src = src;
});

/**
 * Read a picture as a data: URL so it can travel inside the SVG.
 *
 * Always a fresh download: our file links redirect, and the redirect only
 * carries the "may be read" header when the browser asks for it. The preview
 * has usually already loaded the picture the ordinary way, so the copy the
 * browser has saved would be refused. A second attempt with a one-off
 * address gets round any cache in between.
 */
async function readAsDataUrl(src) {
    if (!src || src.startsWith('data:')) return src;
    const attempts = [
        () => fetch(src, { mode: 'cors', cache: 'no-store', credentials: 'omit' }),
        () => fetch(`${src}${src.includes('?') ? '&' : '?'}snap=${Date.now()}`, { mode: 'cors', cache: 'no-store', credentials: 'omit' }),
    ];
    let lastError;
    for (const attempt of attempts) {
        try {
            const res = await attempt();
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            if (!blob.size || !/^image\//.test(blob.type || 'image/')) throw new Error('not a picture');
            return await blobToDataUrl(blob);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error('picture could not be read');
}

/**
 * Draw the slide to a PNG. Resolves to { blob, missing } — `missing` is how
 * many pictures could not be included, so the caller can say so instead of
 * quietly saving a picture without them.
 */
export async function slideToPngResult(node, width, height) {
    if (!node) throw new Error('Nothing to draw');
    const clone = node.cloneNode(true);

    let missing = 0;
    await Promise.all([...clone.querySelectorAll('img')].map(async (img) => {
        try {
            img.setAttribute('src', await readAsDataUrl(img.getAttribute('src')));
            img.removeAttribute('crossorigin');
        } catch (e) {
            console.warn('[offer picture] left out:', img.getAttribute('src'), e);
            missing += 1;
            img.remove();
        }
    }));

    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const xml = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${xml}</foreignObject></svg>`;
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    if (img.decode) { try { await img.decode(); } catch { /* drawn anyway */ } }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('This browser could not save the picture');
    return { blob, missing };
}

export async function slideToPngBlob(node, width, height) {
    return (await slideToPngResult(node, width, height)).blob;
}

export function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
