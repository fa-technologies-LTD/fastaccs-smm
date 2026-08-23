import * as hubman from '../hubman';
import {
	type NumberProvider,
	type ProviderRentInput,
	type ProviderRentResult,
	type ProviderSmsResult,
	resolveOtpFromText
} from './types';

/**
 * hub-man adapter — a thin wrapper over the existing hubman.ts client so its behaviour is
 * unchanged. providerRef is hub-man's order_uuid. Provider history and balance reconciliation
 * confirm that cancelled/no-SMS activations are refunded, so realized cost finalizes on SMS.
 */
export const hubmanProvider: NumberProvider = {
	id: 'hubman',
	billing: 'pay-on-success',

	isConfigured: () => hubman.isHubmanConfigured(),

	getBalanceCents: () => hubman.getBalanceCents(),

	async rent(input: ProviderRentInput): Promise<ProviderRentResult> {
		const res = await hubman.rentActivationNumber({
			countryId: Number(input.providerCountryRef) || input.countryId,
			serviceId: Number(input.providerServiceRef) || input.serviceId,
			maxPriceCents: input.maxPriceCents
		});
		return {
			providerRef: res.order_uuid,
			phoneNumber: String(res.phone_number),
			costCents: Number(res.price_cents) || input.expectedCostCents,
			expiresAt: res.expires_at ? new Date(res.expires_at) : null
		};
	},

	async pollSms(providerRef: string): Promise<ProviderSmsResult> {
		try {
			const sms = await hubman.getSms(providerRef); // null = waiting
			if (!sms) return { status: 'waiting' };
			const message = sms.message ?? '';
			const otp = resolveOtpFromText(sms.otp, message);
			if (otp || (message && message.trim())) {
				return { status: 'received', otp, message, from: sms.sender_name ?? undefined };
			}
			return { status: 'waiting' };
		} catch (error) {
			// hub-man returns 422 once the activation window has closed — a definitive "dead, no
			// code", not a transient failure, so surface it as expired (→ cancel+refund upstream).
			if (error instanceof hubman.HubmanError && error.status === 422) {
				return { status: 'expired' };
			}
			return { status: 'error', reason: error instanceof Error ? error.message : 'poll failed' };
		}
	},

	cancel: (providerRef: string) => hubman.cancelRent(providerRef)
};
