import { browser, dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { hasAnalyticsConsent, PRIVACY_CONSENT_CHANGED_EVENT } from '$lib/helpers/privacyConsent';

const GA4_SCRIPT_BASE = 'https://www.googletagmanager.com/gtag/js';
const CHECKOUT_SNAPSHOT_KEY = 'fastaccs_ga4_pending_checkout_v1';
const TRACKED_PURCHASES_KEY = 'fastaccs_ga4_tracked_purchases_v1';

export interface Ga4Item {
	item_id?: string;
	item_name?: string;
	affiliation?: string;
	coupon?: string;
	discount?: number;
	index?: number;
	item_brand?: string;
	item_category?: string;
	item_category2?: string;
	item_category3?: string;
	item_category4?: string;
	item_category5?: string;
	item_list_id?: string;
	item_list_name?: string;
	item_variant?: string;
	location_id?: string;
	price?: number;
	quantity?: number;
}

export type Ga4EventParams = Record<
	string,
	| string
	| number
	| boolean
	| null
	| undefined
	| Ga4Item[]
	| Record<string, string | number | boolean | null | undefined>
>;

export interface Ga4CheckoutSnapshot {
	orderId: string;
	value: number;
	currency: string;
	items: Ga4Item[];
	coupon?: string;
	affiliation?: string;
	createdAt: number;
}

let initialized = false;
let scriptRequested = false;
let consentListenerAttached = false;

function getMeasurementId(): string {
	const measurementId = String(publicEnv.PUBLIC_GA4_MEASUREMENT_ID || '').trim();
	return /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId.toUpperCase() : '';
}

function readCookieValue(name: string): string | null {
	if (!browser) return null;
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

export function getGa4ClientId(): string | null {
	const raw = readCookieValue('_ga');
	if (!raw) return null;

	const match = raw.match(/(?:GA\d+\.\d+\.)?(\d+\.\d+)$/);
	return match ? match[1] : null;
}

function isDebugMode(): boolean {
	return String(publicEnv.PUBLIC_GA4_DEBUG || '').toLowerCase() === 'true';
}

function isProductionTrackingHost(): boolean {
	if (!browser) return false;
	if (dev && !isDebugMode()) return false;

	const hostname = window.location.hostname.toLowerCase();
	if (isDebugMode()) return true;

	return !['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
}

function cleanGa4Item(item: Ga4Item): Ga4Item {
	const cleaned: Ga4Item = {};

	for (const [key, value] of Object.entries(item)) {
		if (value === null || value === undefined) continue;
		if (typeof value === 'string' && value.trim().length === 0) continue;
		(cleaned as Record<string, string | number | boolean>)[key] = value;
	}

	return cleaned;
}

function cleanParams(params: Ga4EventParams): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(params)) {
		if (value === null || value === undefined) continue;
		if (typeof value === 'string' && value.trim().length === 0) continue;

		if (Array.isArray(value)) {
			const items = value.map(cleanGa4Item).filter((item) => Object.keys(item).length > 0);
			if (items.length > 0) cleaned[key] = items;
			continue;
		}

		if (typeof value === 'object') {
			const nested: Record<string, string | number | boolean> = {};
			for (const [nestedKey, nestedValue] of Object.entries(value)) {
				if (nestedValue === null || nestedValue === undefined) continue;
				if (typeof nestedValue === 'string' && nestedValue.trim().length === 0) continue;
				nested[nestedKey] = nestedValue;
			}
			if (Object.keys(nested).length > 0) cleaned[key] = nested;
			continue;
		}

		cleaned[key] = value;
	}

	return cleaned;
}

function ensureGtagStub(): void {
	if (!browser) return;

	window.dataLayer = window.dataLayer || [];
	window.gtag =
		window.gtag ||
		function gtagStub(...args: unknown[]) {
			window.dataLayer?.push(args);
		};
}

function requestGa4Script(measurementId: string): void {
	if (!browser || scriptRequested) return;

	const existingScript = document.querySelector<HTMLScriptElement>(
		'script[data-fa-ga4-loader="true"]'
	);
	if (existingScript) {
		scriptRequested = true;
		return;
	}

	const script = document.createElement('script');
	script.async = true;
	script.src = `${GA4_SCRIPT_BASE}?id=${encodeURIComponent(measurementId)}`;
	script.setAttribute('data-fa-ga4-loader', 'true');
	document.head.appendChild(script);
	scriptRequested = true;
}

function updateConsentState(granted: boolean): void {
	if (!browser || !window.gtag) return;

	window.gtag('consent', 'update', {
		analytics_storage: granted ? 'granted' : 'denied',
		ad_storage: 'denied',
		ad_user_data: 'denied',
		ad_personalization: 'denied'
	});
}

function attachConsentListener(): void {
	if (!browser || consentListenerAttached) return;

	window.addEventListener(PRIVACY_CONSENT_CHANGED_EVENT, () => {
		syncGa4Consent();
	});
	consentListenerAttached = true;
}

export function initializeGa4(): boolean {
	const measurementId = getMeasurementId();
	if (!measurementId || !browser || !isProductionTrackingHost()) return false;

	attachConsentListener();

	if (!hasAnalyticsConsent()) {
		updateConsentState(false);
		return false;
	}

	ensureGtagStub();
	requestGa4Script(measurementId);

	if (!initialized) {
		window.gtag?.('consent', 'default', {
			analytics_storage: 'granted',
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied'
		});
		window.gtag?.('js', new Date());
		window.gtag?.('config', measurementId, {
			send_page_view: false,
			debug_mode: isDebugMode() || undefined
		});
		initialized = true;
	}

	updateConsentState(true);
	return true;
}

export function syncGa4Consent(): boolean {
	if (!browser) return false;
	if (!hasAnalyticsConsent()) {
		updateConsentState(false);
		return false;
	}
	return initializeGa4();
}

export function trackGa4Event(eventName: string, params: Ga4EventParams = {}): boolean {
	if (!eventName.trim() || !initializeGa4()) return false;

	window.gtag?.('event', eventName, cleanParams(params));
	return true;
}

export function trackGa4PageView(
	url: URL,
	pageTitle: string,
	params: Ga4EventParams = {}
): boolean {
	return trackGa4Event('page_view', {
		page_title: pageTitle,
		page_location: url.href,
		page_path: `${url.pathname}${url.search}`,
		site_area: 'smm',
		...params
	});
}

export function trackGa4ViewItem(params: Ga4EventParams): boolean {
	return trackGa4Event('view_item', params);
}

export function trackGa4AddToCart(params: Ga4EventParams): boolean {
	return trackGa4Event('add_to_cart', params);
}

export function trackGa4ViewCart(params: Ga4EventParams): boolean {
	return trackGa4Event('view_cart', params);
}

export function trackGa4BeginCheckout(params: Ga4EventParams): boolean {
	return trackGa4Event('begin_checkout', params);
}

export function trackGa4AddPaymentInfo(params: Ga4EventParams): boolean {
	return trackGa4Event('add_payment_info', params);
}

function readTrackedPurchases(): string[] {
	if (!browser) return [];

	try {
		const parsed = JSON.parse(sessionStorage.getItem(TRACKED_PURCHASES_KEY) || '[]');
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === 'string')
			: [];
	} catch {
		return [];
	}
}

function markPurchaseTracked(transactionId: string): void {
	if (!browser || !transactionId) return;
	const tracked = Array.from(new Set([...readTrackedPurchases(), transactionId])).slice(-25);
	sessionStorage.setItem(TRACKED_PURCHASES_KEY, JSON.stringify(tracked));
}

export function trackGa4Purchase(params: Ga4EventParams & { transaction_id?: string }): boolean {
	const transactionId = String(params.transaction_id || '').trim();
	if (!transactionId || readTrackedPurchases().includes(transactionId)) return false;

	const tracked = trackGa4Event('purchase', params);
	if (tracked) {
		markPurchaseTracked(transactionId);
	}
	return tracked;
}

export function saveGa4CheckoutSnapshot(snapshot: Ga4CheckoutSnapshot): void {
	if (!browser || !snapshot.orderId) return;

	try {
		sessionStorage.setItem(CHECKOUT_SNAPSHOT_KEY, JSON.stringify(snapshot));
	} catch (error) {
		console.warn('[ga4] failed to save checkout snapshot:', error);
	}
}

export function readGa4CheckoutSnapshot(orderId?: string | null): Ga4CheckoutSnapshot | null {
	if (!browser) return null;

	try {
		const parsed = JSON.parse(
			sessionStorage.getItem(CHECKOUT_SNAPSHOT_KEY) || 'null'
		) as Partial<Ga4CheckoutSnapshot> | null;
		if (!parsed || typeof parsed !== 'object') return null;
		if (typeof parsed.orderId !== 'string' || !parsed.orderId.trim()) return null;
		if (orderId && parsed.orderId !== orderId) return null;
		if (!Array.isArray(parsed.items)) return null;

		return {
			orderId: parsed.orderId,
			value: Number(parsed.value || 0),
			currency: String(parsed.currency || 'NGN'),
			items: parsed.items.map(cleanGa4Item),
			coupon: typeof parsed.coupon === 'string' ? parsed.coupon : undefined,
			affiliation: typeof parsed.affiliation === 'string' ? parsed.affiliation : undefined,
			createdAt: Number(parsed.createdAt || Date.now())
		};
	} catch {
		return null;
	}
}

export function clearGa4CheckoutSnapshot(): void {
	if (!browser) return;
	sessionStorage.removeItem(CHECKOUT_SNAPSHOT_KEY);
}
