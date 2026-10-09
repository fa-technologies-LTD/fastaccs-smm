import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNumbersStorefront } from '$lib/services/phone-catalog';
import {
	countryDisplayName,
	findNumbersPage,
	hasSearchPage,
	numbersPagePath
} from '$lib/helpers/numbers-slugs';
import { formatPrice } from '$lib/helpers/utils';
import type { SeoFaqItem } from '$lib/helpers/platform-seo';

// Same wording as the /numbers FAQ and Support page: no new promises.
function buildNumbersFaq(serviceName: string, country: string): SeoFaqItem[] {
	return [
		{
			question: `What do I get with a ${country} number for ${serviceName}?`,
			answer:
				'One phone number that receives a single verification code, once. When the code arrives (or the short window passes) the order is complete. Grab a fresh number anytime you need another.'
		},
		{
			question: 'What if no code arrives?',
			answer:
				"You're refunded automatically to your store credit. No code, no charge, so it's safe to try."
		},
		{
			question: `Will ${serviceName} keep my account long-term?`,
			answer:
				'These are shared, disposable numbers, ideal for receiving a one-time code, not for anchoring an account you plan to keep. Because the SIM has been used before, some platforms may later restrict an account registered on it. For a permanent account, register with a SIM you personally own.'
		},
		{
			question: 'Can I reuse the number?',
			answer:
				'No. One code per number by design; buy another whenever you need a fresh verification.'
		},
		{
			question: 'How do I pay?',
			answer:
				'In naira, securely via Monnify. Card, bank transfer and USSD are available depending on current Monnify availability.'
		}
	];
}

export const load: PageServerLoad = async ({ params, url }) => {
	let services: Awaited<ReturnType<typeof getNumbersStorefront>>;
	try {
		services = await getNumbersStorefront();
	} catch (cause) {
		console.error(
			'[numbers.page] catalog load failed:',
			cause instanceof Error ? cause.message : 'Unknown error'
		);
		throw error(503, 'Verification numbers are temporarily unavailable.');
	}

	const match = findNumbersPage(services, params.service, params.country);
	if (!match) throw error(404, 'Verification number not found');

	const { service, tier } = match;
	const canonicalPath = numbersPagePath(service.serviceName, tier.countryName);
	if (canonicalPath && canonicalPath !== url.pathname) {
		throw redirect(301, `${canonicalPath}${url.search}`);
	}

	const country = countryDisplayName(tier.countryName);
	const price = tier.priceNgn > 0 ? formatPrice(tier.priceNgn) : '';

	const otherCountries = service.tiers
		.filter((item) => item.tierId !== tier.tierId)
		.map((item) => ({
			label: countryDisplayName(item.countryName),
			countryCode: item.countryCode,
			priceNgn: item.priceNgn,
			available: item.available,
			path: numbersPagePath(service.serviceName, item.countryName)
		}))
		.filter((item): item is typeof item & { path: string } => Boolean(item.path));

	const otherApps = services
		.filter((item) => item.serviceId !== service.serviceId && hasSearchPage(item.serviceName))
		.flatMap((item) => {
			const sameCountry = item.tiers.find(
				(candidate) => candidate.countryName === tier.countryName
			);
			const path = sameCountry ? numbersPagePath(item.serviceName, sameCountry.countryName) : null;
			return sameCountry && path
				? [{ label: item.serviceName, priceNgn: sameCountry.priceNgn, path }]
				: [];
		})
		.slice(0, 10);

	return {
		service: { serviceId: service.serviceId, serviceName: service.serviceName },
		tier,
		country,
		otherCountries,
		otherApps,
		faq: buildNumbersFaq(service.serviceName, country),
		seo: {
			title: `${country} Number for ${service.serviceName} Verification${price ? ` — ${price}` : ''} | FastAccs`,
			description: `Get a ${country} phone number to receive your ${service.serviceName} verification code${price ? ` for ${price}` : ''}. No code, no charge: refunded automatically to your store credit.`,
			type: 'website'
		}
	};
};
