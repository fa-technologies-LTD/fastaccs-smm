<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AffiliatePopupModal from './AffiliatePopupModal.svelte';
	import BoostingLaunchNotice from './BoostingLaunchNotice.svelte';
	import {
		canShowBoostingLaunchNotice,
		hasSeenBoostingLaunchNotice,
		markBoostingLaunchNoticeSeen
	} from '$lib/helpers/boosting-launch-notice';
	import type { PendingSitePopup } from '$lib/services/site-popups';
	import { cart } from '$lib/stores/cart.svelte';

	interface Props {
		isLoggedIn: boolean;
	}

	let { isLoggedIn }: Props = $props();

	const SESSION_CHECK_KEY = 'fastaccs_site_popup_checked';

	let activePopup = $state<PendingSitePopup | null>(null);
	let showBoostingLaunch = $state(false);
	let launchChecked = false;
	let launchShownThisVisit = false;
	let launchChecking = $state(false);
	// A buyer with items in the cart is mid-purchase: no pop-ups until they are done.
	const buyingNow = () => cart.itemCount > 0;
	// Offers read as promos, launches as announcements, account news as a plain notice.
	function popupKind(type: string): 'announcement' | 'promo' | 'info' {
		if (['affiliate_refresh', 'first_purchase', 'boosting_crosssell'].includes(type))
			return 'promo';
		if (type === 'bank_details_outcome') return 'info';
		return 'announcement';
	}

	$effect(() => {
		const eligible = canShowBoostingLaunchNotice(page.url.pathname) && !buyingNow();
		if (!eligible) showBoostingLaunch = false;
		if (!eligible || launchChecked || hasSeenBoostingLaunchNotice()) return;
		const controller = new AbortController();
		launchChecking = true;
		fetch('/api/boosting-offers', { signal: controller.signal })
			.then((response) => (response.ok ? response.json() : null))
			.then((result) => {
				if (controller.signal.aborted) return;
				launchChecked = true;
				if (
					result?.automationReady === true &&
					result?.managedRolloutActive === true &&
					Array.isArray(result.data) &&
					result.data.length > 0 &&
					canShowBoostingLaunchNotice(page.url.pathname) &&
					!buyingNow() &&
					!hasSeenBoostingLaunchNotice()
				) {
					activePopup = null;
					launchShownThisVisit = true;
					showBoostingLaunch = true;
					// Do not stack another marketing modal immediately after this announcement.
					try {
						window.sessionStorage.setItem(SESSION_CHECK_KEY, '1');
					} catch {
						/* optional storage */
					}
				}
			})
			.catch(() => {
				if (!controller.signal.aborted) launchChecked = true;
			})
			.finally(() => {
				launchChecking = false;
			});
		return () => controller.abort();
	});
	function isAdminPath(): boolean {
		return page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/');
	}

	function checkForPopup(): void {
		fetch('/api/site-popup')
			.then((response) => (response.ok ? response.json() : null))
			.then((result) => {
				if (
					result?.popup &&
					isLoggedIn &&
					!isAdminPath() &&
					!showBoostingLaunch &&
					!buyingNow() &&
					canShowBoostingLaunchNotice(page.url.pathname) &&
					!(
						hasSeenBoostingLaunchNotice() &&
						['boosting_refresh', 'boosting_launch'].includes(result.popup.type)
					)
				) {
					activePopup = result.popup;
				}
			})
			.catch((error) => {
				console.error('Failed to check for a pending site popup:', error);
			});
	}

	$effect(() => {
		if (
			!isLoggedIn ||
			isAdminPath() ||
			!canShowBoostingLaunchNotice(page.url.pathname) ||
			buyingNow()
		) {
			activePopup = null;
			return;
		}
		if (launchChecking || showBoostingLaunch || launchShownThisVisit) return;
		try {
			if (window.sessionStorage.getItem(SESSION_CHECK_KEY) === '1') return;

			window.sessionStorage.setItem(SESSION_CHECK_KEY, '1');
		} catch {
			return;
		}
		checkForPopup();
	});

	function dismissPopup(): void {
		const popup = activePopup;
		if (!popup) return;
		activePopup = null;
		fetch('/api/dashboard/popup-seen', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: popup.type })
		}).catch((error) => {
			console.error('Failed to mark site popup as seen:', error);
		});
	}

	// A clicked catalog item marks the popup seen (so it won't reappear) and then
	// navigates to that product — client-side, so the fire-and-forget POST completes.
	function handleItemNavigate(href: string): void {
		const popup = activePopup;
		activePopup = null;
		if (popup) {
			fetch('/api/dashboard/popup-seen', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: popup.type })
			}).catch((error) => {
				console.error('Failed to mark site popup as seen:', error);
			});
		}
		goto(href);
	}
</script>

{#if showBoostingLaunch}
	<BoostingLaunchNotice
		onClose={() => {
			showBoostingLaunch = false;
		}}
		onShown={markBoostingLaunchNoticeSeen}
	/>
{:else if activePopup}
	<AffiliatePopupModal
		isOpen={true}
		onClose={dismissPopup}
		icon={activePopup.icon}
		title={activePopup.title}
		body={activePopup.body}
		bodyItems={activePopup.bodyItems}
		ctaText={activePopup.ctaText}
		secondaryHref={activePopup.secondaryHref}
		secondaryText={activePopup.secondaryText}
		onItemNavigate={handleItemNavigate}
		kind={popupKind(activePopup.type)}
		accent={activePopup.type === 'numbers_launch' || activePopup.type === 'numbers_improved'
			? '#0ea5e9'
			: null}
		iconKind={activePopup.type === 'numbers_launch' || activePopup.type === 'numbers_improved'
			? 'phone'
			: 'emoji'}
	/>
{/if}
