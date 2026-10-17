import { BOOSTING_ACTION_LABELS, BOOSTING_PLATFORM_LABELS } from './boosting-service-config';
import type { BoostingActionType, BoostingPlatform } from './social-link-validator';

const unsupportedClaim =
	/less likely to drop|staying power|higher.quality delivery|non.?drop|guaranteed|real (?:users|people)|instant delivery/i;
const tierLabel = /^(?:affordable|value|more stable|stable|premium|recommended)$/i;

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
		optionLabel: offer.refillDays ? `${offer.refillDays}-day refill option` : 'Standard option'
	};
}

export function boostCustomerOptionName(
	offer: Parameters<typeof boostCustomerCopy>[0],
	index: number,
	count: number
) {
	const copy = boostCustomerCopy(offer);
	if (count <= 1) return copy.customerName;
	const baseName = `${BOOSTING_PLATFORM_LABELS[offer.platform as BoostingPlatform] ?? offer.platform} ${BOOSTING_ACTION_LABELS[offer.outcome as BoostingActionType] ?? offer.outcome}`;
	return copy.customerName === offer.customerName &&
		offer.customerName !== baseName &&
		!tierLabel.test(offer.customerName)
		? copy.customerName
		: `${copy.customerName} · ${copy.optionLabel}${offer.refillDays ? '' : ` ${index + 1}`}`;
}
