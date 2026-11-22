import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Measured integration usage for the credit inventory page.
//
// Base44 does not expose a per-function credit bill, so this function returns
// only the figures the app genuinely logs: AI replies (AiUsageDay), AI pictures
// (AiGenerationLog) and emails sent (MessageJob). Everything else on that page is
// a call-site estimate taken from the code.
const DAYS = 30;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user?.id) return Response.json({ error: 'Please sign in' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });

    const db = base44.asServiceRole.entities;
    const now = Date.now();
    const sinceDay = new Date(now - DAYS * 86400000).toISOString().slice(0, 10);
    const sinceIso = new Date(now - DAYS * 86400000).toISOString();

    // AI ordering replies — one row per restaurant, channel and UK day.
    const turnRows = (await db.AiUsageDay.aggregate({
      query: { day: { $gte: sinceDay } },
      groupBy: 'channel',
      sum: ['ai_turns', 'sessions'],
    })).rows || [];

    const ai_turns = { web_chat: 0, whatsapp: 0, phone: 0, total: 0 };
    for (const row of turnRows) {
      const turns = Math.round(Number(row.sum_ai_turns) || 0);
      if (row.channel === 'web_chat' || row.channel === 'whatsapp' || row.channel === 'phone') {
        ai_turns[row.channel] = turns;
      }
      ai_turns.total += turns;
    }

    // AI pictures from the Ad Creator.
    const pictureRows = (await db.AiGenerationLog.aggregate({
      query: { week_start: { $gte: sinceIso }, status: 'done' },
      groupBy: 'kind',
      sum: ['count'],
    })).rows || [];
    const pictures = pictureRows.reduce((sum, row) => sum + Math.round(Number(row.sum_count) || 0), 0);

    // Emails that actually left through Base44 (one credit each).
    const emails = await db.MessageJob.count({
      channel: 'email',
      status: { $in: ['sent', 'delivered', 'converted'] },
      sent_at: { $gte: sinceIso },
    });

    // Provider SMS, shown for context only — not Base44 credits.
    const sms = await db.SmsLog.count({ created_date: { $gte: sinceIso } });

    // Which stores drive the AI ordering volume.
    const byRestaurant = (await db.AiUsageDay.aggregate({
      query: { day: { $gte: sinceDay } },
      groupBy: 'restaurant_id',
      sum: ['ai_turns'],
    })).rows || [];

    const top = byRestaurant
      .map((row) => ({ restaurant_id: row.restaurant_id, ai_turns: Math.round(Number(row.sum_ai_turns) || 0) }))
      .filter((row) => row.ai_turns > 0)
      .sort((a, b) => b.ai_turns - a.ai_turns)
      .slice(0, 5);

    if (top.length) {
      const stores = await db.Restaurant.filter({ id: { $in: top.map((r) => r.restaurant_id) } });
      const names = new Map((stores || []).map((r) => [r.id, r.name]));
      for (const row of top) row.restaurant_name = names.get(row.restaurant_id) || 'Unknown store';
    }

    return Response.json({
      measured: {
        days: DAYS,
        since: sinceDay,
        ai_turns,
        pictures,
        emails,
        sms,
        top_restaurants: top,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});