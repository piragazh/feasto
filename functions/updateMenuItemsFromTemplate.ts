import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurant_id, template_name, update_category } = await req.json();

        if (!restaurant_id) {
            return Response.json({ error: 'restaurant_id is required' }, { status: 400 });
        }

        // Get restaurant details
        const restaurants = await base44.entities.Restaurant.filter({ id: restaurant_id });
        const restaurant = restaurants[0];
        
        if (!restaurant) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        // Get all menu items for this restaurant
        const menuItems = await base44.entities.MenuItem.filter({ restaurant_id });

        let updatedCount = 0;
        const templates = restaurant.custom_option_templates || [];

        for (const item of menuItems) {
            let needsUpdate = false;
            const updatedCustomizations = [...(item.customization_options || [])];

            // Update each customization option
            for (let i = 0; i < updatedCustomizations.length; i++) {
                const customization = updatedCustomizations[i];

                // Check if this customization should be updated from a template
                if (template_name) {
                    // Find if any of the options match items from this template
                    const template = templates.find(t => t.name === template_name);
                    if (template) {
                        // Check if this customization uses the template (by comparing option labels)
                        const templateLabels = template.options.map(opt => opt.label);
                        const customLabels = (customization.options || []).map(opt => opt.label);
                        const hasMatchingLabels = customLabels.some(label => templateLabels.includes(label));

                        if (hasMatchingLabels || customization.template_source === template_name) {
                            // Update options from template
                            updatedCustomizations[i].options = [...template.options];
                            updatedCustomizations[i].template_source = template_name;
                            needsUpdate = true;
                        }
                    }
                }

                // Update meal customizations if they exist
                if (customization.meal_customizations) {
                    for (let j = 0; j < customization.meal_customizations.length; j++) {
                        const mealCustom = customization.meal_customizations[j];
                        
                        if (template_name) {
                            const template = templates.find(t => t.name === template_name);
                            if (template) {
                                const templateLabels = template.options.map(opt => opt.label);
                                const mealLabels = (mealCustom.options || []).map(opt => opt.label);
                                const hasMatchingLabels = mealLabels.some(label => templateLabels.includes(label));

                                if (hasMatchingLabels || mealCustom.template_source === template_name) {
                                    updatedCustomizations[i].meal_customizations[j].options = [...template.options];
                                    updatedCustomizations[i].meal_customizations[j].template_source = template_name;
                                    needsUpdate = true;
                                }
                            }
                        }
                    }
                }

                // Update from category if specified
                if (update_category) {
                    const categoryItems = menuItems.filter(mi => mi.category === update_category);
                    const categoryLabels = categoryItems.map(mi => mi.name);
                    const customLabels = (customization.options || []).map(opt => opt.label);
                    const hasMatchingLabels = customLabels.some(label => categoryLabels.includes(label));

                    if (hasMatchingLabels || customization.category_source === update_category) {
                        // Update options from current category items
                        updatedCustomizations[i].options = categoryItems.map(mi => ({
                            label: mi.name,
                            price: 0
                        }));
                        updatedCustomizations[i].category_source = update_category;
                        needsUpdate = true;
                    }

                    // Update meal customizations from category
                    if (customization.meal_customizations) {
                        for (let j = 0; j < customization.meal_customizations.length; j++) {
                            const mealCustom = customization.meal_customizations[j];
                            const mealLabels = (mealCustom.options || []).map(opt => opt.label);
                            const hasMatchingLabels = mealLabels.some(label => categoryLabels.includes(label));

                            if (hasMatchingLabels || mealCustom.category_source === update_category) {
                                updatedCustomizations[i].meal_customizations[j].options = categoryItems.map(mi => ({
                                    label: mi.name,
                                    price: 0
                                }));
                                updatedCustomizations[i].meal_customizations[j].category_source = update_category;
                                needsUpdate = true;
                            }
                        }
                    }
                }
            }

            // Update the item if changes were made
            if (needsUpdate) {
                await base44.entities.MenuItem.update(item.id, {
                    customization_options: updatedCustomizations
                });
                updatedCount++;
            }
        }

        return Response.json({
            success: true,
            updated_count: updatedCount,
            total_items: menuItems.length,
            message: `Updated ${updatedCount} menu items`
        });

    } catch (error) {
        console.error('Error updating menu items:', error);
        return Response.json({ 
            error: 'Failed to update menu items',
            details: error.message 
        }, { status: 500 });
    }
});