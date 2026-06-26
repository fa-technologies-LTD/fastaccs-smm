<script lang="ts">
	import { onMount } from 'svelte';
	import AffiliatePopupModal from './AffiliatePopupModal.svelte';
	import type { PendingSitePopup } from '$lib/services/site-popups';

	interface Props {
		isLoggedIn: boolean;
	}

	let { isLoggedIn }: Props = $props();

	const SESSION_CHECK_KEY = 'fastaccs_site_popup_checked';

	let activePopup = $state<PendingSitePopup | null>(null);

	function checkForPopup(): void {
		fetch('/api/site-popup')
			.then((response) => (response.ok ? response.json() : null))
			.then((result) => {
				if (result?.popup) {
					activePopup = result.popup;
				}
			})
			.catch((error) => {
				console.error('Failed to check for a pending site popup:', error);
			});
	}

	onMount(() => {
		if (!isLoggedIn) return;
		if (window.sessionStorage.getItem(SESSION_CHECK_KEY) === '1') return;

		window.sessionStorage.setItem(SESSION_CHECK_KEY, '1');
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
		})
			.then(() => {
				// A user can have more than one popup queued (e.g. boosting-launch
				// announcement and a bank-details review outcome) — recheck so the
				// next one isn't starved until a brand-new browser session.
				checkForPopup();
			})
			.catch((error) => {
				console.error('Failed to mark site popup as seen:', error);
			});
	}
</script>

{#if activePopup}
	<AffiliatePopupModal
		isOpen={true}
		onClose={dismissPopup}
		icon={activePopup.icon}
		title={activePopup.title}
		body={activePopup.body}
		ctaText={activePopup.ctaText}
		secondaryHref={activePopup.secondaryHref}
		secondaryText={activePopup.secondaryText}
	/>
{/if}
