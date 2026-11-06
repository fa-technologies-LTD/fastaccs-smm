import { BOOSTING_ACTION_LABELS, BOOSTING_PLATFORM_LABELS } from './boosting-service-config';
import type { BoostingActionType, BoostingPlatform } from './social-link-validator';
import { boostBenefitLabel } from './boosting-customer-facts';

const unsupportedClaim =
	/less likely to drop|staying power|\b(?:high(?:er)?[ -]?quality|best|more stable|premium quality|refill|protection)\b|non.?drop|guaranteed|real (?:users|people)|instant delivery/i;
const tierLabel =
	/^(?:affordable|value|more stable|stable|premium|recommended|lower price|lowest price|cheaper|best value)$/i;

/** Names read better without "(Twitter)"; the page heading already says it. */
const NAME_PLATFORM_LABELS: Partial<Record<BoostingPlatform, string>> = { x: 'X' };

export function boostServiceBaseName(offer: { platform: string; outcome: string }) {
	const platform =
		NAME_PLATFORM_LABELS[offer.platform as BoostingPlatform] ??
		BOOSTING_PLATFORM_LABELS[offer.platform as BoostingPlatform] ??
		offer.platform;
	return `${platform} ${BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome}`;
}

/** The faint line near every boosting payment step: delivery is never promised to stay. */
export const BOOST_NO_DROP_NOTE =
	'Followers, likes and views can drop after delivery. We don’t promise they won’t.';

// Lines written for the old tier labels. Customers see the option's own line instead.
const STOCK_LINES = new Set([
	'A lower-cost option for straightforward growth.',
	'Delivery timing varies. Track progress from your order.',
	'Your comments, one per line.'
]);
const LINE_REWRITES: Record<string, string> = {
	'Positive Comments': 'Positive comments from a mix of accounts.'
};

const TIER_NAMES: Record<string, string> = {
	value: 'Quick',
	stable: 'Stable',
	premium: 'Most stable'
};
const TIER_LINES: Record<string, string> = {
	value: 'Fast delivery at a lower price. Some may drop over time.',
	stable: 'Less likely to drop. A balance of price and staying power.',
	premium: 'Our steadiest option. Less likely to drop.'
};
const FOLLOWER_TIER_LINES: Record<string, string> = {
	value: 'Quick delivery, best when speed matters.',
	premium: 'Stable followers, less likely to drop.'
};

// The tier the owner set on the offer. A Supplier Lab check on these names is planned for later.
const shownTier = (qualityTier: string) => (TIER_NAMES[qualityTier] ? qualityTier : 'value');

/** The option's name when a service has more than one option. */
export function boostTierName(qualityTier: string) {
	return TIER_NAMES[shownTier(qualityTier)];
}

/** The one line under an option when a service has more than one option. */
export function boostTierLine(qualityTier: string, outcome: string) {
	const tier = shownTier(qualityTier);
	return (outcome === 'followers' ? FOLLOWER_TIER_LINES[tier] : null) ?? TIER_LINES[tier];
}

/** Remove inherited quality promises; never turn a supplier advertisement into a guarantee. */
export function boostCustomerCopy(offer: {
	platform: string;
	outcome: string;
	customerName: string;
	shortPromise: string;
	expectationChips: string[];
	refillDays: number | null;
}) {
	const baseName = boostServiceBaseName(offer);
	const suffix = (
		offer.customerName.toLowerCase().startsWith(baseName.toLowerCase())
			? offer.customerName.slice(baseName.length).replace(/^[\s·—–:-]+/, '')
			: offer.customerName
	).trim();
	const generatedName =
		!suffix ||
		/\b(?:standard option(?: \d+)?|option \d+)$/i.test(offer.customerName) ||
		unsupportedClaim.test(offer.customerName) ||
		tierLabel.test(suffix) ||
		tierLabel.test(offer.customerName) ||
		/\b(?:premium|stable)\b/i.test(offer.customerName) ||
		// Old stored names: "X (Twitter) Likes", "Tiktok Views", or the action alone ("Reach").
		[
			`${BOOSTING_PLATFORM_LABELS[offer.platform as BoostingPlatform] ?? offer.platform} ${BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome}`,
			BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome
		].some((name) => name.toLowerCase() === offer.customerName.trim().toLowerCase());
	return {
		customerName: generatedName ? baseName : offer.customerName,
		// Blank lets the service description show instead.
		shortPromise:
			unsupportedClaim.test(offer.shortPromise) || STOCK_LINES.has(offer.shortPromise.trim())
				? ''
				: (LINE_REWRITES[offer.shortPromise.trim()] ?? offer.shortPromise.trim()),
		expectationChips: offer.expectationChips.filter(
			(chip) =>
				!tierLabel.test(chip) &&
				!unsupportedClaim.test(chip) &&
				!/premium quality|refill|protection/i.test(chip)
		),
		refillDays: offer.refillDays,
		// Say nothing when there is no refill; only real terms get a label.
		optionLabel: boostBenefitLabel(offer)
	};
}

/** Strip context already visible above the choices, including old generated option numbers. */
export function boostCustomerShortName(
	offer: Parameters<typeof boostCustomerCopy>[0]
): string | null {
	const copy = boostCustomerCopy(offer);
	const outcome = BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome;
	const bases = [
		boostServiceBaseName(offer),
		`${BOOSTING_PLATFORM_LABELS[offer.platform as BoostingPlatform] ?? offer.platform} ${outcome}`,
		outcome
	];
	let name = copy.customerName.trim();
	for (const base of bases) {
		if (name.toLowerCase() === base.toLowerCase()) return null;
		if (name.toLowerCase().startsWith(`${base.toLowerCase()} · `)) {
			name = name
				.slice(base.length)
				.replace(/^[\s·—–:-]+/, '')
				.trim();
			break;
		}
	}
	return !name ||
		/^(?:standard option(?: \d+)?|no refill|\d+-day refill(?: option)?|option \d+)$/i.test(name)
		? null
		: name;
}

/**
 * What a customer sees for an option. One option: just the service's name. Several: a name the owner typed,
 * else Quick / Stable / Most stable, and the owner's line, else the tier's line. A blank line lets the
 * service's own description show.
 */
export function boostCustomerOption(
	offer: Parameters<typeof boostCustomerCopy>[0] & { qualityTier: string },
	options: number,
	serviceName: string
) {
	const copy = boostCustomerCopy(offer);
	if (options <= 1) return { name: serviceName, line: copy.shortPromise };
	return {
		name: boostCustomerShortName(offer) ?? boostTierName(offer.qualityTier),
		line: copy.shortPromise || boostTierLine(offer.qualityTier, offer.outcome)
	};
}
