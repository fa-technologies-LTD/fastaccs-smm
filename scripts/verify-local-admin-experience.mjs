import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Loopback-only sample editor. No authentication or database writes; block external HTTP too.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const results = [];
	for (const width of [1360, 390]) {
		const context = await browser.newContext({ viewport: { width, height: 900 } });
		let writes = 0;
		const errors = [];
		await context.route('**/*', (route) => {
			const request = route.request(),
				url = new URL(request.url());
			if (
				!['localhost', '127.0.0.1'].includes(url.hostname) ||
				!['GET', 'HEAD'].includes(request.method())
			) {
				if (!['GET', 'HEAD'].includes(request.method())) writes++;
				return route.abort();
			}
			return route.continue();
		});
		const page = await context.newPage();
		page.on('pageerror', (error) => errors.push(error.name));
		const response = await page.goto('http://127.0.0.1:5173/local-review/boosting-pricing', {
			waitUntil: 'networkidle',
			timeout: 60000
		});
		assert.equal(response.status(), 200);
		const price = page.getByRole('spinbutton', { name: 'Price for Instagram Followers value' });
		const live = page.getByRole('checkbox', { name: 'Live Instagram Followers value' });
		await price.fill('1800');
		await live.check();
		const status = page.getByRole('combobox', { name: 'Status', exact: true });
		await status.selectOption('live');
		assert.equal(
			await page.getByRole('button', { name: 'Instagram Followers', exact: true }).count(),
			0
		);
		await status.selectOption('edited');
		assert.equal(await price.inputValue(), '1800');
		await page.getByRole('textbox', { name: 'Search offers' }).fill('no-matches-test');
		assert.ok(await page.getByText('No offers match these filters.').isVisible());
		await page.getByRole('button', { name: 'Clear filters' }).click();
		assert.equal(await price.inputValue(), '1800');
		await page.keyboard.press('Control+s');
		const saveReview = page.getByRole('dialog', { name: 'Save these changes?' });
		await saveReview.waitFor();
		assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
		await page.keyboard.press('Escape');
		await saveReview.waitFor({ state: 'hidden' });
		await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
		await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
		assert.equal(await price.inputValue(), '1800');
		await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
		await page
			.getByRole('dialog', { name: 'Discard unsaved changes?' })
			.getByRole('button', { name: 'Discard draft', exact: true })
			.click();
		assert.equal(await price.inputValue(), '1500');
		assert.equal(await live.isChecked(), false);
		await price.fill('1800');
		await page.getByRole('button', { name: 'Instagram Followers', exact: true }).click();
		await page
			.getByRole('spinbutton', { name: 'Customer minimum for Instagram Followers value' })
			.fill('500');
		await page
			.getByRole('spinbutton', { name: 'Quantity increment for Instagram Followers value' })
			.fill('500');
		await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
		const details = page.getByRole('dialog', { name: 'Instagram Followers · Supplier details' });
		await details.getByRole('region', { name: 'SMM Raja supplier records' }).waitFor();
		await details.getByRole('button', { name: 'Close details', exact: true }).click();
		assert.equal(await price.inputValue(), '1800');
		await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
		await saveReview.waitFor();
		await page.screenshot({ path: `/private/tmp/fastaccs-admin-experience-${width}-20261017.png` });
		await saveReview.getByRole('button', { name: 'Confirm & save' }).click();
		await saveReview.waitFor({ state: 'hidden' });
		assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		assert.deepEqual(errors, []);
		assert.equal(writes, 0);
		results.push({
			width,
			filtersPreserveDraft: true,
			confirmedDiscard: true,
			keyboardReview: true,
			supplierInspection: true,
			singleInMemorySave: true,
			pageErrors: 0,
			networkWrites: 0
		});
		await context.close();
	}
	console.log(JSON.stringify({ sampleOnly: true, productionChanged: false, results }));
} finally {
	await browser.close();
}
