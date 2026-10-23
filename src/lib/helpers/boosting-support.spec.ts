import { expect, it } from 'vitest';
import {
	boostReviewNotice,
	getBoostSupportState,
	type BoostSupportEvent
} from './boosting-support';
const event = (id: string, type: string, metadata = {}, at = 1): BoostSupportEvent => ({
	id,
	type,
	metadata,
	description: 'Customer-safe message',
	occurredAt: new Date(at)
});
it('folds a link request and matching reply without exposing internal resolution evidence', () => {
	const request = event('r', 'boosting_support_requested');
	const reply = event(
		'p',
		'boosting_support_replied',
		{ requestId: 'r', link: 'https://instagram.com/example', note: 'internal' },
		2
	);
	expect(getBoostSupportState([reply, request])).toMatchObject({
		state: 'reply_received',
		requestId: 'r',
		reply: { link: 'https://instagram.com/example' }
	});
	const resolved = getBoostSupportState([
		event(
			'x',
			'boosting_support_resolved',
			{ evidence: 'SECRET', previousSupplierStatus: 'Canceled' },
			3
		),
		reply,
		request
	]);
	expect(resolved).toMatchObject({ state: 'resolved', requestId: null, reply: null });
	expect(JSON.stringify(resolved)).not.toContain('SECRET');
	expect(JSON.stringify(resolved)).not.toContain('Canceled');
});
it('ignores stale replies, invalid dates, unrelated notes and unsafe link schemes', () => {
	const events = [
		event('r', 'boosting_support_requested'),
		event('p', 'boosting_support_replied', { requestId: 'old', link: 'https://example.com' }, 2),
		event('m', 'customer_support_update', {}, 3)
	];
	expect(getBoostSupportState(events).state).toBe('awaiting_customer');
	expect(
		getBoostSupportState([
			...events,
			event('p2', 'boosting_support_replied', { requestId: 'r', link: 'javascript:alert(1)' }, 4)
		]).reply
	).toBeNull();
	expect(getBoostSupportState([{ ...events[0], occurredAt: 'invalid' }]).state).toBe('none');
});

it('withdraws a link request without calling the delivery complete or accepting an old reply', () => {
	const state = getBoostSupportState([
		event('request', 'boosting_support_requested', {}, 1),
		event('withdraw', 'boosting_support_withdrawn', {}, 2),
		event(
			'reply',
			'boosting_support_replied',
			{ requestId: 'request', link: 'https://instagram.com/example' },
			3
		)
	]);
	expect(state).toMatchObject({
		state: 'none',
		revision: 'withdraw',
		requestId: null,
		reply: null
	});
});
it('does not describe confirmed cancellation or partial delivery as still running', () => {
	expect(boostReviewNotice('provider_cancelled')).toContain('cancellation');
	expect(boostReviewNotice('provider_partial')).toContain('partial');
	expect(boostReviewNotice('provider_failed')).toContain('failure');
	expect(boostReviewNotice(null)).toContain('elapsed time alone');
});
