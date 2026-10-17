import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ constructed: vi.fn(), disconnect: vi.fn(async () => {}) }));
vi.mock('$env/dynamic/private', () => ({
	env: { DATABASE_URL: 'postgresql://disabled:disabled@127.0.0.1:1/test' }
}));
vi.mock('@prisma/client', () => ({
	PrismaClient: class {
		constructor(options: unknown) {
			mocks.constructed(options);
		}
		$disconnect = mocks.disconnect;
	}
}));
const shared = globalThis as typeof globalThis & { prisma?: unknown };
let original: unknown;
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	original = shared.prisma;
	delete shared.prisma;
});
afterEach(() => {
	shared.prisma = original;
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});
describe('Prisma shutdown lifecycle', () => {
	it('disconnects through a one-shot production beforeExit hook, avoiding re-entrant shutdown', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const once = vi.spyOn(process, 'once').mockReturnValue(process);
		const on = vi.spyOn(process, 'on');
		await import('./prisma');
		const hooks = once.mock.calls.filter(([event]) => event === 'beforeExit');
		expect(hooks).toHaveLength(1);
		expect(on.mock.calls.filter(([event]) => event === 'beforeExit')).toHaveLength(0);
		await (hooks[0][1] as CallableFunction)(0);
		expect(mocks.disconnect).toHaveBeenCalledOnce();
	});
	it('keeps the shared development client without registering an exit hook', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const once = vi.spyOn(process, 'once').mockReturnValue(process);
		const first = await import('./prisma');
		vi.resetModules();
		const second = await import('./prisma');
		expect(second.prisma).toBe(first.prisma);
		expect(mocks.constructed).toHaveBeenCalledOnce();
		expect(once.mock.calls.filter(([event]) => event === 'beforeExit')).toHaveLength(0);
	});
});
