import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { safeDraft, readWithClaude } = await import('./llm');

describe('Claude drafts', () => {
	it('only lets short answers without amounts or links through', () => {
		expect(safeDraft('We sell ready X accounts, delivered instantly to the dashboard.')).toBe(
			'We sell ready X accounts, delivered instantly to the dashboard.'
		);
		expect(safeDraft('We can pay ₦3k')).toBeNull();
		expect(safeDraft('Budget is 3000')).toBeNull();
		expect(safeDraft('See https://smm.fastaccs.com')).toBeNull();
		expect(safeDraft('t.me/fastaccs')).toBeNull();
		expect(safeDraft('x'.repeat(301))).toBeNull();
		expect(safeDraft('   ')).toBeNull();
	});

	it('does nothing without an API key', async () => {
		await expect(
			readWithClaude('hello', { channelTitle: 'x', model: 'claude-haiku-5-5' })
		).resolves.toBeNull();
	});
});
