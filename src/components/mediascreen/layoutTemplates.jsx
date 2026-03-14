export const LAYOUT_TEMPLATES = [
    {
        id: 'fullscreen',
        name: 'Full Screen',
        category: 'Simple',
        zones: [{ id: 'main', x: 0, y: 0, width: 100, height: 100, content_type: 'media', label: 'Main Content' }],
        preview: [{ x: 0, y: 0, w: 100, h: 100, color: '#6366f1' }]
    },
    {
        id: 'split_lr',
        name: 'Split Horizontal',
        category: 'Split',
        zones: [
            { id: 'left', x: 0, y: 0, width: 50, height: 100, content_type: 'media', label: 'Left' },
            { id: 'right', x: 50, y: 0, width: 50, height: 100, content_type: 'media', label: 'Right' }
        ],
        preview: [{ x: 0, y: 0, w: 49, h: 100, color: '#6366f1' }, { x: 51, y: 0, w: 49, h: 100, color: '#8b5cf6' }]
    },
    {
        id: 'split_tb',
        name: 'Main + Ticker',
        category: 'Promo',
        zones: [
            { id: 'top', x: 0, y: 0, width: 100, height: 80, content_type: 'media', label: 'Main Display' },
            { id: 'bottom', x: 0, y: 80, width: 100, height: 20, content_type: 'ticker', label: 'Ticker Bar' }
        ],
        preview: [{ x: 0, y: 0, w: 100, h: 79, color: '#6366f1' }, { x: 0, y: 81, w: 100, h: 19, color: '#f59e0b' }]
    },
    {
        id: 'main_sidebar',
        name: 'Main + Info Sidebar',
        category: 'Dashboard',
        zones: [
            { id: 'main', x: 0, y: 0, width: 70, height: 100, content_type: 'media', label: 'Main Display' },
            { id: 'sidebar', x: 70, y: 0, width: 30, height: 100, content_type: 'menu', label: 'Info Sidebar' }
        ],
        preview: [{ x: 0, y: 0, w: 69, h: 100, color: '#6366f1' }, { x: 71, y: 0, w: 29, h: 100, color: '#10b981' }]
    },
    {
        id: 'menu_board',
        name: 'Menu Board',
        category: 'Restaurant',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Header / Branding' },
            { id: 'menu', x: 0, y: 15, width: 100, height: 85, content_type: 'menu', label: 'Menu Items' }
        ],
        preview: [{ x: 0, y: 0, w: 100, h: 14, color: '#f97316' }, { x: 0, y: 16, w: 100, h: 84, color: '#1e293b' }]
    },
    {
        id: 'live_orders',
        name: 'Live Orders',
        category: 'Restaurant',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Restaurant Name' },
            { id: 'orders', x: 0, y: 15, width: 65, height: 85, content_type: 'live_orders', label: 'Order Queue' },
            { id: 'promo', x: 65, y: 15, width: 35, height: 85, content_type: 'media', label: 'Promotions' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 14, color: '#f97316' },
            { x: 0, y: 16, w: 64, h: 84, color: '#0f172a' },
            { x: 66, y: 16, w: 34, h: 84, color: '#6366f1' }
        ]
    },
    {
        id: 'three_col',
        name: 'Three Columns',
        category: 'Split',
        zones: [
            { id: 'col1', x: 0, y: 0, width: 33, height: 100, content_type: 'media', label: 'Column 1' },
            { id: 'col2', x: 33, y: 0, width: 34, height: 100, content_type: 'media', label: 'Column 2' },
            { id: 'col3', x: 67, y: 0, width: 33, height: 100, content_type: 'media', label: 'Column 3' }
        ],
        preview: [
            { x: 0, y: 0, w: 32, h: 100, color: '#6366f1' },
            { x: 34, y: 0, w: 32, h: 100, color: '#8b5cf6' },
            { x: 68, y: 0, w: 32, h: 100, color: '#a78bfa' }
        ]
    },
    {
        id: 'weather_overlay',
        name: 'Weather Overlay',
        category: 'Dashboard',
        zones: [
            { id: 'main', x: 0, y: 0, width: 100, height: 100, content_type: 'media', label: 'Background Media' },
            { id: 'weather', x: 68, y: 2, width: 30, height: 28, content_type: 'weather', label: 'Weather Widget' }
        ],
        preview: [{ x: 0, y: 0, w: 100, h: 100, color: '#0ea5e9' }, { x: 69, y: 3, w: 28, h: 26, color: '#ffffff', opacity: 0.9 }]
    },
    {
        id: 'split_header',
        name: 'Header + Two Zones',
        category: 'Dashboard',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Header' },
            { id: 'left', x: 0, y: 15, width: 50, height: 85, content_type: 'media', label: 'Left Content' },
            { id: 'right', x: 50, y: 15, width: 50, height: 85, content_type: 'menu', label: 'Right Content' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 14, color: '#f97316' },
            { x: 0, y: 16, w: 49, h: 84, color: '#6366f1' },
            { x: 51, y: 16, w: 49, h: 84, color: '#10b981' }
        ]
    },
    {
        id: 'promo_grid',
        name: 'Promo Grid',
        category: 'Promo',
        zones: [
            { id: 'tl', x: 0, y: 0, width: 50, height: 50, content_type: 'media', label: 'Top Left' },
            { id: 'tr', x: 50, y: 0, width: 50, height: 50, content_type: 'media', label: 'Top Right' },
            { id: 'bl', x: 0, y: 50, width: 50, height: 50, content_type: 'media', label: 'Bottom Left' },
            { id: 'br', x: 50, y: 50, width: 50, height: 50, content_type: 'media', label: 'Bottom Right' }
        ],
        preview: [
            { x: 0, y: 0, w: 49, h: 49, color: '#6366f1' },
            { x: 51, y: 0, w: 49, h: 49, color: '#8b5cf6' },
            { x: 0, y: 51, w: 49, h: 49, color: '#a78bfa' },
            { x: 51, y: 51, w: 49, h: 49, color: '#c4b5fd' }
        ]
    },
    {
        id: 'featured_sidebar',
        name: 'Featured + Slim Sidebar',
        category: 'Promo',
        zones: [
            { id: 'main', x: 0, y: 0, width: 80, height: 100, content_type: 'media', label: 'Featured Content' },
            { id: 'side_top', x: 80, y: 0, width: 20, height: 50, content_type: 'weather', label: 'Weather' },
            { id: 'side_bot', x: 80, y: 50, width: 20, height: 50, content_type: 'clock', label: 'Clock' }
        ],
        preview: [
            { x: 0, y: 0, w: 79, h: 100, color: '#6366f1' },
            { x: 81, y: 0, w: 19, h: 49, color: '#0ea5e9' },
            { x: 81, y: 51, w: 19, h: 49, color: '#10b981' }
        ]
    },
    // Portrait
    {
        id: 'portrait_fullscreen',
        name: 'Portrait Full Screen',
        category: 'Portrait',
        portrait: true,
        zones: [{ id: 'main', x: 0, y: 0, width: 100, height: 100, content_type: 'media', label: 'Main Content' }],
        preview: [{ x: 0, y: 0, w: 100, h: 100, color: '#6366f1' }]
    },
    {
        id: 'portrait_menu_full',
        name: 'Portrait Menu Board',
        category: 'Portrait',
        portrait: true,
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Branding' },
            { id: 'menu', x: 0, y: 15, width: 100, height: 85, content_type: 'menu', label: 'Menu Items' }
        ],
        preview: [{ x: 0, y: 0, w: 100, h: 14, color: '#f97316' }, { x: 0, y: 16, w: 100, h: 84, color: '#1e293b' }]
    },
    {
        id: 'portrait_menu_ticker',
        name: 'Portrait Menu + Ticker',
        category: 'Portrait',
        portrait: true,
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 12, content_type: 'branding', label: 'Branding' },
            { id: 'menu', x: 0, y: 12, width: 100, height: 73, content_type: 'menu', label: 'Menu Items' },
            { id: 'ticker', x: 0, y: 85, width: 100, height: 15, content_type: 'ticker', label: 'Promo Ticker' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 11, color: '#f97316' },
            { x: 0, y: 13, w: 100, h: 71, color: '#1e293b' },
            { x: 0, y: 86, w: 100, h: 14, color: '#f59e0b' }
        ]
    },
    {
        id: 'portrait_orders',
        name: 'Portrait Order Queue',
        category: 'Portrait',
        portrait: true,
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 18, content_type: 'branding', label: 'Branding' },
            { id: 'orders', x: 0, y: 18, width: 100, height: 82, content_type: 'live_orders', label: 'Order Queue' }
        ],
        preview: [{ x: 0, y: 0, w: 100, h: 17, color: '#f97316' }, { x: 0, y: 19, w: 100, h: 81, color: '#0f172a' }]
    },
    {
        id: 'portrait_split',
        name: 'Portrait Split',
        category: 'Portrait',
        portrait: true,
        zones: [
            { id: 'top', x: 0, y: 0, width: 100, height: 50, content_type: 'media', label: 'Top Media' },
            { id: 'bottom', x: 0, y: 50, width: 100, height: 50, content_type: 'menu', label: 'Bottom Content' }
        ],
        preview: [{ x: 0, y: 0, w: 100, h: 49, color: '#6366f1' }, { x: 0, y: 51, w: 100, h: 49, color: '#10b981' }]
    },
    {
        id: 'portrait_promo_stack',
        name: 'Portrait Promo Stack',
        category: 'Portrait',
        portrait: true,
        zones: [
            { id: 'top', x: 0, y: 0, width: 100, height: 33, content_type: 'media', label: 'Promo 1' },
            { id: 'mid', x: 0, y: 33, width: 100, height: 34, content_type: 'media', label: 'Promo 2' },
            { id: 'bot', x: 0, y: 67, width: 100, height: 33, content_type: 'media', label: 'Promo 3' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 32, color: '#6366f1' },
            { x: 0, y: 34, w: 100, h: 32, color: '#8b5cf6' },
            { x: 0, y: 68, w: 100, h: 32, color: '#a78bfa' }
        ]
    },
    {
        id: 'portrait_weather_menu',
        name: 'Portrait Widget + Menu',
        category: 'Portrait',
        portrait: true,
        zones: [
            { id: 'weather', x: 0, y: 0, width: 50, height: 20, content_type: 'weather', label: 'Weather' },
            { id: 'clock', x: 50, y: 0, width: 50, height: 20, content_type: 'clock', label: 'Clock' },
            { id: 'menu', x: 0, y: 20, width: 100, height: 80, content_type: 'menu', label: 'Menu Items' }
        ],
        preview: [
            { x: 0, y: 0, w: 49, h: 19, color: '#0ea5e9' },
            { x: 51, y: 0, w: 49, h: 19, color: '#10b981' },
            { x: 0, y: 21, w: 100, h: 79, color: '#1e293b' }
        ]
    },
];