import type { BoostProviderId } from './types';

/** Catalogue service IDs are not order IDs: SMM Raja also uses s-prefixed codes. */
export function parseBoostServiceId(provider: BoostProviderId, value: unknown): string | null {
	const code = String(value ?? '').trim();
	const pattern = provider === 'smm_raja' ? /^(?:s)?[1-9]\d{0,19}$/ : /^[1-9]\d{0,19}$/;
	return pattern.test(code) ? code : null;
}
