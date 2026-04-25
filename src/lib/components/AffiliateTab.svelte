<script lang="ts">
	import { Share2, Copy, DollarSign, CheckCircle } from '@lucide/svelte';
	import { env as publicEnv } from '$env/dynamic/public';
	import { addToast } from '$lib/stores/toasts';
	import { copyToClipboard } from '$lib/helpers/utils';

	let { initialAffiliateData } = $props();

	let isLoadingAffiliate = $state(false);
	let affiliateData = $state<any>(initialAffiliateData);
	const referralBaseUrl = $derived(
		(publicEnv.PUBLIC_SITE_URL || publicEnv.PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : ''))
			.trim()
			.replace(/\/+$/, '') || 'https://smm.fastaccs.com'
	);
	const referralLink = $derived(
		affiliateData?.affiliateCode ? `${referralBaseUrl}/?ref=${affiliateData.affiliateCode}` : ''
	);

	async function enableAffiliate() {
		isLoadingAffiliate = true;
		try {
			const response = await fetch('/api/affiliate/enable', { method: 'POST' });
			const data = await response.json();

			if (data.success) {
				addToast({
					type: 'success',
					title: 'Affiliate mode enabled! Your code: ' + data.affiliateCode,
					duration: 3000
				});
				affiliateData = data;
			} else {
				addToast({
					type: 'error',
					title: data.error || 'Failed to enable affiliate mode',
					duration: 3000
				});
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Failed to enable affiliate mode',
				duration: 3000
			});
		} finally {
			isLoadingAffiliate = false;
		}
	}
</script>

<div
	class="rounded-[var(--r-md)] border border-[var(--border)]"
	style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
>
	<div class="border-b border-[var(--border)] p-6">
		<h2 class="text-base font-semibold" style="color: var(--text); font-family: var(--font-head);">
			Affiliate Program
		</h2>
		<p style="color: var(--text-muted);">Earn commissions by referring customers</p>
	</div>

	<div class="p-6">
		{#if affiliateData}
			<!-- Affiliate Stats -->
			<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
				<div
					class="rounded-[var(--r-md)] border border-[var(--border)] p-6"
					style="background: linear-gradient(180deg, rgba(105,109,250,0.12), rgba(170,173,255,0.08));"
				>
					<div class="flex items-center">
						<Share2 class="mr-3 h-8 w-8" style="color: var(--link);" />
						<div>
							<div
								class="text-sm font-semibold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								{affiliateData.totalReferrals}
							</div>
							<div style="color: var(--text-muted);">Total Referrals</div>
						</div>
					</div>
				</div>
				<div
					class="rounded-[var(--r-md)] border border-[var(--border)] p-6"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.12), rgba(13,145,82,0.08));"
				>
					<div class="flex items-center">
						<DollarSign class="mr-3 h-8 w-8" style="color: var(--primary);" />
						<div>
							<div
								class="text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								₦{affiliateData.totalSales.toLocaleString()}
							</div>
							<div style="color: var(--text-muted);">Total Sales</div>
						</div>
					</div>
				</div>
				<div
					class="rounded-[var(--r-md)] border border-[var(--border)] p-6"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.12), rgba(13,145,82,0.08));"
				>
					<div class="flex items-center">
						<CheckCircle class="mr-3 h-8 w-8" style="color: var(--primary-strong);" />
						<div>
							<div
								class="text-sm font-semibold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								₦{affiliateData.totalCommission.toLocaleString()}
							</div>
							<div style="color: var(--text-muted);">Total Commission</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Affiliate Code & Link -->
			<div class="space-y-4">
				<div>
					<label
						class="mb-2 block text-sm font-medium"
						style="color: var(--text-muted); font-family: var(--font-head);"
						>Your Affiliate Code</label
					>
					<div class="flex gap-2">
						<input
							type="text"
							value={affiliateData.affiliateCode}
							readonly
							class="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] px-4 py-3 font-mono text-lg font-bold"
							style="background: rgba(0,0,0,0.3); color: var(--text);"
						/>
						<button
							onclick={() =>
								copyToClipboard(affiliateData.affiliateCode, {
									label: 'Affiliate code',
									showToast: addToast
								})}
							class="rounded-full px-4 py-2 transition-all hover:-translate-y-0.5"
							style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C;"
						>
							<Copy class="h-5 w-5" />
						</button>
					</div>
				</div>

				<div>
					<label
						class="mb-2 block text-sm font-medium"
						style="color: var(--text-muted); font-family: var(--font-head);">Referral Link</label
					>
						<div class="flex gap-2">
							<input
								type="text"
								value={referralLink}
								readonly
								class="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] px-4 py-3 text-sm"
								style="background: rgba(0,0,0,0.3); color: var(--text);"
							/>
							<button
								onclick={() =>
									copyToClipboard(referralLink, {
										label: 'Referral link',
										showToast: addToast
									})}
							class="rounded-full px-4 py-2 transition-all hover:-translate-y-0.5"
							style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C;"
						>
							<Copy class="h-5 w-5" />
						</button>
					</div>
				</div>

				<div
					class="rounded-[var(--r-sm)] p-4"
					style="background: rgba(5,212,113,0.08); border: 1px solid rgba(5,212,113,0.2);"
				>
					<p class="text-sm" style="color: var(--text-muted);">
						<strong style="color: var(--text);">How it works:</strong> Share your referral link with
						friends. When they make a purchase using your code, you'll earn
						<strong style="color: var(--primary);">{affiliateData.commissionRate}%</strong> commission
						on their order total.
					</p>
				</div>
			</div>
		{:else}
			<!-- Enable Affiliate Mode -->
			<div class="py-12 text-center">
				<Share2 class="mx-auto mb-4 h-16 w-16" style="color: var(--text-dim);" />
				<h3
					class="mb-2 text-base font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Join Our Affiliate Program
				</h3>
				<p class="mx-auto mb-6 max-w-md" style="color: var(--text-muted);">
					Become an affiliate and earn commissions by referring customers. Get your unique code and
					start earning today!
				</p>
				<button
					onclick={enableAffiliate}
					disabled={isLoadingAffiliate}
					class="cursor-pointer rounded-full px-8 py-3 font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:active:translate-y-0"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C; box-shadow: var(--glow-primary);"
				>
					{isLoadingAffiliate ? 'Enabling...' : 'Become an Affiliate'}
				</button>
			</div>
		{/if}
	</div>
</div>
