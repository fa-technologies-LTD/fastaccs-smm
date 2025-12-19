<script lang="ts">
	import { Share2, Copy, DollarSign, CheckCircle } from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import { copyToClipboard } from '$lib/helpers/utils';

	let { initialAffiliateData } = $props();

	let isLoadingAffiliate = $state(false);
	let affiliateData = $state<any>(initialAffiliateData);

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

<div class="rounded-lg border border-gray-200 bg-white">
	<div class="border-b border-gray-200 p-6">
		<h2 class="text-xl font-semibold">Affiliate Program</h2>
		<p class="text-gray-600">Earn commissions by referring customers</p>
	</div>

	<div class="p-6">
		{#if affiliateData}
			<!-- Affiliate Stats -->
			<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
				<div
					class="rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100 p-6"
				>
					<div class="flex items-center">
						<Share2 class="mr-3 h-8 w-8 text-blue-600" />
						<div>
							<div class="text-2xl font-bold text-gray-900">{affiliateData.totalReferrals}</div>
							<div class="text-gray-600">Total Referrals</div>
						</div>
					</div>
				</div>
				<div
					class="rounded-lg border border-gray-200 bg-gradient-to-br from-green-50 to-green-100 p-6"
				>
					<div class="flex items-center">
						<DollarSign class="mr-3 h-8 w-8 text-green-600" />
						<div>
							<div class="text-2xl font-bold text-gray-900">
								₦{affiliateData.totalSales.toLocaleString()}
							</div>
							<div class="text-gray-600">Total Sales</div>
						</div>
					</div>
				</div>
				<div
					class="rounded-lg border border-gray-200 bg-gradient-to-br from-purple-50 to-purple-100 p-6"
				>
					<div class="flex items-center">
						<CheckCircle class="mr-3 h-8 w-8 text-purple-600" />
						<div>
							<div class="text-2xl font-bold text-gray-900">
								₦{affiliateData.totalCommission.toLocaleString()}
							</div>
							<div class="text-gray-600">Total Commission</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Affiliate Code & Link -->
			<div class="space-y-4">
				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">Your Affiliate Code</label>
					<div class="flex gap-2">
						<input
							type="text"
							value={affiliateData.affiliateCode}
							readonly
							class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-lg font-bold"
						/>
						<button
							onclick={() =>
								copyToClipboard(affiliateData.affiliateCode, {
									label: 'Affiliate code',
									showToast: addToast
								})}
							class="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 hover:scale-105 active:scale-95"
						>
							<Copy class="h-5 w-5" />
						</button>
					</div>
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">Referral Link</label>
					<div class="flex gap-2">
						<input
							type="text"
							value={`https://fastaccs.vercel.app/?ref=${affiliateData.affiliateCode}`}
							readonly
							class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm"
						/>
						<button
							onclick={() =>
								copyToClipboard(`https://fastaccs.vercel.app/?ref=${affiliateData.affiliateCode}`, {
									label: 'Referral link',
									showToast: addToast
								})}
							class="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 hover:scale-105 active:scale-95"
						>
							<Copy class="h-5 w-5" />
						</button>
					</div>
				</div>

				<div class="rounded-lg bg-blue-50 p-4">
					<p class="text-sm text-gray-700">
						<strong>How it works:</strong> Share your referral link with friends. When they make a
						purchase using your code, you'll earn
						<strong>{affiliateData.commissionRate}%</strong> commission on their order total.
					</p>
				</div>
			</div>
		{:else}
			<!-- Enable Affiliate Mode -->
			<div class="py-12 text-center">
				<Share2 class="mx-auto mb-4 h-16 w-16 text-gray-400" />
				<h3 class="mb-2 text-xl font-semibold text-gray-900">Join Our Affiliate Program</h3>
				<p class="mx-auto mb-6 max-w-md text-gray-600">
					Become an affiliate and earn commissions by referring customers. Get your unique code and
					start earning today!
				</p>
				<button
					onclick={enableAffiliate}
					disabled={isLoadingAffiliate}
					class="cursor-pointer rounded-lg bg-blue-600 px-8 py-3 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				>
					{isLoadingAffiliate ? 'Enabling...' : 'Become an Affiliate'}
				</button>
			</div>
		{/if}
	</div>
</div>
