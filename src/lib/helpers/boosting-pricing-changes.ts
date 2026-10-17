import type { BoostPricingRow, BoostPricingSheet } from './boosting-pricing-sheet';

export interface PricingFieldChange {
	label: string;
	before: string;
	after: string;
}

const amountFormat = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
const money = (value: number) =>
	Number.isFinite(value) ? `₦${amountFormat.format(value)}` : 'Enter an amount';
const percent = (value: number) => `${value}%`;
const yesNo = (value: boolean) => (value ? 'On' : 'Off');
const override = (value: number | undefined) => (value == null ? 'Use global rule' : money(value));

/** Review only editable commercial controls; supplier metadata and concurrency tokens aren't edits. */
export function boostingPricingChanges(before: BoostPricingSheet, after: BoostPricingSheet) {
	const rules: PricingFieldChange[] = [];
	function add(target: PricingFieldChange[], label: string, oldValue: string, newValue: string) {
		if (oldValue !== newValue) target.push({ label, before: oldValue, after: newValue });
	}
	const old = before.settings;
	const next = after.settings;
	add(rules, 'Dollar rate', money(old.fx), money(next.fx));
	add(
		rules,
		'Default profit on cost',
		percent(old.defaultMarkup ?? 40),
		percent(next.defaultMarkup ?? 40)
	);
	add(rules, 'Profit target', money(old.profitTargetNgn ?? 0), money(next.profitTargetNgn ?? 0));
	add(
		rules,
		'Minimum retained profit',
		money(old.hardProfitNgn ?? 0),
		money(next.hardProfitNgn ?? 0)
	);
	const multiple = (value: number | undefined) => (value ? `${value}×` : 'Off');
	add(
		rules,
		'Maximum price multiple',
		multiple(old.maxPriceMultiple),
		multiple(next.maxPriceMultiple)
	);
	add(rules, 'Estimated payment fee', percent(old.feePercent), percent(next.feePercent));
	add(rules, 'Fixed fee estimate', money(old.feeFixed), money(next.feeFixed));
	add(rules, 'Include fee estimates', yesNo(old.feeConfirmed), yesNo(next.feeConfirmed));
	const baseline = new Map(before.rows.map((row) => [row.id, row]));
	const offers = after.rows.flatMap((row) => {
		const previous = baseline.get(row.id);
		if (!previous) return [];
		const changes: PricingFieldChange[] = [];
		add(
			changes,
			'Price',
			`${money(previous.sale)} per ${previous.units.toLocaleString('en-NG')}`,
			`${money(row.sale)} per ${row.units.toLocaleString('en-NG')}`
		);
		const lockLabel = (r: BoostPricingRow) =>
			r.priceMode === 'manual' ? 'Locked' : 'Follows pricing rules';
		add(changes, 'Price lock', lockLabel(previous), lockLabel(row));
		add(changes, 'Live', yesNo(previous.selected), yesNo(row.selected));
		const quantity = (value: number) => value.toLocaleString('en-NG');
		add(
			changes,
			'Customer minimum',
			quantity(previous.startingQuantity),
			quantity(row.startingQuantity)
		);
		add(changes, 'Quantity increment', quantity(previous.increment), quantity(row.increment));
		const maximum = (value: number | null | undefined) =>
			value == null ? 'Use supplier limit' : quantity(value);
		add(
			changes,
			'Customer maximum',
			maximum(previous.maximumQuantity),
			maximum(row.maximumQuantity)
		);
		add(
			changes,
			'Option name',
			previous.option || 'Use service name',
			row.option || 'Use service name'
		);
		add(
			changes,
			'Customer description',
			previous.shortPromise || 'None',
			row.shortPromise || 'None'
		);
		add(
			changes,
			'Use default profit percentage',
			yesNo(previous.useDefaultMarkup ?? false),
			yesNo(row.useDefaultMarkup ?? false)
		);
		add(changes, 'Profit on cost', percent(previous.targetMarkup), percent(row.targetMarkup));
		add(
			changes,
			'Profit target override',
			override(previous.profitTargetNgn),
			override(row.profitTargetNgn)
		);
		add(
			changes,
			'Minimum retained profit override',
			override(previous.hardProfitNgn),
			override(row.hardProfitNgn)
		);
		return changes.length
			? [
					{
						id: row.id,
						title: row.title,
						option: row.option,
						changes,
						goingLive: row.selected && !previous.selected,
						goingOffline: !row.selected && previous.selected
					}
				]
			: [];
	});
	return {
		rules,
		offers,
		goingLive: offers.filter((offer) => offer.goingLive).length,
		goingOffline: offers.filter((offer) => offer.goingOffline).length,
		count: rules.length + offers.reduce((sum, offer) => sum + offer.changes.length, 0)
	};
}
