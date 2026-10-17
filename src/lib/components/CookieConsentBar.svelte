<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		readCookieConsent,
		saveCookieConsent,
		type CookieConsentLevel
	} from '$lib/helpers/privacyConsent';

	let visible = $state(false);
	let notice = $state<HTMLDivElement>();
	$effect(() => {
		if (!visible || !notice) return;
		const resize = () =>
			document.documentElement.style.setProperty(
				'--cookie-notice-mobile-offset',
				`${Math.ceil(notice!.getBoundingClientRect().height) + 24}px`
			);
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(notice);
		return () => observer.disconnect();
	});

	function setMobileNoticeOffset(show: boolean) {
		if (typeof document === 'undefined') return;
		if (show) {
			document.documentElement.style.setProperty('--cookie-notice-mobile-offset', '6.5rem');
			return;
		}
		document.documentElement.style.removeProperty('--cookie-notice-mobile-offset');
	}

	// An explicit choice either way (Nigeria GAID 2025): optional cookies only after "Accept".
	function choose(level: CookieConsentLevel) {
		try {
			saveCookieConsent(level);
		} catch {
			/* storage denied: optional tracking stays off */
		}
		visible = false;
		setMobileNoticeOffset(false);
	}

	onMount(() => {
		if (!readCookieConsent()) {
			visible = true;
			setMobileNoticeOffset(true);
		}
	});

	onDestroy(() => setMobileNoticeOffset(false));
</script>

{#if visible}
	<div
		bind:this={notice}
		class="cookie-notice fixed right-3 bottom-3 left-3 z-[80] sm:right-5 sm:bottom-5 sm:left-auto"
		style="background: rgba(7, 9, 12, 0.94); border-color: var(--border); backdrop-filter: blur(12px);"
		role="status"
	>
		<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
			Cookies keep FastAccs secure. With your OK we also measure visits and which ads bring
			customers.
			<a href="/cookies" class="underline" style="color: var(--link);">Details</a>
		</p>
		<div class="mt-2 flex justify-end gap-2">
			<button
				type="button"
				onclick={() => choose('necessary')}
				class="rounded-full px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2"
				style="border: 1px solid var(--border); color: var(--text);"
			>
				Necessary only
			</button>
			<button
				type="button"
				onclick={() => choose('marketing')}
				class="rounded-full px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2"
				style="background: var(--btn-primary-gradient); color: #04140C;"
			>
				Accept
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
