import * as pvapins from '../pvapins';
import {
	type NumberProvider,
	type ProviderRentInput,
	type ProviderRentResult,
	type ProviderSmsResult
} from './types';

// pvapins has no server-side handle for a rental — polling needs number+country+app — so we
// pack them into the providerRef. Names from pvapins ("USA", "Whatsapp24") never contain "|".
const SEP = '|';
export function encodePvapinsRef(number: string, country: string, app: string): string {
	return [number, country, app].join(SEP);
}
export function decodePvapinsRef(ref: string): { number: string; country: string; app: string } {
	const [number = '', country = '', app = ''] = ref.split(SEP);
	return { number, country, app };
}

/**
 * pvapins adapter. providerRef packs number|country|app. Billing is pay-on-success: renting
 * never debits, so the no-code path just refunds the customer (nothing to reclaim from pvapins).
 * The provider gives no expiry on rent, so upstream falls back to our activation timeout.
 */
export const pvapinsProvider: NumberProvider = {
	id: 'pvapins',
	billing: 'pay-on-success',

	isConfigured: () => pvapins.isPvapinsConfigured(),

	getBalanceCents: () => pvapins.getBalanceCents(),

	async rent(input: ProviderRentInput): Promise<ProviderRentResult> {
		const app = input.providerServiceRef;
		const country = input.providerCountryRef;
		const number = await pvapins.rentNumber({ country, app });
		return {
			providerRef: encodePvapinsRef(number, country, app),
			phoneNumber: number,
			costCents: input.expectedCostCents, // finalizes on success (pay-on-success)
			expiresAt: null
		};
	},

	async pollSms(providerRef: string): Promise<ProviderSmsResult> {
		const { number, country, app } = decodePvapinsRef(providerRef);
		const r = await pvapins.getSms({ number, country, app });
		// PvapinsSmsResult maps 1:1 onto ProviderSmsResult (pvapins never reports its own expiry —
		// the number just keeps returning "waiting" until our timeout closes it).
		return r;
	},

	async cancel(providerRef: string): Promise<boolean> {
		const { number, country, app } = decodePvapinsRef(providerRef);
		return pvapins.rejectNumber({ number, country, app });
	}
};
