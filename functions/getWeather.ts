import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { lat, lng } = await req.json();

        if (!lat || !lng) {
            return Response.json({ error: 'Latitude and longitude are required' }, { status: 400 });
        }

        const apiKey = Deno.env.get('OPENWEATHERMAP_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'Weather API key not configured' }, { status: 500 });
        }

        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`
        );

        if (!response.ok) {
            return Response.json({ error: 'Failed to fetch weather data' }, { status: response.status });
        }

        const data = await response.json();

        return Response.json({
            temperature: Math.round(data.main.temp),
            feels_like: Math.round(data.main.feels_like),
            description: data.weather[0].description,
            icon: data.weather[0].icon,
            humidity: data.main.humidity,
            wind_speed: data.wind.speed
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});