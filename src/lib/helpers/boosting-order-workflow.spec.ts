import { expect, it } from 'vitest';
import { boostOrderWorkflow } from './boosting-order-workflow';
it('does not offer completion or recovery while waiting for a link', () => {
	const flow = boostOrderWorkflow({ support: { state: 'awaiting_customer' }, held: true });
	expect(flow).toMatchObject({
		state: 'waiting_link',
		canConfirmDelivery: false,
		canConfirmFailure: false,
		canWithdrawLink: true,
		canRequestLink: false
	});
});
it('does not offer completion or link changes during active delivery', () => {
	const flow = boostOrderWorkflow({
		support: { state: 'none' },
		held: false,
		status: 'in_progress'
	});
	expect(flow.canConfirmDelivery).toBe(false);
	expect(flow.canRequestLink).toBe(false);
});
it('allows manual completion of a held delivery without a preceding refund', () =>
	expect(boostOrderWorkflow({ support: { state: 'none' }, held: true }).canConfirmDelivery).toBe(
		true
	));
it('keeps refunded and completed deliveries terminal', () => {
	expect(
		boostOrderWorkflow({ support: { state: 'none' }, held: true, refunded: true }).canResolve
	).toBe(false);
	expect(
		boostOrderWorkflow({ support: { state: 'resolved' }, held: false, status: 'completed' })
			.canConfirmFailure
	).toBe(false);
});

it('recognizes a refunded item even when no separate refund flag is passed', () => {
	expect(
		boostOrderWorkflow({ support: { state: 'none' }, held: true, status: 'refunded' })
	).toMatchObject({
		state: 'refunded',
		canResolve: false,
		canConfirmDelivery: false,
		canConfirmFailure: false,
		canRequestLink: false
	});
});

it('keeps a resolved review closed when the caller has no item status', () => {
	expect(boostOrderWorkflow({ support: { state: 'resolved' }, held: false })).toMatchObject({
		state: 'completed',
		canResolve: false,
		canConfirmFailure: false
	});
});

it('does not hide an unresolved delivery behind a completed order label', () => {
	expect(
		boostOrderWorkflow({ support: { state: 'none' }, held: true, status: 'completed' })
	).toMatchObject({ state: 'needs_review', canResolve: true, canConfirmDelivery: true });
});
