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

export async function slideToPngBlob(node, width, height) {
    if (!node) throw new Error('Nothing to draw');
    const clone = node.cloneNode(true);

    // Pictures must travel inside the SVG. One that can't be read is left out
    // rather than failing the whole picture.
    await Promise.all([...clone.querySelectorAll('img')].map(async (img) => {
        try {
            const res = await fetch(img.getAttribute('src'), { mode: 'cors', cache: 'force-cache' });
            if (!res.ok) throw new Error(String(res.status));
            img.setAttribute('src', await blobToDataUrl(await res.blob()));
            img.removeAttribute('crossorigin');
        } catch {
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
    return blob;
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
