import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
	'../../../../prisma/migrations/20260911150000_add_boost_automation_foundation/migration.sql',
	import.meta.url
);

describe('Boosting foundation migration safety', () => {
	const migration = readFileSync(migrationUrl, 'utf8');

	it('keeps shadow observations outside the live duplicate-target guard', () => {
		expect(migration).toContain(`"fulfillment_mode" <> 'shadow'`);
	});

	it('guards every non-terminal state in the finalized fulfilment state machine', () => {
		for (const status of [
			'queued',
			'routing',
			'submitting',
			'submission_unknown',
			'submitted',
			'pending',
			'in_progress',
			'partial',
			'refill_requested',
			'needs_link',
			'manual_review'
		]) {
			expect(migration).toContain(`'${status}'`);
		}
	});

	it('does not retain abandoned draft state names in the active guard', () => {
		const guard = migration.slice(migration.indexOf('boost_fulfillments_active_target_guard'));
		expect(guard).not.toMatch(/'claiming'|'started'|'processing'|'refilling'/);
	});
});
