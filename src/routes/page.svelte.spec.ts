import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

// The homepage activity ticker asks the server for stats; answer here so the test stays local.
beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ data: null }))
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('/+page.svelte', () => {
	it('should render h1', async () => {
		render(Page);

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});
});
