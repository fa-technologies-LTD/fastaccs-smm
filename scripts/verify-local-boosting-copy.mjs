import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Fictional loopback-only data. No external reads or network writes are permitted.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const results = [];
	for (const width of [1360, 390]) {
		const context = await browser.newContext({ viewport: { width, height: 1000 } });
		const errors = [],
			blockedWrites = [];
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
		const response = await page.goto('http://127.0.0.1:5173/local-review/boosting-copy', {
			waitUntil: 'networkidle',
			timeout: 60000
		});
		assert.equal(response.status(), 200);
		const consent = page.getByRole('button', { name: 'Necessary only', exact: true });
		if (await consent.count()) await consent.click();
		const launchPreview = page.getByRole('button', { name: 'Preview launch popup', exact: true });
		await launchPreview.click();
		const notice = page.getByRole('dialog', { name: 'Boosting is back.' });
		await notice.waitFor({ state: 'visible' });
		assert.equal(await notice.isVisible(), true);
		assert.equal(
			await notice.getByRole('link', { name: 'Explore Boosting' }).getAttribute('href'),
			'/services'
		);
		await page.screenshot({
			path: `/private/tmp/fastaccs-boosting-launch-popup-${width}-20261019.png`,
			animations: 'disabled'
		});
		await page.keyboard.press('Escape');
		await notice.waitFor({ state: 'detached' });
		assert.equal(await notice.count(), 0);
		assert.equal(
			await launchPreview.evaluate((element) => document.activeElement === element),
			true
		);
		await launchPreview.click();
		await page.getByRole('button', { name: 'Maybe later', exact: true }).click();
		await notice.waitFor({ state: 'detached' });
		assert.equal(await notice.count(), 0);
		const shared = page.getByText('Delivery timing varies. Track progress from your order.', {
			exact: true
		});
		assert.equal(await shared.count(), 1);
		const standard = page.getByRole('button', {
			name: /Lower price/
		});
		assert.ok((await standard.innerText()).includes('₦2,500'));
		assert.ok((await standard.innerText()).includes('500 followers'));
		const refill = page.getByRole('button', { name: /30-day refill/ });
		assert.ok((await refill.innerText()).includes('₦2,800'));
		assert.ok((await refill.innerText()).includes('200 followers'));
		assert.ok((await refill.innerText()).includes('30-day refill'));
		assert.ok(!(await refill.innerText()).includes('normally starts'));
		await refill.click();
		assert.equal(await refill.getAttribute('aria-pressed'), 'true');
		assert.equal(await standard.getAttribute('aria-pressed'), 'false');
		assert.equal(await page.getByRole('spinbutton').inputValue(), '200');
		const summary = page.getByText('Refill terms (eligibility applies)', { exact: true });
		await summary.click();
		assert.equal(await page.getByText(/not\s+a\s+guarantee\s+against\s+drops/).isVisible(), true);
		assert.equal(await page.getByText(/exact window and eligibility/).isVisible(), true);
		assert.equal(
			await page.getByRole('button', { name: 'Preview only — checkout disabled' }).isDisabled(),
			true
		);
		await page.screenshot({
			path: `/private/tmp/fastaccs-value-labels-${width}-20261019.png`,
			fullPage: true,
			animations: 'disabled'
		});
		await standard.click();
		assert.equal(await summary.count(), 0);
		assert.equal(await page.getByRole('spinbutton').inputValue(), '500');
		await page.getByRole('button', { name: 'Spotify', exact: true }).click();
		assert.equal(await page.getByRole('button', { name: /Lower price/ }).count(), 1);
		assert.equal(await page.getByRole('button', { name: /No refill/ }).count(), 1);
		await page.getByRole('button', { name: 'Saves', exact: true }).click();
		assert.equal(await page.getByRole('button', { name: /1,000 saves/ }).count(), 1);
		assert.equal(await page.getByText('Lower price', { exact: true }).count(), 0);
		await page.getByRole('button', { name: 'Instagram', exact: true }).click();
		assert.equal(await page.getByRole('button', { name: /Nigeria audience/ }).count(), 1);
		assert.equal(await page.getByRole('button', { name: /UK audience/ }).count(), 1);
		assert.equal(await page.getByText('Lower price', { exact: true }).count(), 0);
		assert.equal(await page.getByText(/Standard option|Premium|Recommended/).count(), 0);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		assert.deepEqual(errors, []);
		assert.ok(blockedWrites.every((path) => path === '/api/attribution/sync'));
		// Exercise the real link without loading staging data or any purchase flow.
		await page.route('**/api/**', (route) => {
			const request = route.request();
			if (!['GET', 'HEAD'].includes(request.method())) {
				blockedWrites.push(new URL(request.url()).pathname);
				return route.abort();
			}
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					success: true,
					managedRolloutActive: true,
					automationReady: false,
					data: []
				})
			});
		});
		await launchPreview.click();
		await notice.getByRole('link', { name: 'Explore Boosting' }).click();
		await page.waitForURL('http://127.0.0.1:5173/services');
		await page.getByRole('heading', { name: 'We’re upgrading this section…' }).waitFor();
		assert.equal(await notice.count(), 0);
		assert.deepEqual(errors, []);
		results.push({
			width,
			sharedDeliveryMessageCount: 1,
			exactPricesAndQuantities: true,
			selectableRefillTerms: true,
			launchPopupDismissalAndFocus: true,
			launchPopupDestination: true,
			checkoutDisabled: true,
			pageErrors: 0,
			overflow: false,
			completedWrites: 0,
			blockedConsentSyncs: blockedWrites.length
		});
		await context.close();
	}
	console.log(JSON.stringify({ sampleOnly: true, productionChanged: false, results }));
} finally {
	await browser.close();
}
