// A new announcement version permits one fresh impression without clearing other preferences.
export const BOOSTING_LAUNCH_NOTICE_KEY = 'fastaccs_boosting_back_20261021_v2';

/** Browsing only: never interrupt payment, an existing order, login or admin work. */
export function canShowBoostingLaunchNotice(path: string): boolean {
	return (
		['/', '/dashboard', '/numbers', '/how-it-works'].includes(path) ||
		/^\/(?:services|platforms|blog)(?:\/|$)/.test(path)
	);
}

let seenInMemory = false;

export function hasSeenBoostingLaunchNotice(): boolean {
	if (seenInMemory) return true;
	for (const name of ['localStorage', 'sessionStorage'] as const) {
		try {
			if (window[name].getItem(BOOSTING_LAUNCH_NOTICE_KEY) === '1') return true;
		} catch {
			// Storage restrictions must not break browsing.
		}
	}
	return false;
}

export function markBoostingLaunchNoticeSeen(): void {
	seenInMemory = true;
	for (const name of ['localStorage', 'sessionStorage'] as const) {
		try {
			window[name].setItem(BOOSTING_LAUNCH_NOTICE_KEY, '1');
		} catch {
			// Memory still prevents repeats during this visit if storage is blocked.
		}
	}
}
