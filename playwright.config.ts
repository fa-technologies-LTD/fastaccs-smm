import { defineConfig } from '@playwright/test';

export default defineConfig({
	use: { baseURL: 'http://127.0.0.1:4173' },
	webServer:
		process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1'
			? undefined
			: {
					command: 'npm run build && npm run preview',
					port: 4173,
					timeout: 240_000
				},
	testDir: 'e2e'
});
