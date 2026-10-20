import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Fictitious loopback-only data. Never inspect the owner's tab or permit network writes.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const results = [];
	for (const width of [1360, 390]) {
		const context = await browser.newContext({ viewport: { width, height: 900 } });
		const errors = [];
		const blockedWritePaths = [];
		await context.route('**/*', (route) => {
			const request = route.request();
			if (!['GET', 'HEAD'].includes(request.method())) {
				blockedWritePaths.push(new URL(request.url()).pathname);
				return route.abort();
			}
			return ['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)
				? route.continue()
				: route.abort();
		});
		const page = await context.newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		assert.equal(
			(
				await page.goto('http://127.0.0.1:5173/local-review/boosting-pricing', {
					waitUntil: 'domcontentloaded',
					timeout: 60000
				})
			).status(),
			200
		);
		const cookieChoice = page.getByRole('button', { name: 'Necessary only', exact: true });
		// The notice mounts on the client: wait for hydration before editing SSR inputs.
		await cookieChoice.waitFor({ state: 'visible', timeout: 60000 });
		await cookieChoice.click();
		const price = page.getByRole('spinbutton', { name: 'Price for YouTube Custom Comments value' });
		assert.equal(await price.inputValue(), '7000');
		assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
		const row = page.getByRole('row').filter({ has: price });
		assert.equal(await row.getByRole('cell', { name: '1,000', exact: true }).count(), 1);
		assert.equal(await row.getByRole('cell', { name: '₦300', exact: true }).count(), 1);
		assert.equal(await row.getByRole('cell', { name: '₦6,700', exact: true }).count(), 1);
		await price.fill('7500');
		await page.getByRole('button', { name: 'YouTube Custom Comments', exact: true }).click();
		const minimum = page.getByRole('spinbutton', {
			name: 'Customer minimum for YouTube Custom Comments value'
		});
		const increment = page.getByRole('spinbutton', {
			name: 'Quantity increment for YouTube Custom Comments value'
		});
		assert.equal(await minimum.inputValue(), '100');
		assert.equal(await increment.inputValue(), '10');
		await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
		const details = page.getByRole('dialog', {
			name: 'YouTube Custom Comments · Supplier details'
		});
		await details.getByRole('region', { name: 'SMM Raja supplier records' }).waitFor();
		assert.ok((await details.innerText()).includes('Cost per 1,000'));
		await details.getByRole('button', { name: 'Close details', exact: true }).click();
		assert.equal(await price.inputValue(), '7500');
		await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
		const review = page.getByRole('dialog', { name: 'Save these changes?' });
		assert.ok((await review.innerText()).includes('₦7,000 per 1,000'));
		assert.ok((await review.innerText()).includes('₦7,500 per 1,000'));
		await review.getByRole('button', { name: 'Confirm & save' }).click();
		await review.waitFor({ state: 'hidden' });
		assert.equal(await price.inputValue(), '7500');
		await page.getByRole('button', { name: 'YouTube Custom Comments', exact: true }).click();
		assert.equal(await minimum.inputValue(), '100');
		assert.equal(await increment.inputValue(), '10');
		assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
		await page.screenshot({ path: `/private/tmp/fastaccs-per1000-${width}-20261017.png` });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		assert.deepEqual(errors, []);
		// Dismissing the cookie notice attempts consent sync; it is blocked too.
		// Any pricing/admin/other write attempt is still an unexpected failure.
		assert.ok(blockedWritePaths.every((path) => path === '/api/attribution/sync'));
		results.push({
			width,
			priceCostProfitPer1000: true,
			inspectionReadOnly: true,
			quantitiesPreserved: true,
			finalSave: true,
			pageErrors: 0,
			networkWrites: 0,
			blockedConsentWrites: blockedWritePaths.length,
			horizontalOverflow: false
		});
		await context.close();
	}
	console.log(JSON.stringify({ sampleOnly: true, productionChanged: false, results }));
} finally {
	await browser.close();
}
