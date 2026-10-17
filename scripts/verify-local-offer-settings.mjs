import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// UI-only sample page. Never authenticate, write to the API, or contact an external service.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
	let writes = 0;
	await context.route('**/*', (route) => {
		const request = route.request();
		const url = new URL(request.url());
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
	const title = 'Instagram Followers value';
	const price = page.getByRole('spinbutton', { name: `Price for ${title}` });
	const minimum = page.getByRole('spinbutton', { name: `Customer minimum for ${title}` });
	const increment = page.getByRole('spinbutton', { name: `Quantity increment for ${title}` });
	const maximum = page.getByRole('spinbutton', { name: `Customer maximum for ${title}` });
	const option = page.getByRole('textbox', { name: `Customer option name for ${title}` });
	const description = page.getByRole('textbox', { name: `Customer description for ${title}` });
	const live = page.getByRole('checkbox', { name: `Live ${title}` });
	await price.fill('1800');
	await live.check();
	await page.getByRole('button', { name: 'Instagram Followers', exact: true }).click();
	await minimum.fill('500');
	await increment.fill('500');
	await maximum.fill('10000');
	await option.fill('Reviewed option');
	await description.fill('A clear customer-facing description.');
	assert.equal(await price.inputValue(), '1800');
	assert.ok(await page.getByRole('button', { name: `Unlock ${title} price` }).isVisible());
	await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
	const supplier = page.getByRole('dialog', { name: 'Instagram Followers · Supplier details' });
	await supplier.getByRole('region', { name: 'SMM Raja supplier records' }).waitFor();
	await supplier.getByRole('button', { name: 'Close details', exact: true }).click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Instagram Followers', exact: true }).click();
	for (const [control, value] of [
		[minimum, '500'],
		[increment, '500'],
		[maximum, '10000'],
		[option, 'Reviewed option'],
		[description, 'A clear customer-facing description.']
	]) {
		assert.equal(await control.inputValue(), value);
	}
	await minimum.fill('0');
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	assert.equal(await page.getByRole('dialog', { name: 'Save these changes?' }).count(), 0);
	assert.equal(await minimum.getAttribute('aria-invalid'), 'true');
	assert.equal(await price.inputValue(), '1800');
	await minimum.fill('500');
	await page.screenshot({ path: '/private/tmp/fastaccs-offer-settings-desktop-20261016.png' });
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	const review = page.getByRole('dialog', { name: 'Save these changes?' });
	for (const label of [
		'Customer minimum',
		'Quantity increment',
		'Customer maximum',
		'Option name',
		'Customer description'
	]) {
		assert.ok((await review.innerText()).includes(label));
	}
	await review.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	await minimum.scrollIntoViewIfNeeded();
	assert.ok(await minimum.isVisible());
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
	await page.screenshot({ path: '/private/tmp/fastaccs-offer-settings-mobile-20261016.png' });
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	const confirm = review.getByRole('button', { name: 'Confirm & save' });
	const box = await confirm.boundingBox();
	assert.ok(
		box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844
	);
	await page.screenshot({
		path: '/private/tmp/fastaccs-offer-settings-confirm-mobile-20261016.png'
	});
	await confirm.click();
	await review.waitFor({ state: 'hidden' });
	assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
	await page.getByRole('button', { name: 'Instagram Followers', exact: true }).click();
	assert.equal(await minimum.inputValue(), '500');
	await page.reload({ waitUntil: 'networkidle' });
	assert.equal(await price.inputValue(), '1500');
	assert.equal(await live.isChecked(), false);
	assert.deepEqual(errors, []);
	assert.equal(writes, 0);
	console.log(
		JSON.stringify({
			localPreview: 200,
			quantityPricePreserved: true,
			draftEditsPreserved: true,
			invalidInputBlocked: true,
			mobileControlsUsable: true,
			singleSaveConfirmed: true,
			reloadResetsSample: true,
			pageErrors: 0,
			writeRequests: 0,
			productionChanged: false
		})
	);
} finally {
	await browser.close();
}
