import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { action, restaurant_id, backup_id, label } = body;

        if (action === 'create') {
            // Fetch all data
            const [restaurants, menuItems, promotions, coupons, mealDeals] = await Promise.all([
                restaurant_id
                    ? base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id })
                    : base44.asServiceRole.entities.Restaurant.list(),
                restaurant_id
                    ? base44.asServiceRole.entities.MenuItem.filter({ restaurant_id })
                    : base44.asServiceRole.entities.MenuItem.list(),
                restaurant_id
                    ? base44.asServiceRole.entities.Promotion.filter({ restaurant_id })
                    : base44.asServiceRole.entities.Promotion.list(),
                restaurant_id
                    ? base44.asServiceRole.entities.Coupon.filter({ restaurant_id })
                    : base44.asServiceRole.entities.Coupon.list(),
                restaurant_id
                    ? base44.asServiceRole.entities.MealDeal.filter({ restaurant_id })
                    : base44.asServiceRole.entities.MealDeal.list(),
            ]);

            const snapshot = { restaurants, menuItems, promotions, coupons, mealDeals };
            const item_counts = {
                restaurants: restaurants.length,
                menuItems: menuItems.length,
                promotions: promotions.length,
                coupons: coupons.length,
                mealDeals: mealDeals.length,
            };

            const restaurantName = restaurant_id
                ? (restaurants[0]?.name || restaurant_id)
                : 'All Restaurants';

            const backup = await base44.asServiceRole.entities.RestaurantBackup.create({
                label: label || `Backup ${new Date().toLocaleString('en-GB')}`,
                created_by: user.email,
                restaurant_id: restaurant_id || '',
                restaurant_name: restaurantName,
                snapshot,
                item_counts,
            });

            return Response.json({ success: true, backup_id: backup.id, item_counts });
        }

        if (action === 'restore') {
            if (!backup_id) {
                return Response.json({ error: 'backup_id is required' }, { status: 400 });
            }

            const backups = await base44.asServiceRole.entities.RestaurantBackup.filter({ id: backup_id });
            const backup = backups[0];

            if (!backup) {
                return Response.json({ error: 'Backup not found' }, { status: 404 });
            }

            const { restaurants, menuItems, promotions, coupons, mealDeals } = backup.snapshot;

            let restored = { restaurants: 0, menuItems: 0, promotions: 0, coupons: 0, mealDeals: 0 };

            // Restore each entity by updating if exists, skip if not (we don't delete extra records)
            for (const r of (restaurants || [])) {
                const { id, created_date, updated_date, ...data } = r;
                try { await base44.asServiceRole.entities.Restaurant.update(id, data); restored.restaurants++; } catch (_) {}
            }
            for (const m of (menuItems || [])) {
                const { id, created_date, updated_date, ...data } = m;
                try { await base44.asServiceRole.entities.MenuItem.update(id, data); restored.menuItems++; } catch (_) {}
            }
            for (const p of (promotions || [])) {
                const { id, created_date, updated_date, ...data } = p;
                try { await base44.asServiceRole.entities.Promotion.update(id, data); restored.promotions++; } catch (_) {}
            }
            for (const c of (coupons || [])) {
                const { id, created_date, updated_date, ...data } = c;
                try { await base44.asServiceRole.entities.Coupon.update(id, data); restored.coupons++; } catch (_) {}
            }
            for (const md of (mealDeals || [])) {
                const { id, created_date, updated_date, ...data } = md;
                try { await base44.asServiceRole.entities.MealDeal.update(id, data); restored.mealDeals++; } catch (_) {}
            }

            return Response.json({ success: true, restored });
        }

        if (action === 'delete') {
            if (!backup_id) return Response.json({ error: 'backup_id required' }, { status: 400 });
            await base44.asServiceRole.entities.RestaurantBackup.delete(backup_id);
            return Response.json({ success: true });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});