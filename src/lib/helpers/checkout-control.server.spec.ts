import { afterEach, describe, expect, it, vi } from 'vitest';

describe('emergency checkout initialization control', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('leaves new checkout initialization enabled by default', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', '');
		const { isNewCheckoutInitializationDisabled } = await import('./checkout-control.server');

		expect(isNewCheckoutInitializationDisabled()).toBe(false);
	});

	it('disables new checkout initialization only when explicitly enabled', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'true');
		const { isNewCheckoutInitializationDisabled } = await import('./checkout-control.server');

		expect(isNewCheckoutInitializationDisabled()).toBe(true);
	});

	it('does not treat unrelated values as enabled', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		const { isNewCheckoutInitializationDisabled } = await import('./checkout-control.server');

		expect(isNewCheckoutInitializationDisabled()).toBe(false);
	});
});

