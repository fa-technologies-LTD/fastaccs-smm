<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		Copy,
		CheckCircle,
		TrendingUp,
		DollarSign,
		ExternalLink,
		Wallet
	} from '$lib/icons';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatPrice, formatDate } from '$lib/helpers/utils';

	let { data }: { data: PageData } = $props();

	let copySuccess = $state('');
	let payoutRows = $state<any[]>([...(data.payouts || [])]);
	let payoutActionById = $state<Record<string, boolean>>({});

	const referralBaseUrl = 'https://smm.fastaccs.com';

	const payoutRequests = $derived(
		payoutRows.filter((row) => ['requested', 'under_review'].includes(String(row.status || '')))
	);

	function isUpdatingPayout(id: string): boolean {
		return Boolean(payoutActionById[id]);
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard.writeText(text);
		copySuccess = label;
		setTimeout(() => (copySuccess = ''), 1800);
	}

	function statusBadgeStyle(status: string): string {
		switch (String(status || '').toLowerCase()) {
			case 'requested':
				return 'background: rgba(105,109,250,0.14); border: 1px solid rgba(105,109,250,0.32); color: #b9beff;';
			case 'under_review':
				return 'background: rgba(249,115,22,0.12); border: 1px solid rgba(249,115,22,0.32); color: #fdba74;';
			case 'paid':
				return 'background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.28); color: var(--status-success);';
			case 'reversed':
				return 'background: rgba(226,75,74,0.12); border: 1px solid rgba(226,75,74,0.28); color: var(--status-danger);';
			default:
				return 'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: var(--text-muted);';
		}
	}

	function payoutAdminNote(payout: any): string {
		const meta = payout?.metadata;
		if (meta && typeof meta === 'object' && typeof meta.adminNotes === 'string') {
			return meta.adminNotes.trim();
		}
		return '';
	}

	async function updatePayoutStatus(
		transactionId: string,
		action: 'mark_paid' | 'mark_under_review' | 'mark_reversed',
		notes?: string
	) {
		if (isUpdatingPayout(transactionId)) return;
		const previous = [...payoutRows];
		const nextStatus = action === 'mark_paid' ? 'paid' : action === 'mark_under_review' ? 'under_review' : 'reversed';
		payoutActionById = { ...payoutActionById, [transactionId]: true };
		payoutRows = payoutRows.map((row) =>
			row.id === transactionId
				? {
						...row,
						status: nextStatus,
						metadata: notes ? { ...(row.metadata || {}), adminNotes: notes } : row.metadata
					}
				: row
		);
		try {
			const response = await fetch(`/api/admin/affiliates/${data.affiliate.id}/payouts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ transactionId, action, ...(notes ? { notes } : {}) })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to update payout');
			}
			addToast({
				type: 'success',
				title: 'Payout status updated',
				duration: 2800
			});
		} catch (error) {
			payoutRows = previous;
			addToast({
				type: 'error',
				title: error instanceof Error ? error.message : 'Failed to update payout status',
				duration: 3600
			});
		} finally {
			const nextMap = { ...payoutActionById };
			delete nextMap[transactionId];
			payoutActionById = nextMap;
		}
	}
</script>

<div class="min-h-screen bg-gray-50 p-3 sm:p-6">
	<div class="mb-6">
		<button
			onclick={() => goto('/admin/affiliates')}
			class="mb-4 flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Affiliates
		</button>

		<div class="flex items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">{data.affiliate.fullName || 'Affiliate details'}</h1>
				<p class="mt-1 text-gray-600">{data.affiliate.email}</p>
			</div>
		</div>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
		<div class="group rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Successful Orders</p>
					<p class="mt-2 text-3xl font-bold text-gray-900">{data.program.successfulOrders}</p>
				</div>
				<div class="rounded-full bg-blue-100 p-3">
					<CheckCircle class="size-5 text-blue-600 group-hover:scale-90" />
				</div>
			</div>
		</div>

		<div class="group rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Sales</p>
					<p class="mt-2 text-3xl font-bold text-green-600">{formatPrice(data.program.totalSales)}</p>
				</div>
				<div class="rounded-full bg-green-100 p-3">
					<TrendingUp class="size-5 text-green-600 group-hover:scale-90" />
				</div>
			</div>
		</div>

		<div class="group rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Store Credit Earned</p>
					<p class="mt-2 text-3xl font-bold text-purple-600">
						{formatPrice(data.ledgerSummary.totalStoreCreditEarned)}
					</p>
				</div>
				<div class="rounded-full bg-purple-100 p-3">
					<DollarSign class="size-5 text-purple-600 group-hover:scale-90" />
				</div>
			</div>
		</div>

		<div class="group rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Available Store Credit</p>
					<p class="mt-2 text-3xl font-bold text-orange-600">
						{formatPrice(data.ledgerSummary.availableStoreCredit)}
					</p>
				</div>
				<div class="rounded-full bg-orange-100 p-3">
					<Wallet class="size-5 text-orange-600 group-hover:scale-90" />
				</div>
			</div>
		</div>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Affiliate Information</h2>
			<div class="space-y-4">
				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">Affiliate Code</label>
					<div class="flex gap-2">
						<input
							type="text"
							value={data.program.affiliateCode}
							readonly
							class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm"
						/>
						<button
							onclick={() => copyToClipboard(data.program.affiliateCode, 'Code')}
							class="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700"
						>
							<Copy class="h-4 w-4" />
						</button>
					</div>
					{#if copySuccess === 'Code'}
						<p class="mt-1 text-xs text-green-600">Copied!</p>
					{/if}
				</div>

				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">Referral Link</label>
					<div class="flex gap-2">
						<input
							type="text"
							value={`${referralBaseUrl}/ref/${data.program.affiliateCode}`}
							readonly
							class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
						/>
						<button
							onclick={() =>
								copyToClipboard(`${referralBaseUrl}/ref/${data.program.affiliateCode}`, 'Link')}
							class="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700"
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
					<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusBadgeStyle(data.program.status)}>
						{data.program.status}
					</span>
				</div>

				<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
					<span class="text-sm text-gray-700">Joined Date</span>
					<span class="text-sm font-medium text-gray-900">{formatDate(data.program.createdAt)}</span>
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Store Credit Ledger Buckets</h2>
			<div class="grid grid-cols-2 gap-3 text-sm">
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
					<p class="text-gray-500">Available</p>
					<p class="font-semibold text-green-700">{formatPrice(data.ledgerSummary.availableStoreCredit)}</p>
				</div>
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
					<p class="text-gray-500">Pending</p>
					<p class="font-semibold text-gray-900">{formatPrice(data.ledgerSummary.pendingStoreCredit)}</p>
				</div>
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
					<p class="text-gray-500">Under review</p>
					<p class="font-semibold text-orange-600">{formatPrice(data.ledgerSummary.underReviewStoreCredit)}</p>
				</div>
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
					<p class="text-gray-500">Requested payout</p>
					<p class="font-semibold text-blue-700">{formatPrice(data.ledgerSummary.requestedStoreCredit)}</p>
				</div>
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
					<p class="text-gray-500">Paid payout</p>
					<p class="font-semibold text-green-700">{formatPrice(data.ledgerSummary.paidStoreCredit)}</p>
				</div>
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
					<p class="text-gray-500">Reversed</p>
					<p class="font-semibold text-red-600">{formatPrice(data.ledgerSummary.reversedStoreCredit)}</p>
				</div>
			</div>
		</div>
	</div>

	<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-gray-900">Payout Requests</h2>
			<span class="text-sm text-gray-500">Open: {payoutRequests.length}</span>
		</div>

		{#if payoutRows.length === 0}
			<p class="text-sm text-gray-500">No payout records yet.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Date</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Amount</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Status</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Reference</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each payoutRows as payout}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 text-sm text-gray-900">{formatDate(payout.createdAt)}</td>
								<td class="px-4 py-3 text-sm font-semibold text-gray-900">{formatPrice(payout.amount)}</td>
								<td class="px-4 py-3">
									<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusBadgeStyle(payout.status)}>
										{payout.status}
									</span>
									{#if payoutAdminNote(payout)}
										<p class="mt-1 max-w-[200px] text-[11px] text-gray-500">{payoutAdminNote(payout)}</p>
									{/if}
								</td>
								<td class="px-4 py-3 text-xs text-gray-500">{payout.reference || '-'}</td>
								<td class="px-4 py-3 text-xs">
									{#if ['requested', 'under_review'].includes(String(payout.status || '').toLowerCase())}
										<div class="flex gap-2">
											<button
												onclick={() => updatePayoutStatus(payout.id, 'mark_paid')}
												disabled={isUpdatingPayout(payout.id)}
												class="rounded bg-green-600 px-2 py-1 text-white hover:bg-green-700 disabled:opacity-60"
											>
												Mark paid
											</button>
											<button
												onclick={() => updatePayoutStatus(payout.id, 'mark_under_review')}
												disabled={isUpdatingPayout(payout.id)}
												class="rounded bg-orange-500 px-2 py-1 text-white hover:bg-orange-600 disabled:opacity-60"
											>
												Review
											</button>
											<button
												onclick={() => {
													const reason = window.prompt(
														'Reason for rejecting this payout (sent to the user by email):'
													);
													if (reason === null) return;
													updatePayoutStatus(payout.id, 'mark_reversed', reason.trim());
												}}
												disabled={isUpdatingPayout(payout.id)}
												class="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-60"
											>
												Reverse
											</button>
										</div>
									{:else}
										-
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	{#if data.monthlyBreakdown.length > 0}
		<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Monthly Performance</h2>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Month</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Orders</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Sales</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Store Credit</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each data.monthlyBreakdown as month}
							<tr>
								<td class="px-4 py-3 text-sm font-medium text-gray-900">{month.month}</td>
								<td class="px-4 py-3 text-sm text-gray-900">{month.orders}</td>
								<td class="px-4 py-3 text-sm text-gray-900">{formatPrice(month.sales)}</td>
								<td class="px-4 py-3 text-sm font-semibold text-green-700">{formatPrice(month.storeCredit)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<div class="rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 p-6">
			<h2 class="text-lg font-semibold text-gray-900">Referred Orders ({data.orders.length})</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Order</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Customer</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Items</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Total</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Store Credit</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Status</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Date</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#if data.orders.length === 0}
						<tr>
							<td colspan="8" class="px-6 py-12 text-center text-gray-500">No referred orders yet</td>
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
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">{order.itemCount}</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900">
									{formatPrice(order.totalAmount)}
								</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-green-700">
									{formatPrice(order.storeCredit)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusBadgeStyle(order.status)}>
										{order.status}
									</span>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">{formatDate(order.createdAt)}</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap">
									<a href="/admin/orders/{order.id}" class="flex items-center gap-1 text-blue-600 hover:text-blue-900">
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
