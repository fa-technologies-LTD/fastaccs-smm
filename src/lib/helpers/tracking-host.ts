import { browser, dev } from '$app/environment';

/** Never send analytics from localhost, previews or third-party copies of the app. */
export function isProductionTrackingHost(): boolean {
	return (
		browser &&
		!dev &&
		['fastaccs.com', 'www.fastaccs.com', 'smm.fastaccs.com'].includes(
			window.location.hostname.toLowerCase()
		)
	);
}
