import { describe, expect, it } from 'vitest';
import { getEmailReviewCatalog } from './email-review-catalog.server';

describe('email review catalogue', () => {
	it('lists every reviewed send variant with unique metadata and a rendered preview', () => {
		const entries = getEmailReviewCatalog();
		expect(entries.length).toBeGreaterThanOrEqual(35);
		expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);

		for (const entry of entries) {
			expect(entry.name).toBeTruthy();
			expect(entry.trigger).toBeTruthy();
			expect(entry.timing).toBeTruthy();
			expect(entry.frequency).toBeTruthy();
			expect(entry.protections).toBeTruthy();
			expect(entry.subject).toBeTruthy();
			expect(entry.preheader).toBeTruthy();
			expect(entry.preheader.toLowerCase()).not.toBe(entry.subject.toLowerCase());
			expect(entry.html).toContain('class="fa-title"');
		}
	});

	it('keeps implementation jargon out of reviewed admin copy', () => {
		const adminCopy = getEmailReviewCatalog()
			.filter((entry) => entry.audience === 'Admin')
			.map((entry) => `${entry.subject}\n${entry.preheader}\n${entry.body}`)
			.join('\n');

		expect(adminCopy).not.toMatch(/\[FastAccs Ops\]/i);
		expect(adminCopy).not.toMatch(/Source:/i);
		expect(adminCopy).not.toMatch(/order_allocation/i);
		expect(adminCopy).not.toMatch(/configured low-stock threshold/i);
		expect(adminCopy).not.toMatch(/alert limit:/i);
	});
});
