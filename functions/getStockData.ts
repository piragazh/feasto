import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const symbols = (body.symbols || ['AAPL', 'MSFT', 'GOOGL', 'AMZN']).slice(0, 20);
        const symbolList = symbols.join(',');

        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketTime`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        if (!response.ok) {
            // Return mock data if Yahoo Finance is unavailable
            const mockData = symbols.map((sym, i) => {
                const basePrice = [150, 380, 175, 190, 420, 240][i % 6];
                const change = (Math.random() - 0.45) * 8;
                return {
                    symbol: sym,
                    shortName: sym,
                    regularMarketPrice: parseFloat((basePrice + change).toFixed(2)),
                    regularMarketChange: parseFloat(change.toFixed(2)),
                    regularMarketChangePercent: parseFloat(((change / basePrice) * 100).toFixed(2))
                };
            });
            return Response.json({ quotes: mockData, source: 'mock' });
        }

        const data = await response.json();
        const quotes = (data?.quoteResponse?.result || []).map(q => ({
            symbol: q.symbol,
            shortName: q.shortName || q.symbol,
            regularMarketPrice: q.regularMarketPrice,
            regularMarketChange: q.regularMarketChange,
            regularMarketChangePercent: q.regularMarketChangePercent,
            regularMarketTime: q.regularMarketTime
        }));

        // If no results from Yahoo, return mock
        if (quotes.length === 0) {
            const mockData = symbols.map((sym, i) => {
                const basePrice = [150, 380, 175, 190][i % 4];
                const change = (Math.random() - 0.45) * 8;
                return {
                    symbol: sym,
                    shortName: sym,
                    regularMarketPrice: parseFloat((basePrice + change).toFixed(2)),
                    regularMarketChange: parseFloat(change.toFixed(2)),
                    regularMarketChangePercent: parseFloat(((change / basePrice) * 100).toFixed(2))
                };
            });
            return Response.json({ quotes: mockData, source: 'mock' });
        }

        return Response.json({ quotes, source: 'yahoo' });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});