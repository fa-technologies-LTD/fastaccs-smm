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
		class="fixed inset-x-0 bottom-0 z-[80] border-t p-3 sm:p-4"
		style="background: rgba(7, 9, 12, 0.96); border-color: var(--border); backdrop-filter: blur(8px);"
	>
		<div
			class="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-sm" style="color: var(--text-muted);">
				We use cookies to keep FastAccs secure and to improve your experience. By continuing to
				browse, you agree to our
				<a href="/cookies" class="underline" style="color: var(--link);">Cookie Policy</a>.
			</p>
			<button
				type="button"
				onclick={dismiss}
				class="self-end rounded-full px-4 py-2 text-xs font-semibold sm:self-auto sm:text-sm"
				style="background: var(--btn-primary-gradient); color: #04140C;"
			>
				Got it
			</button>
		</div>
	</div>
{/if}
