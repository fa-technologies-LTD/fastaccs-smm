import * as hubman from '../hubman';
import * as pvapins from '../pvapins';
import { buildCandidatePool, type Candidate } from './selection';
import { loadCandidateReliability, type ReliabilityStat } from './reliability';
import { serviceByHubId, pvapinsAppsForService, findPvapinsCountry } from './service-map';

/**
 * Build the live, ranked candidate pool for a product (hub-man service id + country) across BOTH
 * providers, with learned reliability stitched in. Fail-soft: a provider that errors simply
 * contributes no candidates — it never blocks the other source. pvapins stock isn't exposed per
 * app, so those candidates are "presumed available" and confirmed at rent time (via failover).
 */
export async function buildLiveCandidatePool(input: {
	hubServiceId: number;
	hubCountryId: number;
	hubCountryCode: string; // ISO2, e.g. "US"
	hubCountryName?: string;
	reliability?: Map<string, ReliabilityStat>;
}): Promise<Candidate[]> {
	const service = serviceByHubId(input.hubServiceId);
	const reliability = input.reliability ?? (await loadCandidateReliability().catch(() => new Map()));

	// hub-man: real per-service stock + cheapest cost for this country.
	let hub: { serviceRef: string; countryRef: string; costCents: number; available: number } | null = null;
	if (hubman.isHubmanConfigured()) {
		try {
			const services = await hubman.getAvailableServices(input.hubCountryId);
			const info = services?.[String(input.hubCountryId)]?.[String(input.hubServiceId)];
			if (info && Number(info.available_numbers_count) > 0) {
				hub = {
					serviceRef: String(input.hubServiceId),
					countryRef: String(input.hubCountryId),
					costCents: Number(info.min_price_cents) || 0,
					available: Number(info.available_numbers_count)
				};
			}
		} catch {
			/* fail-soft: hub-man contributes nothing this run */
		}
	}

	// pvapins: every supplier-variant for this service in the matching country (presumed in stock).
	let pvapinsCands: Array<{ app: string; countryName: string; costCents: number; available: number }> = [];
	if (service && pvapins.isPvapinsConfigured()) {
		try {
			const countries = await pvapins.loadCountries();
			const country = findPvapinsCountry(countries, input.hubCountryCode, input.hubCountryName);
			if (country) {
				const apps = await pvapins.loadApps(country.id);
				pvapinsCands = pvapinsAppsForService(service.pvapinsPrefixes, apps).map((a) => ({
					app: a.full_name,
					countryName: country.full_name,
					costCents: pvapins.usdStringToCents(a.deduct),
					available: 1
				}));
			}
		} catch {
			/* fail-soft: pvapins contributes nothing this run */
		}
	}

	return buildCandidatePool({ hub, pvapins: pvapinsCands, reliability });
}
