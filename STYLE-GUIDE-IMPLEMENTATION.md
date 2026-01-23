# FastAccs Dark Theme Style Guide Implementation

This document provides quick reference for implementing the dark theme style guide across all components.

## ✅ Completed Updates

### Core Files

- ✅ `src/app.css` - All CSS variables and tokens
- ✅ `src/routes/+layout.svelte` - Dark theme background
- ✅ `src/lib/components/Navigation.svelte` - Dark theme nav bar
- ✅ `src/lib/components/HeroBanner.svelte` - Dark theme hero section
- ✅ `src/lib/components/Footer.svelte` - Dark theme footer

## 🎨 CSS Variables Reference

### Colors

```css
/* Primary Greens */
--fa-green-900: #076237 --fa-green-800: #0d9152 --fa-green-600: #25b570 --fa-green-500 /
	--primary: #05d471 /* Accent Limes */ --fa-lime-700: #cadb2e --fa-lime-400: #eeff4e
	/* Secondary Blues */ --fa-blue-950: #0f162f --fa-blue-800: #2e3192 --fa-blue-500: #696dfa
	--fa-blue-300 / --link: #aaadff /* Backgrounds */ --bg: #07090c --bg-elev-1: #0b0f12
	--bg-elev-2: #0f141b --surface: rgba(255, 255, 255, 0.04) --surface-2: rgba(255, 255, 255, 0.06)
	/* Borders */ --border: rgba(255, 255, 255, 0.1) --border-2: rgba(255, 255, 255, 0.14) /* Text */
	--text: rgba(255, 255, 255, 0.92) --text-muted: rgba(255, 255, 255, 0.68)
	--text-dim: rgba(255, 255, 255, 0.55);
```

### Typography

```css
--font-head: 'DM Sans', system-ui, sans-serif --font-body: 'Open Sans', system-ui, sans-serif;
```

### Shadows

```css
--shadow-1:
	0 8px 24px rgba(0, 0, 0, 0.35) --shadow-2: 0 14px 40px rgba(0, 0, 0, 0.5) --glow-primary: 0 0 0
		1px rgba(5, 212, 113, 0.22),
	0 10px 40px rgba(5, 212, 113, 0.1);
```

### Border Radius

```css
--r-xs: 10px --r-sm: 14px --r-md: 18px --r-lg: 22px;
```

### Spacing (4px increments)

```css
--space-xs: 4px --space-sm: 8px --space-md: 12px --space-lg: 16px --space-xl: 20px --space-2xl: 24px
	--space-3xl: 32px --space-4xl: 40px --space-5xl: 60px;
```

## 🔘 Button Styles

### Primary Button (CTA)

```svelte
<button
	class="rounded-full px-4 py-2 font-medium transition-all hover:scale-105 active:scale-100"
	style="background: var(--btn-primary-gradient); 
	       border: 1px solid rgba(5,212,113,0.40); 
	       box-shadow: var(--glow-primary); 
	       color: #04140C; 
	       font-family: var(--font-body);
	       transition: 180ms ease;"
	onmouseover="this.style.background='var(--btn-primary-gradient-hover)'"
	onmouseout="this.style.background='var(--btn-primary-gradient)'"
>
	Button Text
</button>
```

### Secondary Button

```svelte
<button
	class="rounded-full px-4 py-2 font-medium transition-all hover:scale-105 active:scale-100"
	style="background: var(--btn-secondary-gradient); 
	       border: 1px solid rgba(170,173,255,0.25); 
	       color: var(--text); 
	       font-family: var(--font-body);
	       transition: 180ms ease;"
	onmouseover="this.style.background='var(--btn-secondary-gradient-hover)'"
	onmouseout="this.style.background='var(--btn-secondary-gradient)'"
>
	Button Text
</button>
```

### Ghost Button

```svelte
<button
	class="rounded-full px-4 py-2 font-medium transition-all"
	style="background: transparent; 
	       border: 1px solid transparent; 
	       color: var(--link); 
	       font-family: var(--font-body);
	       transition: 180ms ease;"
	onmouseover="this.style.background='rgba(170,173,255,0.08)'; this.style.borderColor='rgba(170,173,255,0.22)'"
	onmouseout="this.style.background='transparent'; this.style.borderColor='transparent'"
>
	Button Text
</button>
```

## 📝 Form Input Styles

### Default Input

```svelte
<input
	type="text"
	class="w-full px-3 py-2 transition-all"
	style="background: rgba(0,0,0,0.3); 
	       border: 1px solid var(--border); 
	       border-radius: var(--r-xs); 
	       color: var(--text); 
	       font-family: var(--font-body);"
/>
```

### Focus State (use `:focus` pseudo-class)

```css
style="border-color: var(--primary);
       box-shadow: 0 0 0 3px rgba(5,212,113,0.12);
       outline: none;"
```

### Success State

```svelte
<input
	type="text"
	style="background: var(--status-success-bg); 
	       border: 1px solid var(--status-success-border); 
	       color: var(--text);"
/>
```

### Error State

```svelte
<input
	type="text"
	style="background: var(--status-error-bg); 
	       border: 1px solid var(--status-error-border); 
	       color: var(--text);"
/>
<div style="color: var(--status-error); font-size: 13px; margin-top: 6px;">Error message</div>
```

### Disabled State

```svelte
<input
	type="text"
	disabled
	style="background: rgba(255,255,255,0.02); 
	       border: 1px solid rgba(255,255,255,0.06); 
	       color: var(--text-dim); 
	       cursor: not-allowed; 
	       opacity: 0.5;"
/>
```

## 🎴 Card Styles

### Standard Card

```svelte
<div
	class="rounded-lg p-6 transition-all"
	style="background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); 
	       border: 1px solid var(--border); 
	       border-radius: var(--r-md); 
	       box-shadow: var(--shadow-1);
	       transition: 180ms ease;"
	onmouseover="this.style.borderColor='var(--border-2)'; this.style.transform='translateY(-2px)'"
	onmouseout="this.style.borderColor='var(--border)'; this.style.transform='translateY(0)'"
>
	Card Content
</div>
```

### Elevated Card

```svelte
<div
	style="background: var(--bg-elev-1); 
	       border: 1px solid var(--border); 
	       border-radius: var(--r-md); 
	       box-shadow: var(--shadow-2); 
	       padding: var(--space-2xl);"
>
	Content
</div>
```

## 🏷️ Badge Styles

### Success Badge

```svelte
<span
	class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold"
	style="background: var(--status-success-bg); 
	       border: 1px solid var(--status-success-border); 
	       color: var(--primary); 
	       font-family: var(--font-body);"
>
	✓ Success
</span>
```

### Error Badge

```svelte
<span
	class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold"
	style="background: var(--status-error-bg); 
	       border: 1px solid var(--status-error-border); 
	       color: var(--status-error); 
	       font-family: var(--font-body);"
>
	✕ Error
</span>
```

### Warning Badge

```svelte
<span
	class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold"
	style="background: var(--status-warning-bg); 
	       border: 1px solid var(--status-warning-border); 
	       color: var(--fa-lime-700); 
	       font-family: var(--font-body);"
>
	⚠ Warning
</span>
```

### Info Badge

```svelte
<span
	class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold"
	style="background: var(--status-info-bg); 
	       border: 1px solid var(--status-info-border); 
	       color: var(--link); 
	       font-family: var(--font-body);"
>
	ℹ Info
</span>
```

## 🌐 Platform Gradients

### Instagram

```svelte
<div style="background: var(--gradient-instagram);">Instagram Content</div>
```

### Twitter/X

```svelte
<div style="background: var(--gradient-twitter);">Twitter Content</div>
```

### TikTok

```svelte
<div style="background: var(--gradient-tiktok);">TikTok Content</div>
```

### Facebook

```svelte
<div style="background: var(--gradient-facebook);">Facebook Content</div>
```

### Snapchat (solid color)

```svelte
<div style="background: var(--gradient-snapchat); color: #000;">Snapchat Content</div>
```

## 📐 Typography Usage

### Headings

```svelte
<h1 style="font-family: var(--font-head); color: var(--text); letter-spacing: -0.03em;">
	Main Heading
</h1>

<h2 style="font-family: var(--font-head); color: var(--text); letter-spacing: -0.02em;">
	Section Heading
</h2>

<h3 style="font-family: var(--font-head); color: var(--primary);">Accent Heading</h3>
```

### Body Text

```svelte
<p style="font-family: var(--font-body); color: var(--text);">Primary body text</p>

<p style="font-family: var(--font-body); color: var(--text-muted);">Secondary body text</p>

<p style="font-family: var(--font-body); color: var(--text-dim);">Tertiary/dim text</p>
```

### Links

```svelte
<a
	href="/path"
	class="transition-colors"
	style="color: var(--link); font-family: var(--font-body);"
	onmouseover="this.style.color='var(--primary)'"
	onmouseout="this.style.color='var(--link)'"
>
	Link Text
</a>
```

## 🎯 Component Update Checklist

When updating a component, ensure:

- [ ] Background uses `--bg`, `--bg-elev-1`, or `--bg-elev-2`
- [ ] Text uses `--text`, `--text-muted`, or `--text-dim`
- [ ] Headings use `--font-head` (DM Sans)
- [ ] Body text uses `--font-body` (Open Sans)
- [ ] Borders use `--border` or `--border-2`
- [ ] Primary buttons use `--btn-primary-gradient`
- [ ] Secondary buttons use `--btn-secondary-gradient`
- [ ] Links use `--link` color
- [ ] Cards have proper shadows (`--shadow-1` or `--shadow-2`)
- [ ] Border radius uses `--r-xs`, `--r-sm`, `--r-md`, or `--r-lg`
- [ ] Spacing uses 4px increments (or CSS variables)
- [ ] Hover states provide clear visual feedback (180ms transition)
- [ ] Status badges use proper semantic colors
- [ ] Form inputs have proper states (default, focus, error, success)
- [ ] Platform-specific elements use platform gradients

## 📋 Priority Components to Update

### High Priority (User-Facing)

1. `src/routes/+page.svelte` - Home page
2. `src/routes/platforms/+page.svelte` - Platform listing
3. `src/routes/platforms/[platform]/+page.svelte` - Platform detail
4. `src/routes/checkout/+page.svelte` - Checkout page
5. `src/routes/dashboard/+page.svelte` - User dashboard
6. `src/lib/components/MiniCart.svelte` - Shopping cart
7. `src/lib/components/ToastContainer.svelte` - Toast notifications

### Medium Priority (Feature Components)

8. `src/lib/components/FeaturedCategories.svelte`
9. `src/lib/components/SocialProof.svelte`
10. `src/lib/components/UserDashboard.svelte`
11. `src/lib/components/AffiliateTab.svelte`
12. `src/lib/components/WalletTab.svelte`
13. `src/lib/components/OrderTab.svelte`
14. `src/lib/components/ProfileTab.svelte`

### Lower Priority (Admin/Modals)

15. `src/routes/admin/**` - Admin pages
16. `src/lib/components/modals/**` - Modal components
17. `src/routes/auth/**` - Auth pages

## 🚀 Quick Find & Replace Patterns

### Text Colors

- Find: `text-gray-900` → Replace with inline style: `style="color: var(--text);"`
- Find: `text-gray-600` → Replace with inline style: `style="color: var(--text-muted);"`
- Find: `text-gray-400` → Replace with inline style: `style="color: var(--text-dim);"`
- Find: `text-white` → Replace with inline style: `style="color: var(--text);"`

### Background Colors

- Find: `bg-white` → Replace with inline style: `style="background: var(--bg-elev-1);"`
- Find: `bg-gray-50` → Replace with inline style: `style="background: var(--surface);"`
- Find: `bg-gray-100` → Replace with inline style: `style="background: var(--surface-2);"`

### Borders

- Find: `border-gray-200` → Replace with inline style: `style="border-color: var(--border);"`
- Find: `border-gray-300` → Replace with inline style: `style="border-color: var(--border-2);"`

### Hover States

- Old: `hover:text-blue-600`
- New: Add onmouseover/onmouseout handlers or use `:hover` in style block

## 📚 Additional Resources

- Full style guide: `style-guide.html`
- Brand colors reference: See `:root` in `src/app.css`
- Component examples: Open `style-guide.html` in browser

## ⚠️ Important Notes

1. **Font Loading**: Google Fonts (DM Sans & Open Sans) are loaded via CDN in `app.css`
2. **Backwards Compatibility**: Legacy color variables are mapped to new tokens
3. **Transitions**: All interactive elements should have `transition: 180ms ease`
4. **Accessibility**: Ensure contrast ratios meet WCAG AA standards
5. **Mobile**: Dark theme should work well on all screen sizes
6. **Performance**: Use CSS variables instead of hard-coded colors for easy theme switching

## 🎨 Color Psychology

- **Green (#05D471)**: Success, CTAs, growth, money
- **Lime (#CADB2E)**: Highlights, warnings, energy
- **Blue (#AAADFF)**: Links, info, trust, technology
- **Red (#FF5050)**: Errors, alerts, urgency

---

**Last Updated**: January 2026
**Version**: 1.0
**Maintainer**: FastAccs Development Team
