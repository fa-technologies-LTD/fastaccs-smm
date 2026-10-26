/**
 * Where announcement and promo pop-ups may appear: browsing pages only. Never on a product page,
 * the cart, checkout, an order, sign-in or admin, so they never cover a buyer mid-purchase.
 * The host also stays quiet while the cart has items, and shows at most one pop-up per visit.
 */
const BROWSING_PAGES = ['/', '/dashboard', '/how-it-works', '/platforms', '/services', '/numbers'];

export function canShowPopupOn(path: string): boolean {
	return BROWSING_PAGES.includes(path) || /^\/blog(?:\/|$)/.test(path);
}
