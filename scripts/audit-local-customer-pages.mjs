import { chromium } from 'playwright';

// Anonymous GET-only localhost audit. No authentication, writes, crons or external requests.
const built = process.argv.length === 3 && process.argv[2] === '--built';
if (process.argv.length !== 2 && !built)
	throw new Error('Only --built is accepted; localhost targets are fixed.');
const origin = built ? 'http://127.0.0.1:5181' : 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
try {
	const results = [];
	for (const width of [390, 1440]) {
		const context = await browser.newContext({ viewport: { width, height: 900 } });
		let writesBlocked = 0;
		await context.route('**/*', (route) => {
			const req = route.request(),
				url = new URL(req.url());
			if (
				!['127.0.0.1', 'localhost'].includes(url.hostname) ||
				!['GET', 'HEAD'].includes(req.method()) ||
				url.pathname.startsWith('/api/internal/cron/')
			) {
				if (!['GET', 'HEAD'].includes(req.method())) writesBlocked++;
				return route.abort();
			}
			return route.continue();
		});
		const page = await context.newPage();
		const errors = [];
		const httpErrors = [];
		page.on('response', (response) => {
			if (response.status() >= 400)
				httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
		});
		page.on('pageerror', (error) =>
			errors.push({ name: error.name, message: error.message, stack: error.stack })
		);
		const paths = [
			'/',
			'/platforms',
			'/platforms/x',
			'/services',
			'/numbers',
			'/support',
			'/how-it-works',
			'/blog',
			'/terms',
			'/privacy',
			'/refund-policy',
			'/acceptable-use',
			'/cookies',
			'/affiliate-terms',
			'/auth/login',
			'/auth/signup',
			'/checkout',
			'/dashboard'
		];
		for (const path of paths) {
			const started = performance.now();
			const before = errors.length;
			const beforeHttp = httpErrors.length;
			try {
				const response = await page.goto(`${origin}${path}`, {
					waitUntil: 'networkidle',
					timeout: 45000
				});
				const info = await page.evaluate(() => ({
					horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
					headings: [...document.querySelectorAll('h1,h2,h3')]
						.map((el) => el.textContent.trim())
						.slice(0, 16),
					bodyTextLength: document.body.innerText.length,
					inputs: [...document.querySelectorAll('input')].map((el) => ({
						type: el.type,
						label: el.labels?.[0]?.textContent.trim() || el.getAttribute('aria-label') || null
					}))
				}));
				await page.screenshot({
					path: `/private/tmp/fastaccs-customer-${built ? 'fixes' : 'audit'}-${width}-${path.replaceAll('/', '_') || 'home'}-20261016.png`
				});
				results.push({
					path,
					width,
					status: response.status(),
					destination: new URL(page.url()).pathname,
					localDevElapsedMs: Math.round(performance.now() - started),
					pageErrors: errors.slice(before),
					httpErrors: httpErrors.slice(beforeHttp),
					...info
				});
				if (path === '/platforms/x') {
					const tierPath = await page
						.locator('a[href*="/tiers/"]')
						.first()
						.getAttribute('href')
						.catch(() => null);
					if (tierPath?.startsWith('/platforms/x/tiers/'))
						paths.splice(paths.indexOf(path) + 1, 0, tierPath);
				}
				if (path === '/platforms' && width === 390) {
					const menu = page.getByRole('button', { name: 'Toggle mobile menu' });
					await menu.click();
					await page.waitForFunction(
						() =>
							document
								.querySelector('[aria-label="Toggle mobile menu"]')
								?.getAttribute('aria-expanded') === 'true',
						{},
						{ timeout: 5000 }
					);
					results.push({
						check: 'mobile-menu',
						visible: await page.locator('#mobile-navigation a[href="/numbers"]').isVisible(),
						ariaExpanded: await menu.getAttribute('aria-expanded')
					});
					await menu.click();
				}
			} catch (error) {
				results.push({ path, width, error: error.name });
			}
		}
		results.push({ width, writesBlocked, actualWriteRequests: 0 });
		await context.close();
	}
	console.log(JSON.stringify({ readOnly: true, productionChanged: false, results }, null, 2));
	if (
		results.some(
			(result) =>
				result.error ||
				(result.path &&
					(result.status !== 200 ||
						result.horizontalOverflow ||
						result.pageErrors?.length ||
						result.httpErrors?.length))
		)
	)
		process.exitCode = 1;
} finally {
	await browser.close();
}
