import { BOOSTING_ACTION_LABELS, BOOSTING_PLATFORM_LABELS } from './boosting-service-config';
import type { BoostingActionType, BoostingPlatform } from './social-link-validator';
import { boostBenefitLabel } from './boosting-customer-facts';

const unsupportedClaim =
	/less likely to drop|staying power|\b(?:high(?:er)?[ -]?quality|best|more stable|premium quality|refill|protection)\b|non.?drop|guaranteed|real (?:users|people)|instant delivery/i;
const tierLabel =
	/^(?:affordable|value|more stable|stable|premium|recommended|lower price|lowest price|cheaper|best value)$/i;

/** Remove inherited quality promises; never turn a supplier advertisement into a guarantee. */
export function boostCustomerCopy(offer: {
	platform: string;
	outcome: string;
	customerName: string;
	shortPromise: string;
	expectationChips: string[];
	refillDays: number | null;
}) {
	const baseName = `${BOOSTING_PLATFORM_LABELS[offer.platform as BoostingPlatform] ?? offer.platform} ${BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome}`;
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
		/\b(?:premium|stable)\b/i.test(offer.customerName);
	return {
		customerName: generatedName ? baseName : offer.customerName,
		shortPromise:
			unsupportedClaim.test(offer.shortPromise) ||
			offer.shortPromise === 'A lower-cost option for straightforward growth.'
				? 'Delivery timing varies. Track progress from your order.'
				: offer.shortPromise,
		expectationChips: offer.expectationChips.filter(
			(chip) =>
				!tierLabel.test(chip) &&
				!unsupportedClaim.test(chip) &&
				!/premium quality|refill|protection/i.test(chip)
		),
		refillDays: offer.refillDays,
		optionLabel: boostBenefitLabel(offer) ?? 'No refill'
	};
}

/** Strip context already visible above the choices, including old generated option numbers. */
export function boostCustomerShortName(
	offer: Parameters<typeof boostCustomerCopy>[0]
): string | null {
	const copy = boostCustomerCopy(offer);
	const outcome = BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome;
	const bases = [
		`${BOOSTING_PLATFORM_LABELS[offer.platform as BoostingPlatform] ?? offer.platform} ${outcome}`,
		...(offer.platform === 'x' ? [`X ${outcome}`] : []),
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

export function boostCustomerOptionName(
	offer: Parameters<typeof boostCustomerCopy>[0],
	_index: number,
	count: number
) {
	const copy = boostCustomerCopy(offer);
	if (count <= 1) return copy.customerName;
	const baseName = `${BOOSTING_PLATFORM_LABELS[offer.platform as BoostingPlatform] ?? offer.platform} ${BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome}`;
	return boostCustomerShortName(offer) ? copy.customerName : `${baseName} · ${copy.optionLabel}`;
}
