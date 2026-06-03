<script lang="ts">
	import { onMount } from 'svelte';
	import { BriefcaseBusiness, X } from '$lib/icons';

	interface Props {
		user?: { id?: string; isAffiliateEnabled?: boolean } | null;
		currentPath?: string | null;
	}

	let { user = null, currentPath = '/' }: Props = $props();

	let visible = $state(false);
	let remainingSpend = $state(0);
	let progressPercent = $state(0);

	const dismissedKey = 'fastaccs_affiliate_access_nudge_dismissed';
	const currentPathValue = $derived(String(currentPath || '/'));
	const shouldSkipPath = $derived(
		currentPathValue.startsWith('/admin') ||
			currentPathValue.startsWith('/auth') ||
			currentPathValue.startsWith('/affiliate') ||
			currentPathValue.startsWith('/dashboard') ||
			currentPathValue.startsWith('/checkout') ||
			currentPathValue.startsWith('/order')
	);

	function formatMoney(value: number): string {
		return `₦${Math.max(0, Math.round(value)).toLocaleString()}`;
	}

	function dismiss(): void {
		visible = false;
		if (typeof window !== 'undefined') {
			window.sessionStorage.setItem(dismissedKey, '1');
		}
	}

	onMount(async () => {
		if (!user || user.isAffiliateEnabled || shouldSkipPath) return;
		if (window.sessionStorage.getItem(dismissedKey) === '1') return;

		try {
			const response = await fetch('/api/affiliate/stats');
			const result = await response.json();
			const dashboard = result?.data?.dashboard;
			if (!response.ok || !result?.success || !dashboard) return;

			const unlocked = Boolean(dashboard.unlocked || dashboard.isActive || dashboard.eligible);
			const lifetimeSpend = Number(dashboard.lifetimeCompletedSpend || 0);
			const threshold = Number(dashboard.unlockThreshold || 50000);
			const remaining = Math.max(0, threshold - lifetimeSpend);

			if (unlocked || lifetimeSpend < 20000 || remaining <= 0) return;

			remainingSpend = remaining;
			progressPercent =
				threshold > 0 ? Math.min(100, Math.round((lifetimeSpend / threshold) * 100)) : 0;
			visible = true;
		} catch (error) {
			console.warn('[affiliate-nudge] skipped:', error);
		}
	});
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
					<BriefcaseBusiness size={18} />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="text-sm font-semibold" style="font-family: var(--font-head);">
								You are close to affiliate access
							</p>
							<p class="mt-1 text-xs leading-relaxed" style="color: var(--text-muted);">
								Spend about {formatMoney(remainingSpend)} more to unlock referral earning.
							</p>
						</div>
						<button
							type="button"
							onclick={dismiss}
							aria-label="Dismiss affiliate access reminder"
							class="rounded-full p-1 transition hover:opacity-80"
							style="border: 1px solid var(--border); color: var(--text-muted);"
						>
							<X size={13} />
						</button>
					</div>
					<div
						class="mt-3 h-1.5 overflow-hidden rounded-full"
						style="background: rgba(255,255,255,0.08);"
					>
						<div
							class="h-full rounded-full"
							style="width: {progressPercent}%; background: linear-gradient(90deg, rgba(5,212,113,0.95), rgba(202,219,46,0.95));"
						></div>
					</div>
					<div class="mt-3 flex flex-wrap gap-2">
						<a
							href="/dashboard?tab=affiliate"
							class="rounded-full px-3 py-1.5 text-xs font-semibold"
							style="background: rgba(5,212,113,0.16); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
						>
							View progress
						</a>
						<a
							href="/affiliate"
							class="rounded-full px-3 py-1.5 text-xs font-semibold"
							style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text);"
						>
							Learn more
						</a>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
