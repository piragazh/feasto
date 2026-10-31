import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Stock ticker widget feed. Public on purpose: signage screens run without a
// signed-in user. It only proxies public market quotes, with a strict symbol
// whitelist pattern and a cap, and NEVER invents prices — if the feed is down
// it says so and the widget hides itself rather than showing fake numbers.

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;
const CACHE_MS = 60_000;
const cache = new Map(); // key -> { at, payload }

export function cleanSymbols(input) {
    const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
    const out = [];
    for (const raw of list) {
        const s = String(raw || '').trim().toUpperCase();
        if (SYMBOL_RE.test(s) && !out.includes(s)) out.push(s);
        if (out.length >= 10) break;
    }
    return out;
}

Deno.serve(async (req) => {
    try {
        createClientFromRequest(req); // keeps request context consistent; no login required
        const body = await req.json().catch(() => ({}));
        const symbols = cleanSymbols(body.symbols);
        if (!symbols.length) return Response.json({ quotes: [], source: 'none', error: 'No valid symbols' }, { status: 400 });

        const key = symbols.join(',');
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < CACHE_MS) return Response.json(hit.payload);

        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(key)}&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketTime`;
        let quotes = [];
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(8000),
            });
            if (response.ok) {
                const data = await response.json();
                quotes = (data?.quoteResponse?.result || [])
                    .filter(q => typeof q.regularMarketPrice === 'number')
                    .map(q => ({
                        symbol: q.symbol,
                        shortName: q.shortName || q.symbol,
                        regularMarketPrice: q.regularMarketPrice,
                        regularMarketChange: q.regularMarketChange,
                        regularMarketChangePercent: q.regularMarketChangePercent,
                        regularMarketTime: q.regularMarketTime,
                    }));
            }
        } catch { /* feed unreachable */ }

        if (!quotes.length) {
            // Serve the last real prices if we have them, flagged as stale.
            if (hit) return Response.json({ ...hit.payload, stale: true });
            return Response.json({ quotes: [], source: 'unavailable' });
        }
        const payload = { quotes, source: 'yahoo' };
        cache.set(key, { at: Date.now(), payload });
        return Response.json(payload);
    } catch (error) {
        return Response.json({ quotes: [], source: 'unavailable', error: error.message }, { status: 500 });
    }
});
