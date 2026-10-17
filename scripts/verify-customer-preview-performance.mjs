import { chromium } from 'playwright';

// Fixed loopback BUILT staging preview. Anonymous reads only; no external traffic or writes.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const browser = await chromium.launch({ headless: true });
try {
	const results = [];
	for (const mobile of [false, true]) {
		const context = await browser.newContext({
			viewport: { width: mobile ? 390 : 1440, height: 900 }
		});
		await context.route('**/*', (route) => {
			const request = route.request(),
				url = new URL(request.url());
			return url.origin === 'http://127.0.0.1:5181' &&
				['GET', 'HEAD'].includes(request.method()) &&
				!url.pathname.startsWith('/api/internal/cron/')
				? route.continue()
				: route.abort();
		});
		await context.addInitScript(() => {
			window.__customerPerf = { lcp: 0 };
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) window.__customerPerf.lcp = entry.startTime;
			}).observe({ type: 'largest-contentful-paint', buffered: true });
		});
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		if (mobile) {
			const session = await context.newCDPSession(page);
			await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		}
		for (const path of ['/', '/platforms', '/services', '/numbers', '/auth/login', '/support']) {
			await page.goto(`http://127.0.0.1:5181${path}`, { waitUntil: 'networkidle', timeout: 45000 });
			await page.locator('.cookie-notice').waitFor({ state: 'visible', timeout: 10000 });
			if (errors.length)
				throw new Error('Page hydration failed; performance measurements are invalid.');
			const metrics = await page.evaluate(() => {
				const nav = performance.getEntriesByType('navigation')[0];
				return {
					ttfbMs: Math.round(nav.responseStart - nav.startTime),
					fcpMs: Math.round(
						performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
					),
					lcpMs: Math.round(window.__customerPerf.lcp),
					jsKiB: Math.round(
						performance
							.getEntriesByType('resource')
							.filter(
								(r) =>
									r.initiatorType === 'script' ||
									(r.name.includes('/_app/immutable/') && r.name.endsWith('.js'))
							)
							.reduce((sum, r) => sum + r.encodedBodySize, 0) / 1024
					)
				};
			});
			results.push({
				path,
				profile: mobile ? 'mobile-4xCPU-local-network' : 'desktop-unthrottled',
				...metrics
			});
		}
		await context.close();
	}
	console.log(
		JSON.stringify(
			{
				builtLocalStagingOnly: true,
				productionBenchmark: false,
				externalRequestsAllowed: false,
				results
			},
			null,
			2
		)
	);
} finally {
	await browser.close();
}
