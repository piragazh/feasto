import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Weather for media screens and widgets.
 *
 * Accepts every coordinate shape the app sends:
 *   { lat, lng } | { lat, lon } | { latitude, longitude }
 * or a place name: { location: "Tilbury, UK" }
 * Optional: { units: "metric" | "imperial" } (default metric)
 *
 * Returns both field sets used by the UI:
 *   temperature / feels_like / description / humidity  (ScreenDisplay, WeatherWidget)
 *   temp / main                                         (CustomContentWidget)
 */

const toNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
    try {
        createClientFromRequest(req);

        let body = {};
        try { body = await req.json(); } catch { body = {}; }

        const lat = toNum(body.lat ?? body.latitude);
        const lng = toNum(body.lng ?? body.lon ?? body.longitude);
        const location = typeof body.location === 'string' ? body.location.trim().slice(0, 100) : '';
        const units = body.units === 'imperial' ? 'imperial' : 'metric';

        const hasCoords = lat !== null && lng !== null
            && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

        if (!hasCoords && !location) {
            return Response.json({ error: 'Latitude/longitude or location is required' }, { status: 400 });
        }

        const apiKey = Deno.env.get('OPENWEATHERMAP_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'Weather API key not configured' }, { status: 500 });
        }

        const params = new URLSearchParams({ appid: apiKey, units });
        if (hasCoords) {
            params.set('lat', String(lat));
            params.set('lon', String(lng));
        } else {
            params.set('q', location);
        }

        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`);

        if (!response.ok) {
            return Response.json({ error: 'Failed to fetch weather data' }, { status: response.status });
        }

        const data = await response.json();
        const temperature = Math.round(data?.main?.temp);
        const feelsLike = Math.round(data?.main?.feels_like);

        return Response.json({
            temperature,
            temp: temperature,
            feels_like: feelsLike,
            description: data?.weather?.[0]?.description || '',
            main: data?.weather?.[0]?.main || '',
            icon: data?.weather?.[0]?.icon || '',
            humidity: data?.main?.humidity,
            wind_speed: data?.wind?.speed,
            location_name: data?.name || location || '',
            units
        });
    } catch (error) {
        console.error('getWeather error:', error);
        return Response.json({ error: 'Weather service error' }, { status: 500 });
    }
});
