import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	protectedOfferReasons,
	protectedSupplierServices,
	previouslyDispatchedServices,
	supplierTestBudget,
	assertHistoricalTestReadOnly
} from './boosting-test-policy.mjs';

const route = {
	providerService: { provider: 'bulk_follows', serviceId: '15258' },
	equivalenceApproved: false
};
const draft = { status: 'hidden', routingPolicy: 'automatic', priceLocked: false, routes: [route] };
test('only untouched hidden automatic drafts enter the test proposal queue', () => {
	assert.deepEqual(protectedOfferReasons(draft), []);
	for (const changes of [
		{ status: 'reviewed' },
		{ status: 'live' },
		{ status: 'pilot' },
		{ routingPolicy: 'locked' },
		{ lockedRouteId: 'id' },
		{ preferredRouteId: 'id' },
		{ routes: [{ ...route, equivalenceApproved: true }] },
		{ routes: [{ ...route, reviewedAt: new Date() }] },
		{ routes: [{ ...route, reviewedByUserId: 'owner' }] }
	])
		assert.ok(protectedOfferReasons({ ...draft, ...changes }).length);
	assert.deepEqual(protectedOfferReasons({ ...draft, priceLocked: true }), []);
});
test('a service manually reviewed elsewhere is protected across hidden offers too', () => {
	assert.deepEqual(
		[...protectedSupplierServices([draft, { ...draft, status: 'reviewed', priceLocked: true }])],
		['bulk_follows:15258']
	);
	assert.equal(protectedSupplierServices([draft]).size, 0);
});
test('previously dispatched tests are observed or reconciled, not purchased again', () => {
	const tested = previouslyDispatchedServices([
		{
			orders: [
				{
					provider: 'smm_raja',
					serviceId: 's4138',
					dispatchStartedAt: 'started',
					certainty: 'submission_unknown'
				},
				{ provider: 'bulk_follows', serviceId: '14918', supplierOrderId: '123' },
				{ provider: 'bulk_follows', serviceId: 'new_quote_only' }
			]
		}
	]);
	assert.deepEqual([...tested], ['smm_raja:s4138', 'bulk_follows:14918']);
	assert.throws(() => previouslyDispatchedServices([{}]));
});
test('all journals count, including unknown, cancelled, unsubmitted and comparison requests', () => {
	const budget = supplierTestBudget(
		[
			{ orders: [{ costUsd: 0.01, certainty: 'submission_unknown' }] },
			{ orders: [{ costUsd: 0.02, latestStatus: { status: 'Cancelled', charge: 0 } }] },
			{ orders: [{ costUsd: 0.03 }] },
			{ orders: [{ costUsd: 0.004195 }] }
		],
		[0.1]
	);
	assert.equal(budget.reservedUsd, 0.064195);
	assert.equal(budget.combinedUsd, 0.164195);
	assert.equal(budget.approvalRequired, true);
});
test('total must be strictly below $5, including the next quoted batch', () => {
	assert.equal(supplierTestBudget([{ orders: [{ costUsd: 4 }] }], [1]).withinHardCap, false);
	assert.equal(supplierTestBudget([{ orders: [{ costUsd: 4 }] }], [0.999999]).withinHardCap, true);
});
test('invalid costs or missing journal data fail closed', () => {
	for (const costUsd of [NaN, Infinity, null, undefined, '0.01', -1, 0])
		assert.throws(() => supplierTestBudget([{ orders: [{ costUsd }] }]));
	assert.throws(() => supplierTestBudget([{}]));
});
test('small quotes reserve upwards without silently rounding down the budget', () => {
	assert.equal(supplierTestBudget([], [0.0000000001]).proposedUsd, 0.000000001);
});
test('old authorisations cannot reopen paid runners; status reads remain available', () => {
	assert.throws(() => assertHistoricalTestReadOnly('--submit'));
	assert.throws(() => assertHistoricalTestReadOnly('--continue-bulk'));
	assert.doesNotThrow(() => assertHistoricalTestReadOnly('--status'));
	assert.doesNotThrow(() => assertHistoricalTestReadOnly('--batch-status'));
});
