/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			/*
  			 * POS accent palette.
  			 *
  			 * The POS uses `orange-*` utility classes in ~400 places across 40
  			 * components. Rather than rewrite every one, the orange scale is
  			 * redefined here to read from CSS variables whose DEFAULTS are
  			 * Tailwind's original orange values - so anything outside the POS
  			 * (customer site, kiosk, dashboards) is completely unchanged.
  			 *
  			 * Inside the POS root we set --pos-accent-* per the restaurant's
  			 * chosen palette, and every existing orange-* class follows it
  			 * automatically. See src/lib/posThemes.js.
  			 *
  			 * <alpha-value> keeps opacity modifiers (orange-500/20) working.
  			 */
  			orange: {
  				50:  'rgb(var(--pos-accent-50, 255 247 237) / <alpha-value>)',
  				100: 'rgb(var(--pos-accent-100, 255 237 213) / <alpha-value>)',
  				200: 'rgb(var(--pos-accent-200, 254 215 170) / <alpha-value>)',
  				300: 'rgb(var(--pos-accent-300, 253 186 116) / <alpha-value>)',
  				400: 'rgb(var(--pos-accent-400, 251 146 60) / <alpha-value>)',
  				500: 'rgb(var(--pos-accent-500, 249 115 22) / <alpha-value>)',
  				600: 'rgb(var(--pos-accent-600, 234 88 12) / <alpha-value>)',
  				700: 'rgb(var(--pos-accent-700, 194 65 12) / <alpha-value>)',
  				800: 'rgb(var(--pos-accent-800, 154 52 18) / <alpha-value>)',
  				900: 'rgb(var(--pos-accent-900, 124 45 18) / <alpha-value>)',
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}