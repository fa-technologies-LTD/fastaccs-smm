import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// The loopback-only sample page has in-memory Save. Block every external/write request anyway.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
	let writes = 0;
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
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.name));
	const response = await page.goto('http://127.0.0.1:5173/local-review/boosting-pricing', {
		waitUntil: 'networkidle',
		timeout: 60000
	});
	assert.equal(response.status(), 200);
	const price = page.getByRole('spinbutton', { name: 'Price for Instagram Followers value' });
	const fx = page.getByRole('spinbutton', { name: 'Dollar rate' });
	const live = page.getByRole('checkbox', { name: 'Live Instagram Followers value' });
	await price.fill('1800');
	await fx.fill('2000');
	await live.check();
	const source = page.getByRole('button', { name: /SMM Raja #/ }).first();
	await source.click();
	const details = page.getByRole('dialog', { name: 'Instagram Followers · Supplier details' });
	await details.getByRole('region', { name: 'SMM Raja supplier records' }).waitFor();
	assert.ok((await details.innerText()).includes('₦400'));
	assert.ok((await details.innerText()).includes('30 days—supplier claim'));
	assert.ok((await details.innerText()).includes('Not verified'));
	await details.getByRole('region', { name: 'BulkFollows supplier records' }).waitFor();
	await page.screenshot({ path: '/private/tmp/fastaccs-supplier-details-desktop-20261015.png' });
	await details.getByRole('button', { name: 'Close details', exact: true }).click();
	assert.equal(await price.inputValue(), '1800');
	assert.equal(await fx.inputValue(), '2000');
	assert.equal(await live.isChecked(), true);
	await page.setViewportSize({ width: 390, height: 844 });
	await source.click();
	await details.waitFor();
	const close = details.getByRole('button', { name: 'Close details', exact: true });
	const box = await close.boundingBox();
	assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
	await page.screenshot({ path: '/private/tmp/fastaccs-supplier-details-mobile-20261015.png' });
	await close.click(); // Confirms the real footer isn't hidden behind the consent banner.
	assert.equal(await price.inputValue(), '1800');
	assert.equal(await fx.inputValue(), '2000');
	assert.equal(await live.isChecked(), true);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await page.getByRole('dialog').waitFor({ state: 'hidden' });
	assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
	await page.reload({ waitUntil: 'networkidle' });
	assert.equal(await price.inputValue(), '1500');
	assert.equal(await fx.inputValue(), '1500');
	assert.equal(await live.isChecked(), false);
	assert.equal(errors.length, 0);
	assert.equal(writes, 0);
	console.log(
		JSON.stringify({
			localPreview: 200,
			bothProvidersVisible: true,
			unsavedEditsKept: true,
			mobileCloseClickable: true,
			singleSavePreserved: true,
			reloadResetsSample: true,
			pageErrors: 0,
			writeRequests: 0,
			productionChanged: false
		})
	);
} finally {
	await browser.close();
}
