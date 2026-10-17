import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Fictitious, loopback-only sample. Never touch the owner's tab or send network writes.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const results = [];
	for (const width of [1360, 390]) {
		const context = await browser.newContext({ viewport: { width, height: 900 } });
		const errors = [];
		let writes = 0;
		await context.route('**/*', (route) => {
			const request = route.request(),
				url = new URL(request.url());
			if (!['GET', 'HEAD'].includes(request.method())) {
				writes++;
				return route.abort();
			}
			return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
		});
		const page = await context.newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		assert.equal(
			(
				await page.goto('http://127.0.0.1:5173/local-review/boosting-pricing', {
					waitUntil: 'networkidle',
					timeout: 60000
				})
			).status(),
			200
		);
		const price = page.getByRole('spinbutton', { name: 'Price for Instagram Followers value' });
		await price.fill('1800');
		await page
			.getByRole('button', { name: /SMM Raja #DEMO/ })
			.first()
			.click();
		const picker = page.getByRole('dialog', { name: 'Instagram Followers · Choose supplier' });
		await picker.getByRole('combobox', { name: 'Supplier provider' }).selectOption('bulk_follows');
		await picker.getByRole('textbox', { name: 'Search supplier services' }).fill('DEMO-202');
		await picker.getByRole('button', { name: 'Use BulkFollows DEMO-202' }).waitFor();
		assert.ok(await picker.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
		await page.screenshot({ path: `/private/tmp/fastaccs-supplier-picker-${width}-20261017.png` });
		await picker.getByRole('button', { name: 'Use BulkFollows DEMO-202' }).click();
		assert.equal(await price.inputValue(), '1800');
		assert.equal(
			await page
				.getByRole('spinbutton', { name: 'Customer minimum for Instagram Followers value' })
				.inputValue(),
			'1000'
		);
		await page.getByRole('checkbox', { name: 'Live Instagram Followers value' }).check();
		await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
		const review = page.getByRole('dialog', { name: 'Save these changes?' });
		await review.waitFor();
		assert.ok((await review.innerText()).includes('BulkFollows #DEMO-202'));
		assert.ok((await review.innerText()).includes('This exact service will stay selected'));
		await page.screenshot({ path: `/private/tmp/fastaccs-supplier-review-${width}-20261017.png` });
		await review.getByRole('button', { name: 'Keep editing' }).click();
		assert.equal(await price.inputValue(), '1800');
		await page.getByRole('button', { name: 'Undo supplier change', exact: true }).click();
		assert.equal(await price.inputValue(), '1800');
		assert.equal(await page.getByRole('button', { name: /SMM Raja #DEMO/ }).count(), 3);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		assert.deepEqual(errors, []);
		assert.equal(writes, 0);
		results.push({
			width,
			exactCodeSearch: true,
			draftSelection: true,
			pricePreserved: true,
			finalReview: true,
			cancelAndUndo: true,
			pageErrors: 0,
			networkWrites: 0,
			horizontalOverflow: false
		});
		await context.close();
	}
	console.log(JSON.stringify({ sampleOnly: true, productionChanged: false, results }));
} finally {
	await browser.close();
}
