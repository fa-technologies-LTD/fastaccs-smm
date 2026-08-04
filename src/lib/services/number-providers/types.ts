/**
 * Provider abstraction for the Numbers service. hub-man and pvapins are CO-EQUAL sources —
 * the selection layer picks whichever can serve a given service×country most reliably at the
 * time. Every adapter normalizes its own quirks (units, id-vs-name, response shapes, billing
 * model) to this one interface so the fulfillment/refund code never branches on the vendor.
 */

export type NumberProviderId = 'hubman' | 'pvapins';

/**
 * hub-man debits when you RENT and refunds on cancel; pvapins only charges when a code is
 * RECEIVED (verified live). This drives the no-code refund path: hub-man must cancel+reclaim
 * our cost, pvapins was never charged so there's nothing to reclaim. Customer refund is the
 * same either way.
 */
export type BillingModel = 'pay-on-rent' | 'pay-on-success';

export interface ProviderRentInput {
	/** Canonical (hub-man) ids, kept for logging/analytics regardless of provider. */
	serviceId: number;
	countryId: number;
	serviceName: string;
	countryName: string;
	/** How THIS provider addresses the service/country. hub-man: numeric ids as strings.
	 *  pvapins: the app name ("Whatsapp24") and country name ("USA"). Filled by the catalog. */
	providerServiceRef: string;
	providerCountryRef: string;
	/** Ceiling in USD cents (hub-man honours it server-side; pvapins has no ceiling param). */
	maxPriceCents: number;
	/** Planned cost in USD cents (used when the provider doesn't return a cost on rent). */
	expectedCostCents: number;
}

export interface ProviderRentResult {
	/** Opaque handle to poll/cancel this rental later. hub-man: order_uuid. pvapins: number|country|app. */
	providerRef: string;
	phoneNumber: string;
	/** Best-known cost in USD cents at rent time (finalizes on success for pay-on-success). */
	costCents: number;
	/** Provider-declared expiry, or null when the provider gives none (we fall back to our timeout). */
	expiresAt: Date | null;
}

export type ProviderSmsResult =
	| { status: 'waiting' }
	| { status: 'received'; otp: string; message: string; from?: string }
	| { status: 'expired' } // provider says the activation window closed with no code
	| { status: 'error'; reason: string };

export interface NumberProvider {
	readonly id: NumberProviderId;
	readonly billing: BillingModel;
	isConfigured(): boolean;
	getBalanceCents(): Promise<number>;
	rent(input: ProviderRentInput): Promise<ProviderRentResult>;
	pollSms(providerRef: string): Promise<ProviderSmsResult>;
	cancel(providerRef: string): Promise<boolean>;
}

/**
 * OTP shown to the customer: a provider's parsed code, else extracted from the message.
 * Handles SEPARATED codes ("852-570" — WhatsApp via pvapins, confirmed live) so a delivered
 * code is never mistaken for "no code yet" (which would refund a delivered code — the leak class).
 */
export function resolveOtpFromText(otp: string | null | undefined, message: string | null | undefined): string {
	if (otp && otp.trim()) return otp.trim();
	const t = String(message ?? '');
	const run = t.match(/\d{4,8}/);
	if (run) return run[0];
	const split = t.match(/\d{2,4}[\s\-.]\d{2,4}/);
	if (split) {
		const digits = split[0].replace(/\D/g, '');
		if (digits.length >= 4 && digits.length <= 8) return digits;
	}
	return '';
}
