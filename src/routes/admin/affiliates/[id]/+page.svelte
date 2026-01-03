<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		User,
		Copy,
		CheckCircle,
		TrendingUp,
		DollarSign,
		Calendar,
		BarChart3,
		Settings,
		ExternalLink,
		Wallet
	} from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatPrice, formatDate } from '$lib/helpers/utils';
	import CommissionModal from '$lib/components/modals/CommissionModal.svelte';
	import PayoutModal from '$lib/components/modals/PayoutModal.svelte';

	let { data }: { data: PageData } = $props();

	let copySuccess = $state('');
	let showCommissionModal = $state(false);
	let newCommissionRate = $state(data.program.commissionRate);
	let isUpdatingRate = $state(false);
	let commissionError = $state('');
	let showPayoutModal = $state(false);
	let payoutAmount = $state(0);
	let payoutMethod = $state('bank_transfer');
	let payoutReference = $state('');
	let payoutDate = $state(new Date().toISOString().split('T')[0]);
	let payoutNotes = $state('');
	let isProcessingPayout = $state(false);
	let payoutError = $state('');



	// Calculate unpaid commission
	const unpaidCommission = $derived(data.program.totalCommission - (data.program.totalPaid || 0));

	async function updateCommissionRate() {
		if (newCommissionRate < 0 || newCommissionRate > 100) {
			commissionError = 'Commission rate must be between 0 and 100';
			return;
		}

		isUpdatingRate = true;
		commissionError = '';

		try {
			const response = await fetch(`/api/admin/affiliates/${data.affiliate.id}/commission-rate`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ commissionRate: newCommissionRate })
			});

			const result = await response.json();
			if (result.success) {
				data.program.commissionRate = newCommissionRate;
				showCommissionModal = false;
				addToast({
					type: 'success',
					title: 'Commission rate updated successfully!',
					duration: 3000
				});
			} else {
				commissionError = result.error || 'Failed to update commission rate';
			}
		} catch (error) {
			commissionError = 'An error occurred while updating commission rate';
		} finally {
			isUpdatingRate = false;
		}
	}

	async function recordPayout() {
		if (payoutAmount <= 0) {
			payoutError = 'Payout amount must be greater than 0';
			return;
		}

		if (payoutAmount > unpaidCommission) {
			payoutError = `Payout amount cannot exceed unpaid commission (${formatPrice(unpaidCommission)})`;
			return;
		}

		if (!payoutMethod) {
			payoutError = 'Please select a payout method';
			return;
		}

		isProcessingPayout = true;
		payoutError = '';

		try {
			const response = await fetch(`/api/admin/affiliates/${data.program.id}/payouts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: payoutAmount,
					payoutMethod,
					payoutReference: payoutReference || null,
					payoutDate,
					notes: payoutNotes || null
				})
			});

			const result = await response.json();

			if (result.success) {
				// Update local state
				data.program.totalPaid = result.newTotalPaid;
				data.payouts = [
					{
						id: result.payout.id,
						amount: result.payout.amount,
						payoutMethod: result.payout.payoutMethod,
						payoutDate: result.payout.payoutDate,
						payoutReference: payoutReference || null,
						notes: payoutNotes || null,
						processedBy: null,
						createdAt: new Date()
					},
					...data.payouts
				];

				// Reset form
				showPayoutModal = false;
				payoutAmount = 0;
				payoutMethod = 'bank_transfer';
				payoutReference = '';
				payoutDate = new Date().toISOString().split('T')[0];
				payoutNotes = '';

				addToast({
					type: 'success',
					title: 'Payout recorded successfully!',
					message: `Paid ${formatPrice(result.payout.amount)} via ${result.payout.payoutMethod}`,
					duration: 3000
				});
			} else {
				payoutError = result.error || 'Failed to record payout';
			}
		} catch (error) {
			payoutError = 'An error occurred while recording payout';
		} finally {
			isProcessingPayout = false;
		}
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard.writeText(text);
		copySuccess = label;
		setTimeout(() => (copySuccess = ''), 2000);
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-800';
			case 'processing':
				return 'bg-blue-100 text-blue-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'failed':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<!-- Header -->
	<div class="mb-6">
		<button
			onclick={() => goto('/admin/affiliates')}
			class="mb-4 flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Affiliates
		</button>

		<div class="flex items-start justify-between">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">
					{data.affiliate.fullName || 'Affiliate Details'}
				</h1>
				<p class="mt-1 text-gray-600">{data.affiliate.email}</p>
			</div>

			<div class="flex gap-2">
				<button
					onclick={() => {
						
						showCommissionModal = true;
					}}
					class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
				>
					<Settings class="h-4 w-4" />
					Adjust Commission
				</button>
			</div>
		</div>
	</div>

	<!-- Stats Overview -->
	<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg border border-gray-200 bg-white p-6 group">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Referrals</p>
					<p class="mt-2 text-3xl font-bold text-gray-900">{data.program.totalReferrals}</p>
				</div>
				<div class="rounded-full bg-blue-100 p-3">
					<User class="size-5 group-hover:scale-80 group-hover:-rotate-20 text-blue-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6 group">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Sales</p>
					<p class="mt-2 text-3xl font-bold text-green-600">
						{formatPrice(data.program.totalSales)}
					</p>
				</div>
				<div class="rounded-full bg-green-100 p-3">
					<TrendingUp class="size-5 group-hover:scale-80 group-hover:-rotate-20 text-green-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6 group">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Commission</p>
					<p class="mt-2 text-3xl font-bold text-purple-600">
						{formatPrice(data.program.totalCommission)}
					</p>
				</div>
				<div class="rounded-full bg-purple-100 p-3">
					<DollarSign class="size-5 group-hover:scale-80 group-hover:-rotate-20 text-purple-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6 group">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Commission Rate</p>
					<p class="mt-2 text-3xl font-bold text-orange-600">{data.program.commissionRate}%</p>
				</div>
				<div class="rounded-full bg-orange-100 p-3">
					<BarChart3 class="size-5 group-hover:scale-80 group-hover:-rotate-20 text-orange-600" />
				</div>
			</div>
		</div>
	</div>

	<!-- Affiliate Info & Recent Performance -->
	<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Affiliate Information -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Affiliate Information</h2>
			<div class="space-y-4">
				<div>
					<label for="affiliate code" class="mb-1 block text-sm font-medium text-gray-700"
						>Affiliate Code</label
					>
					<div class="flex gap-2">
						<input
							type="text"
							value={data.program.affiliateCode}
							readonly
							class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm"
						/>
						<button
							onclick={() => copyToClipboard(data.program.affiliateCode, 'Code')}
							class="rounded-lg cursor-copy active:scale-90 bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700"
						>
							<Copy class="h-4 w-4" />
						</button>
					</div>
					{#if copySuccess === 'Code'}
						<p class="mt-1 text-xs text-green-600">Copied!</p>
					{/if}
				</div>

				<div>
					<label for="referral link" class="mb-1 block text-sm font-medium text-gray-700"
						>Referral Link</label
					>
					<div class="flex gap-2">
						<input
							type="text"
							value={`${page.url.origin}/?ref=${data.program.affiliateCode}`}
							readonly
							class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
						/>
						<button
							onclick={() =>
								copyToClipboard(`${page.url.origin}/?ref=${data.program.affiliateCode}`, 'Link')}
							class="rounded-lg cursor-copy active:scale-90 bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700"
						>
							<Copy class="h-4 w-4" />
						</button>
					</div>
					{#if copySuccess === 'Link'}
						<p class="mt-1 text-xs text-green-600">Copied!</p>
					{/if}
				</div>

				<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
					<span class="text-sm text-gray-700">Status</span>
					<span
						class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
					>
						<CheckCircle class="h-3 w-3" />
						{data.program.status}
					</span>
				</div>

				<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
					<span class="text-sm text-gray-700">Joined Date</span>
					<span class="text-sm font-medium text-gray-900">
						{formatDate(data.program.createdAt)}
					</span>
				</div>
			</div>
		</div>

		<!-- Recent Performance (Last 30 Days) -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Recent Performance (Last 30 Days)</h2>
			<div class="space-y-4">
				<div class="flex items-center justify-between rounded-lg bg-blue-50 p-4">
					<div class="flex items-center gap-3">
						<Calendar class="h-5 w-5 text-blue-600" />
						<span class="text-sm font-medium text-gray-700">Orders</span>
					</div>
					<span class="text-xl font-bold text-blue-600">{data.recentStats.orders}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg bg-green-50 p-4">
					<div class="flex items-center gap-3">
						<DollarSign class="h-5 w-5 text-green-600" />
						<span class="text-sm font-medium text-gray-700">Sales</span>
					</div>
					<span class="text-xl font-bold text-green-600">
						{formatPrice(data.recentStats.sales)}
					</span>
				</div>

				<div class="flex items-center justify-between rounded-lg bg-purple-50 p-4">
					<div class="flex items-center gap-3">
						<TrendingUp class="h-5 w-5 text-purple-600" />
						<span class="text-sm font-medium text-gray-700">Commission</span>
					</div>
					<span class="text-xl font-bold text-purple-600">
						{formatPrice(data.recentStats.commission)}
					</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Monthly Breakdown -->
	{#if data.monthlyBreakdown.length > 0}
		<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Monthly Performance</h2>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Month
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Orders
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Sales
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Commission
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each data.monthlyBreakdown as month}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900">
									{month.month}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{month.orders}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{formatPrice(month.sales)}
								</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-green-600">
									{formatPrice(month.commission)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Commission Payouts -->
	<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-gray-900">Commission Payouts</h2>
			<button
				onclick={() => (showPayoutModal = true)}
				disabled={unpaidCommission <= 0}
				class="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<DollarSign class="h-4 w-4" />
				Record Payout
			</button>
		</div>

		<!-- Payout Summary Cards -->
		<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
				<div class="flex items-center gap-2 text-sm font-medium text-gray-600">
					<TrendingUp class="h-4 w-4" />
					Total Earned
				</div>
				<div class="mt-2 text-2xl font-bold text-gray-900">
					{formatPrice(data.program.totalCommission)}
				</div>
			</div>

			<div class="rounded-lg border border-gray-200 bg-green-50 p-4">
				<div class="flex items-center gap-2 text-sm font-medium text-green-600">
					<DollarSign class="h-4 w-4" />
					Total Paid
				</div>
				<div class="mt-2 text-2xl font-bold text-green-600">
					{formatPrice(data.program.totalPaid)}
				</div>
			</div>

			<div class="rounded-lg border border-gray-200 bg-blue-50 p-4">
				<div class="flex items-center gap-2 text-sm font-medium text-blue-600">
					<Wallet class="h-4 w-4" />
					Unpaid Balance
				</div>
				<div class="mt-2 text-2xl font-bold text-blue-600">
					{formatPrice(unpaidCommission)}
				</div>
			</div>
		</div>

		<!-- Payout History -->
		{#if data.payouts.length > 0}
			<div class="overflow-x-auto">
				<h3 class="mb-3 text-sm font-semibold text-gray-900">Payout History</h3>
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Date
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Amount
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Method
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Reference
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Notes
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each data.payouts as payout}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{formatDate(payout.payoutDate)}
								</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-green-600">
									{formatPrice(payout.amount)}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{payout.payoutMethod}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{payout.payoutReference || '-'}
								</td>
								<td class="px-6 py-4 text-sm text-gray-900">
									{payout.notes || '-'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
				<Wallet class="mx-auto mb-2 h-8 w-8 text-gray-400" />
				<p class="text-sm font-medium text-gray-600">No payout history</p>
				<p class="mt-1 text-xs text-gray-500">Payouts will appear here once you record them</p>
			</div>
		{/if}
	</div>

	<!-- Orders List -->
	<div class="rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 p-6">
			<h2 class="text-lg font-semibold text-gray-900">
				Referred Orders ({data.orders.length})
			</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Order
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Customer
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Items
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Total
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Commission
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Date
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#if data.orders.length === 0}
						<tr>
							<td colspan="8" class="px-6 py-12 text-center text-gray-500">
								No orders yet using this affiliate code
							</td>
						</tr>
					{:else}
						{#each data.orders as order}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium text-gray-900">#{order.orderNumber}</div>
									<div class="text-xs text-gray-500">{order.id.slice(0, 8)}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium text-gray-900">{order.customerName}</div>
									<div class="text-xs text-gray-500">{order.customerEmail}</div>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{order.itemCount}
								</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900">
									{formatPrice(order.totalAmount)}
								</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-green-600">
									{formatPrice(order.commission)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getStatusColor(
											order.status
										)}"
									>
										{order.status}
									</span>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
									{formatDate(order.createdAt)}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap">
									<a
										href="/admin/orders/{order.id}"
										class="flex items-center gap-1 text-blue-600 transition-colors hover:text-blue-900"
									>
										View
										<ExternalLink class="h-3 w-3" />
									</a>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Commission Rate Adjustment Modal -->
{#if showCommissionModal}
	<CommissionModal
		bind:newCommissionRate={newCommissionRate}
		{commissionError}
		{updateCommissionRate}
		{isUpdatingRate}
		onclick={() => {
			showCommissionModal = false;
			commissionError = '';
		}}
	/>
{/if}

<!-- Record Payout Modal -->
{#if showPayoutModal}
	<PayoutModal
		{isProcessingPayout}
		{recordPayout}
		{payoutError}
		bind:payoutAmount={payoutAmount}
		bind:payoutMethod={payoutMethod}
		bind:payoutReference={payoutReference}
		bind:payoutDate={payoutDate}
		bind:payoutNotes={payoutNotes}
		{unpaidCommission}
		onclick={() => {
			showPayoutModal = false;
			payoutError = '';
		}}
	/>
{/if}
