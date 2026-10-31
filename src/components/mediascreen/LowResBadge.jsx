import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useImageSize, imageFit } from './screenResolution';

/**
 * Small warning on a playlist item whose image is noticeably smaller than the
 * screen it plays on (it will be enlarged and may look soft).
 */
export default function LowResBadge({ item, screen }) {
    const isImage = item && ['image', 'gif'].includes(item.media_type) && !!item.media_url;
    const size = useImageSize(isImage ? item.media_url : null);
    const fit = isImage && size ? imageFit(size, screen) : null;
    if (!fit?.lowRes) return null;

    const { area } = fit;
    const title = `This image is ${size.w}×${size.h}. ${screen?.screen_name || 'This screen'} draws at ${area.w}×${area.h}`
        + `${area.assumed ? ' (assumed Full HD — the screen hasn\'t reported yet)' : ''}, so it is enlarged about ${fit.scale.toFixed(1)}× and may look soft.`
        + ` Upload a larger image (at least ${area.w}×${area.h}) for a sharp picture.`;

    return (
        <span
            title={title}
            aria-label={title}
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 h-5 text-[10px] font-semibold text-amber-700"
        >
            <AlertTriangle className="h-2.5 w-2.5" />
            Low-res {size.w}×{size.h}
        </span>
    );
}
