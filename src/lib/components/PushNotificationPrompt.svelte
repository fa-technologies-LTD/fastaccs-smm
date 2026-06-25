<script lang="ts">
	import { BellRing, X } from '$lib/icons';
	import {
		getPushPermissionState,
		isPushSupported,
		subscribeToPush
	} from '$lib/helpers/push-notifications';

	interface Props {
		isLoggedIn?: boolean;
	}

	let { isLoggedIn = false }: Props = $props();

	const DISMISSED_KEY = 'fastaccs_push_prompt_dismissed';

	let visible = $state(false);
	let busy = $state(false);
	let errorMessage = $state('');

	$effect(() => {
		if (!isLoggedIn || typeof window === 'undefined') return;
		if (!isPushSupported()) return;
		if (getPushPermissionState() !== 'default') return;
		if (window.sessionStorage.getItem(DISMISSED_KEY) === '1') return;

		visible = true;
	});

	function dismiss(): void {
		if (typeof window !== 'undefined') {
			window.sessionStorage.setItem(DISMISSED_KEY, '1');
		}
		visible = false;
	}

	async function enable(): Promise<void> {
		busy = true;
		errorMessage = '';
		const result = await subscribeToPush();
		busy = false;

		if (!result.success) {
			errorMessage = result.error || 'Could not enable notifications.';
			return;
		}

		dismiss();
	}
</script>

{#if visible}
	<div class="fixed inset-x-3 bottom-4 z-40 sm:inset-x-auto sm:right-5 sm:w-[360px]">
		<div
			class="rounded-2xl border p-4 shadow-2xl"
			style="background: rgba(13, 17, 23, 0.96); border-color: rgba(5,212,113,0.28); color: var(--text);"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
					style="background: rgba(5,212,113,0.14); border: 1px solid rgba(5,212,113,0.3); color: var(--primary);"
				>
					<BellRing size={18} />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="text-sm font-semibold" style="font-family: var(--font-head);">
								Get notified the moment stock lands
							</p>
							<p class="mt-1 text-xs leading-relaxed" style="color: var(--text-muted);">
								Enable browser notifications for restocks and new boosting services — faster than
								email.
							</p>
						</div>
						<button
							type="button"
							onclick={dismiss}
							aria-label="Dismiss notifications prompt"
							class="rounded-full p-1 transition hover:opacity-80"
							style="border: 1px solid var(--border); color: var(--text-muted);"
						>
							<X size={13} />
						</button>
					</div>
					{#if errorMessage}
						<p class="mt-2 text-xs" style="color: var(--status-danger);">{errorMessage}</p>
					{/if}
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={enable}
							disabled={busy}
							class="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
							style="background: rgba(5,212,113,0.16); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
						>
							{busy ? 'Enabling…' : 'Enable notifications'}
						</button>
						<button
							type="button"
							onclick={dismiss}
							class="rounded-full px-3 py-1.5 text-xs font-semibold"
							style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text);"
						>
							Not now
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
