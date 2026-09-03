<script lang="ts">
	import { onMount } from 'svelte';
	import { readCookieConsent, saveCookieConsent } from '$lib/helpers/privacyConsent';

	let visible = $state(false);

	function dismiss() {
		saveCookieConsent('analytics');
		visible = false;
	}

	onMount(() => {
		if (!readCookieConsent()) {
			visible = true;
		}
	});
</script>

{#if visible}
	<div
		class="cookie-notice fixed right-3 bottom-3 left-3 z-[80] sm:right-5 sm:bottom-5 sm:left-auto"
		style="background: rgba(7, 9, 12, 0.94); border-color: var(--border); backdrop-filter: blur(12px);"
		role="status"
	>
		<div class="flex items-center justify-between gap-3">
			<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
				Cookies keep FastAccs secure.
				<a href="/cookies" class="underline" style="color: var(--link);">Details</a>
			</p>
			<button
				type="button"
				onclick={dismiss}
				class="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2"
				style="background: var(--btn-primary-gradient); color: #04140C;"
			>
				Got it
			</button>
		</div>
	</div>
{/if}

<style>
	.cookie-notice {
		max-width: 25rem;
		border-width: 1px;
		border-radius: 0.9rem;
		padding: 0.65rem 0.75rem;
		box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38);
	}
</style>
