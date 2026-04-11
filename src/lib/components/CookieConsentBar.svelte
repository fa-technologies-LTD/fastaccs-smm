<script lang="ts">
	import { onMount } from 'svelte';
	import {
		PRIVACY_OPEN_EVENT,
		readCookieConsent,
		saveCookieConsent,
		type CookieConsentLevel
	} from '$lib/helpers/privacyConsent';

	let visible = $state(false);
	let managing = $state(false);
	let selectedLevel = $state<CookieConsentLevel>('necessary');

	function applyAndClose(level: CookieConsentLevel) {
		saveCookieConsent(level);
		selectedLevel = level;
		visible = false;
		managing = false;
	}

	function openManager() {
		const existing = readCookieConsent();
		selectedLevel = existing ?? 'necessary';
		visible = true;
		managing = true;
	}

	onMount(() => {
		const existing = readCookieConsent();
		if (existing) {
			selectedLevel = existing;
		} else {
			visible = true;
		}

		const onOpenRequested = () => openManager();
		window.addEventListener(PRIVACY_OPEN_EVENT, onOpenRequested);

		return () => {
			window.removeEventListener(PRIVACY_OPEN_EVENT, onOpenRequested);
		};
	});
</script>

{#if visible}
	<div
		class="fixed inset-x-0 bottom-0 z-[80] border-t p-3 sm:p-4"
		style="background: rgba(7, 9, 12, 0.96); border-color: var(--border); backdrop-filter: blur(8px);"
	>
		<div class="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="text-sm" style="color: var(--text-muted);">
				We use necessary cookies to keep FastAccs running. With your permission, we also use analytics
				to improve performance.
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={() => applyAndClose('analytics')}
					class="rounded-full px-4 py-2 text-xs font-semibold sm:text-sm"
					style="background: var(--btn-primary-gradient); color: #04140C;"
				>
					Accept Analytics
				</button>
				<button
					type="button"
					onclick={() => applyAndClose('necessary')}
					class="rounded-full px-4 py-2 text-xs font-semibold sm:text-sm"
					style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
				>
					Necessary Only
				</button>
				<button
					type="button"
					onclick={() => (managing = !managing)}
					class="rounded-full px-4 py-2 text-xs font-semibold sm:text-sm"
					style="background: transparent; color: var(--link); border: 1px solid var(--border);"
				>
					Manage
				</button>
			</div>
		</div>

		{#if managing}
			<div
				class="mx-auto mt-3 max-w-6xl rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<p class="mb-2 text-sm font-semibold" style="color: var(--text);">Privacy Settings</p>
				<div class="grid gap-2 sm:grid-cols-2">
					<label class="flex cursor-pointer items-start gap-2 rounded-md p-2" style="background: var(--bg);">
						<input type="radio" bind:group={selectedLevel} value="necessary" />
						<span class="text-sm" style="color: var(--text-muted);">
							Necessary only: keeps login, cart, and security features working.
						</span>
					</label>
					<label class="flex cursor-pointer items-start gap-2 rounded-md p-2" style="background: var(--bg);">
						<input type="radio" bind:group={selectedLevel} value="analytics" />
						<span class="text-sm" style="color: var(--text-muted);">
							Analytics + necessary: helps us improve speed, bugs, and user experience.
						</span>
					</label>
				</div>
				<div class="mt-3 flex justify-end">
					<button
						type="button"
						onclick={() => applyAndClose(selectedLevel)}
						class="rounded-full px-4 py-2 text-xs font-semibold sm:text-sm"
						style="background: var(--btn-primary-gradient); color: #04140C;"
					>
						Save Choice
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
