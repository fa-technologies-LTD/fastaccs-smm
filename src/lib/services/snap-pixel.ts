import { browser, dev } from '$app/environment';

/**
 * Snap Pixel REMOVED (owner decision, 10 Oct 2026). It loaded and tracked every visitor without
 * consent, which Nigeria's GAID 2025 does not allow, and Snapchat ads are no longer running.
 *
 * The functions stay as inert no-ops so existing callers (checkout, storefronts) keep compiling
 * without edits; they never load Snap's script or send anything. Callers can be deleted in a
 * later cleanup. `isProductionTrackingHost` is still used by first-party analytics.
 */

export const SNAP_SIGNUP_COOKIE = 'fa_snap_signup';

export type SnapPixelEvent =
	| 'PAGE_VIEW'
	| 'VIEW_CONTENT'
	| 'ADD_CART'
	| 'START_CHECKOUT'
	| 'ADD_BILLING'
	| 'PURCHASE'
	| 'SIGN_UP'
	| 'CUSTOM_EVENT_1';

export type SnapPixelPayload = Record<
	string,
	string | number | boolean | Array<string | number> | null | undefined
>;

export function isProductionTrackingHost(): boolean {
	if (!browser || dev) return false;
	const hostname = window.location.hostname.toLowerCase();
	return !['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
}

export function initializeSnapPixel(): boolean {
	return false;
}

export const trackSnapEvent: (event: SnapPixelEvent, payload?: SnapPixelPayload) => boolean = () =>
	false;

export const trackSnapPurchase: (
	payload: SnapPixelPayload & { transaction_id?: string }
) => boolean = () => false;

/** Clears the leftover signup flag cookie (still set by the Google sign-in callback). */
export function trackPendingSnapSignup(): boolean {
	if (!browser) return false;
	if (document.cookie.split(';').some((part) => part.trim().startsWith(`${SNAP_SIGNUP_COOKIE}=`))) {
		document.cookie = `${SNAP_SIGNUP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
	}
	return false;
}

export const trackSnapPageView: (url: URL) => boolean = () => false;

export const trackSnapConfirmedVisit: (url: URL) => boolean = () => false;
