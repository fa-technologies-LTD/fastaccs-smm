import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('$lib/prisma', () => ({ prisma: {} }));
afterEach(() => vi.restoreAllMocks());
describe('session cache housekeeping lifecycle', () => {
	it('keeps minute-by-minute cleanup without keeping the Node process alive', async () => {
		vi.resetModules();
		const unref = vi.fn();
		const interval = vi
			.spyOn(globalThis, 'setInterval')
			.mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);
		await import('./session');
		expect(interval).toHaveBeenCalledWith(expect.any(Function), 60000);
		expect(unref).toHaveBeenCalledOnce();
	});
	it('does not assume a browser-style numeric timer has an unref method', async () => {
		vi.resetModules();
		vi.spyOn(globalThis, 'setInterval').mockReturnValue(
			42 as unknown as ReturnType<typeof setInterval>
		);
		await expect(import('./session')).resolves.toHaveProperty('validateSessionToken');
	});
});
