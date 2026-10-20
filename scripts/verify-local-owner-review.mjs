import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Fictitious loopback-only review. All network writes and external requests are blocked.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const results = [];
	for (const width of [1360, 390]) {
		const context = await browser.newContext({ viewport: { width, height: 900 } });
		const blockedWrites = [],
			errors = [];
		await context.route('**/*', (route) => {
			const request = route.request(),
				url = new URL(request.url());
			if (!['GET', 'HEAD'].includes(request.method())) {
				blockedWrites.push(url.pathname);
				return route.abort();
			}
			return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
		});
		const page = await context.newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		assert.equal(
			(
				await page.goto('http://127.0.0.1:5173/local-review/boosting-pricing?review=advisories', {
					waitUntil: 'domcontentloaded',
					timeout: 60000
				})
			).status(),
			200
		);
		await page.getByRole('button', { name: 'Necessary only', exact: true }).click();
		const price = page.getByRole('spinbutton', { name: 'Price for Instagram Followers value' });
		assert.equal(await page.getByText('0 blocked', { exact: true }).count(), 1);
		assert.equal(await price.inputValue(), '500');
		await page.getByRole('button', { name: 'Instagram Followers', exact: true }).click();
		const detailText = await page.locator('#boost-details-preview-instagram-followers').innerText();
		for (const warning of [
			'Below minimum retained profit.',
			'Supplier cost exceeds reviewed limit.',
			'A customer-facing service claim has not been verified.'
		])
			assert.ok(detailText.includes(warning));
		const live = page.getByRole('checkbox', { name: 'Live Instagram Followers value' });
		await live.check();
		assert.equal(await live.isChecked(), true);
		await page.getByRole('button', { name: 'Review current price and cost', exact: true }).click();
		await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
		const review = page.getByRole('dialog', { name: 'Save these changes?' });
		assert.ok(
			(await review.innerText()).includes('Supplier cost reviewed with this Save: ₦300 per 1,000')
		);
		assert.ok(
			(await review.innerText()).includes('Unverified quality requirements will be removed')
		);
		await review.getByRole('button', { name: 'Keep editing' }).click();
		assert.equal(await price.inputValue(), '500');
		assert.equal(await live.isChecked(), true);
		assert.equal(await page.getByText('0 blocked', { exact: true }).count(), 1);
		await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
		await review.getByRole('button', { name: 'Confirm & save' }).click();
		await review.waitFor({ state: 'hidden' });
		assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
		assert.equal(await price.inputValue(), '500');
		assert.equal(await live.isChecked(), true);
		await page.getByRole('button', { name: 'Instagram Followers', exact: true }).click();
		const savedText = await page.locator('#boost-details-preview-instagram-followers').innerText();
		assert.ok(savedText.includes('Below minimum retained profit.'));
		assert.ok(!savedText.includes('Supplier cost exceeds reviewed limit.'));
		assert.ok(!savedText.includes('A customer-facing service claim has not been verified.'));
		await page.screenshot({ path: `/private/tmp/fastaccs-owner-review-${width}-20261018.png` });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		assert.deepEqual(errors, []);
		assert.ok(blockedWrites.every((path) => path === '/api/attribution/sync'));
		results.push({
			width,
			allThreeFlagsAdvisory: true,
			liveTick: true,
			oneFinalSave: true,
			cancelPreservesDraft: true,
			actualNetworkWrites: 0,
			blockedConsentSyncs: blockedWrites.length,
			pageErrors: 0,
			overflow: false
		});
		await context.close();
	}
	console.log(JSON.stringify({ sampleOnly: true, productionChanged: false, results }));
} finally {
	await browser.close();
}
