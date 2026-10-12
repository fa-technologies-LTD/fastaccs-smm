/**
 * Keeps the server-rendered page when the app's scripts fail to download on first load.
 *
 * SvelteKit's default is to swap the whole page for a bare "500 Internal Error" document when any
 * script the page needs fails to load (flaky mobile data, or a search engine's renderer skipping
 * files). Google then sees an error page: "Soft 404", no canonical. Until the app has mounted, a
 * failed script import is re-thrown from `handleError` (hooks.client.ts), which stops SvelteKit
 * before it touches the page. People get one automatic reload; crawlers keep the server HTML.
 */

const MODULE_LOAD_ERROR =
	/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;
const CRAWLER = /bot\/|bot;|crawler|spider|slurp|Google-InspectionTool|Lighthouse|HeadlessChrome/i;
const RELOAD_KEY = 'fa_boot_reload';
const RELOAD_WINDOW_MS = 60_000;

let mounted = false;

/** Root layout calls this from onMount: from then on SvelteKit's own error handling applies. */
export function markAppMounted(): void {
	mounted = true;
}

export function isModuleLoadError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
	return MODULE_LOAD_ERROR.test(message);
}

/** One automatic reload per page per minute for people; never for crawlers or automation. */
export function shouldReloadAfterBootFailure(input: {
	userAgent: string;
	webdriver: boolean;
	path: string;
	now: number;
	storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}): boolean {
	if (input.webdriver || CRAWLER.test(input.userAgent) || !input.storage) return false;
	try {
		const [path, at] = (input.storage.getItem(RELOAD_KEY) ?? '').split('|');
		if (path === input.path && input.now - Number(at) < RELOAD_WINDOW_MS) return false;
		input.storage.setItem(RELOAD_KEY, `${input.path}|${input.now}`);
		return true;
	} catch {
		return false; // no storage = no loop protection, so don't reload
	}
}

/** True = abort startup and leave the server-rendered page in place (reloading once for people). */
export function keepServerPageOnBootFailure(error: unknown): boolean {
	if (mounted || !isModuleLoadError(error)) return false;
	let storage: Storage | null = null;
	try {
		storage = window.sessionStorage;
	} catch {
		storage = null;
	}
	const reload = shouldReloadAfterBootFailure({
		userAgent: navigator.userAgent,
		webdriver: Boolean(navigator.webdriver),
		path: window.location.pathname + window.location.search,
		now: Date.now(),
		storage
	});
	if (reload) window.location.reload();
	return true;
}

/** Test hook. */
export function resetBootGuardForTests(): void {
	mounted = false;
}
