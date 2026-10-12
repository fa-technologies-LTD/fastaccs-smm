import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	isModuleLoadError,
	keepServerPageOnBootFailure,
	markAppMounted,
	resetBootGuardForTests,
	shouldReloadAfterBootFailure
} from './boot-guard';

const PERSON =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	};
}

afterEach(() => {
	resetBootGuardForTests();
	vi.unstubAllGlobals();
});

describe('isModuleLoadError', () => {
	it('recognises failed script loads in Chrome, Firefox, Safari and Vite', () => {
		expect(
			isModuleLoadError(
				new TypeError('Failed to fetch dynamically imported module: https://x/_app/nodes/0.js')
			)
		).toBe(true);
		expect(isModuleLoadError(new TypeError('error loading dynamically imported module'))).toBe(
			true
		);
		expect(isModuleLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
		expect(isModuleLoadError(new Error('Unable to preload CSS for /_app/assets/0.css'))).toBe(true);
	});

	it('ignores ordinary errors', () => {
		expect(isModuleLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
		expect(isModuleLoadError({ status: 500 })).toBe(false);
		expect(isModuleLoadError(undefined)).toBe(false);
	});
});

describe('shouldReloadAfterBootFailure', () => {
	const base = { userAgent: PERSON, webdriver: false, path: '/platforms/x', now: 1_000_000 };

	it('reloads a person once per page per minute', () => {
		const storage = memoryStorage();
		expect(shouldReloadAfterBootFailure({ ...base, storage })).toBe(true);
		expect(shouldReloadAfterBootFailure({ ...base, now: base.now + 5_000, storage })).toBe(false);
		expect(shouldReloadAfterBootFailure({ ...base, path: '/numbers', storage })).toBe(true);
		expect(
			shouldReloadAfterBootFailure({ ...base, path: '/numbers', now: base.now + 61_000, storage })
		).toBe(true);
	});

	it('never reloads crawlers, automation, or without storage', () => {
		const storage = memoryStorage();
		for (const userAgent of [
			'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) Chrome/141 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
			'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
			'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
			'Mozilla/5.0 (X11; Linux x86_64) Chrome/141 Safari/537.36 Chrome-Lighthouse'
		]) {
			expect(shouldReloadAfterBootFailure({ ...base, userAgent, storage })).toBe(false);
		}
		expect(shouldReloadAfterBootFailure({ ...base, webdriver: true, storage })).toBe(false);
		expect(shouldReloadAfterBootFailure({ ...base, storage: null })).toBe(false);
		const broken = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => undefined
		};
		expect(shouldReloadAfterBootFailure({ ...base, storage: broken })).toBe(false);
	});
});

describe('keepServerPageOnBootFailure', () => {
	function stubBrowser(userAgent: string) {
		const reload = vi.fn();
		const storage = memoryStorage();
		vi.stubGlobal('navigator', { userAgent, webdriver: false });
		vi.stubGlobal('window', {
			sessionStorage: storage,
			location: { pathname: '/platforms/x', search: '', reload }
		});
		return reload;
	}

	const scriptFailure = new TypeError('Failed to fetch dynamically imported module: /_app/x.js');

	it('keeps the server page for a crawler without reloading', () => {
		const reload = stubBrowser('Googlebot/2.1');
		expect(keepServerPageOnBootFailure(scriptFailure)).toBe(true);
		expect(reload).not.toHaveBeenCalled();
	});

	it('keeps the server page and reloads once for a person', () => {
		const reload = stubBrowser(PERSON);
		expect(keepServerPageOnBootFailure(scriptFailure)).toBe(true);
		expect(keepServerPageOnBootFailure(scriptFailure)).toBe(true);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("leaves SvelteKit's handling alone after mount and for other errors", () => {
		const reload = stubBrowser(PERSON);
		expect(keepServerPageOnBootFailure(new Error('load failed: boom'))).toBe(false);
		markAppMounted();
		expect(keepServerPageOnBootFailure(scriptFailure)).toBe(false);
		expect(reload).not.toHaveBeenCalled();
	});
});
