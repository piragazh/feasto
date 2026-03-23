/**
 * useSEO — sets document.title + meta/OG tags for a page.
 * Call in a useEffect (or directly) at the top of any page component.
 *
 * noindex: true  → tells crawlers not to index the page
 * noindex: false → default (indexable)
 */
import { useEffect } from 'react';

export function useSEO({ title, description, noindex = false, ogImage, ogType = 'website' } = {}) {
    useEffect(() => {
        // ── Title ───────────────────────────────────────────────────────
        const fullTitle = title
            ? `${title} | MealDrop`
            : 'MealDrop - Food Delivery from Your Favourite Restaurants';
        document.title = fullTitle;

        // ── Robots ──────────────────────────────────────────────────────
        let robotsMeta = document.querySelector('meta[name="robots"]');
        if (!robotsMeta) {
            robotsMeta = document.createElement('meta');
            robotsMeta.name = 'robots';
            document.head.appendChild(robotsMeta);
        }
        robotsMeta.content = noindex ? 'noindex, nofollow' : 'index, follow';

        // ── Description ─────────────────────────────────────────────────
        if (description) {
            let metaDesc = document.querySelector('meta[name="description"]');
            if (!metaDesc) {
                metaDesc = document.createElement('meta');
                metaDesc.name = 'description';
                document.head.appendChild(metaDesc);
            }
            metaDesc.content = description;
        }

        // ── Open Graph ──────────────────────────────────────────────────
        const ogTags = [
            { property: 'og:title', content: fullTitle },
            { property: 'og:type', content: ogType },
            { property: 'og:site_name', content: 'MealDrop' },
            { property: 'og:url', content: window.location.href },
            ...(description ? [{ property: 'og:description', content: description }] : []),
            ...(ogImage ? [{ property: 'og:image', content: ogImage }] : []),
        ];

        ogTags.forEach(({ property, content }) => {
            let tag = document.querySelector(`meta[property="${property}"]`);
            if (!tag) {
                tag = document.createElement('meta');
                tag.setAttribute('property', property);
                document.head.appendChild(tag);
            }
            tag.content = content;
        });

        // ── Twitter Card ─────────────────────────────────────────────────
        const twitterTags = [
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: fullTitle },
            ...(description ? [{ name: 'twitter:description', content: description }] : []),
            ...(ogImage ? [{ name: 'twitter:image', content: ogImage }] : []),
        ];

        twitterTags.forEach(({ name, content }) => {
            let tag = document.querySelector(`meta[name="${name}"]`);
            if (!tag) {
                tag = document.createElement('meta');
                tag.name = name;
                document.head.appendChild(tag);
            }
            tag.content = content;
        });

        // Cleanup: restore indexable on unmount so private pages don't bleed
        return () => {
            if (noindex) {
                const rm = document.querySelector('meta[name="robots"]');
                if (rm) rm.content = 'index, follow';
            }
        };
    }, [title, description, noindex, ogImage, ogType]);
}