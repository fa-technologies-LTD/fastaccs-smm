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
	let bankDetails = $state<any>(data.bankDetails || null);
	let bankDetailsActionLoading = $state(false);

	const referralBaseUrl = 'https://smm.fastaccs.com';

	const popupEngagement = [
		{ label: 'Welcome', seenAt: data.affiliate.popupsSeen.welcome },
		{ label: 'Progress 50%', seenAt: data.affiliate.popupsSeen.progress50 },
		{ label: 'Progress 80%', seenAt: data.affiliate.popupsSeen.progress80 },
		{ label: 'Progress 95%', seenAt: data.affiliate.popupsSeen.progress95 },
		{ label: 'Unlocked', seenAt: data.affiliate.popupsSeen.unlocked }
	];

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
			case 'approved':
				return 'background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.28); color: var(--status-success);';
			case 'reversed':
			case 'rejected':
				return 'background: rgba(226,75,74,0.12); border: 1px solid rgba(226,75,74,0.28); color: var(--status-danger);';
			case 'pending':
				return 'background: rgba(202,219,46,0.12); border: 1px solid rgba(202,219,46,0.3); color: var(--status-warning);';
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

	async function updateBankDetailsStatus(action: 'approve' | 'reject', reason?: string) {
		if (bankDetailsActionLoading) return;
		bankDetailsActionLoading = true;
		try {
			const response = await fetch(`/api/admin/affiliates/${data.affiliate.id}/bank-details`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, ...(reason ? { reason } : {}) })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to update bank details submission');
			}
			bankDetails = result.submission;
			addToast({
				type: 'success',
				title: action === 'approve' ? 'Bank details approved' : 'Bank details rejected',
				duration: 2800
			});
		} catch (error) {
			addToast({
				type: 'error',
				title: error instanceof Error ? error.message : 'Failed to update bank details submission',
				duration: 3600
			});
		} finally {
			bankDetailsActionLoading = false;
		}
	}
</script>

<div class="p-3 sm:p-6">
	<div class="mb-6">
		<button
			onclick={() => goto('/admin/affiliates')}
			class="mb-4 flex items-center gap-2 transition-colors"
			style="color: var(--text-muted);"
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Affiliates
		</button>

		<div class="flex items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold" style="color: var(--text); font-family: var(--font-head);">
					{data.affiliate.fullName || 'Affiliate details'}
				</h1>
				<p class="mt-1" style="color: var(--text-muted);">{data.affiliate.email}</p>
			</div>
		</div>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
		<div class="group rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Successful Orders</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--text);">{data.program.successfulOrders}</p>
				</div>
				<div class="rounded-full p-3" style="background: rgba(105,109,250,0.14);">
					<CheckCircle class="size-5 group-hover:scale-90" style="color: var(--fa-blue-500);" />
				</div>
			</div>
		</div>

		<div class="group rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Total Sales</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--status-success);">{formatPrice(data.program.totalSales)}</p>
				</div>
				<div class="rounded-full p-3" style="background: var(--status-success-bg);">
					<TrendingUp class="size-5 group-hover:scale-90" style="color: var(--status-success);" />
				</div>
			</div>
		</div>

		<div class="group rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Cash Earned</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--fa-blue-300);">
						{formatPrice(data.ledgerSummary.totalStoreCreditEarned)}
					</p>
				</div>
				<div class="rounded-full p-3" style="background: rgba(170,173,255,0.14);">
					<DollarSign class="size-5 group-hover:scale-90" style="color: var(--fa-blue-300);" />
				</div>
			</div>
		</div>

		<div class="group rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Available Cash</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--status-warning);">
						{formatPrice(data.ledgerSummary.availableStoreCredit)}
					</p>
				</div>
				<div class="rounded-full p-3" style="background: var(--status-warning-bg);">
					<Wallet class="size-5 group-hover:scale-90" style="color: var(--status-warning);" />
				</div>
			</div>
		</div>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
		<div class="rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
			<h2 class="mb-4 text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">Affiliate Information</h2>
			<div class="space-y-4">
				<div>
					<label for="affiliate-promo-code" class="mb-1 block text-sm font-medium" style="color: var(--text-muted);"
						>Affiliate Promo Code</label
					>
					<div class="flex gap-2">
						<input
							id="affiliate-promo-code"
							type="text"
							value={data.program.affiliateCode}
							readonly
							class="flex-1 rounded-lg border px-3 py-2 font-mono text-sm"
							style="border-color: var(--border); background: var(--bg-elev-2); color: var(--text);"
						/>
						<button
							onclick={() => copyToClipboard(data.program.affiliateCode, 'Code')}
							class="cursor-pointer rounded-lg px-3 py-2 transition-colors"
							style="background: var(--fa-blue-500); color: var(--fa-blue-950);"
						>
							<Copy class="h-4 w-4" />
						</button>
					</div>
					{#if copySuccess === 'Code'}
						<p class="mt-1 text-xs" style="color: var(--status-success);">Copied!</p>
					{/if}
				</div>

				<div>
					<label for="affiliate-referral-link" class="mb-1 block text-sm font-medium" style="color: var(--text-muted);"
						>Referral Link</label
					>
					<div class="flex gap-2">
						<input
							id="affiliate-referral-link"
							type="text"
							value={`${referralBaseUrl}/ref/${data.program.affiliateCode}`}
							readonly
							class="flex-1 rounded-lg border px-3 py-2 text-sm"
							style="border-color: var(--border); background: var(--bg-elev-2); color: var(--text);"
						/>
						<button
							onclick={() =>
								copyToClipboard(`${referralBaseUrl}/ref/${data.program.affiliateCode}`, 'Link')}
							class="cursor-pointer rounded-lg px-3 py-2 transition-colors"
							style="background: var(--fa-blue-500); color: var(--fa-blue-950);"
						>
							<Copy class="h-4 w-4" />
						</button>
					</div>
					{#if copySuccess === 'Link'}
						<p class="mt-1 text-xs" style="color: var(--status-success);">Copied!</p>
					{/if}
				</div>

				<div class="flex items-center justify-between rounded-lg p-3" style="background: var(--bg-elev-2);">
					<span class="text-sm" style="color: var(--text-muted);">Status</span>
					<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusBadgeStyle(data.program.status)}>
						{data.program.status}
					</span>
				</div>

				<div class="flex items-center justify-between rounded-lg p-3" style="background: var(--bg-elev-2);">
					<span class="text-sm" style="color: var(--text-muted);">Joined Date</span>
					<span class="text-sm font-medium" style="color: var(--text);">{formatDate(data.program.createdAt)}</span>
				</div>
			</div>
		</div>

		<div class="rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
			<h2 class="mb-4 text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">Cash Ledger Buckets</h2>
			<div class="grid grid-cols-2 gap-3 text-sm">
				<div class="rounded-lg border p-3" style="border-color: var(--border); background: var(--bg-elev-2);">
					<p style="color: var(--text-dim);">Available</p>
					<p class="font-semibold" style="color: var(--status-success);">{formatPrice(data.ledgerSummary.availableStoreCredit)}</p>
				</div>
				<div class="rounded-lg border p-3" style="border-color: var(--border); background: var(--bg-elev-2);">
					<p style="color: var(--text-dim);">Pending</p>
					<p class="font-semibold" style="color: var(--text);">{formatPrice(data.ledgerSummary.pendingStoreCredit)}</p>
				</div>
				<div class="rounded-lg border p-3" style="border-color: var(--border); background: var(--bg-elev-2);">
					<p style="color: var(--text-dim);">Under review</p>
					<p class="font-semibold" style="color: var(--status-warning);">{formatPrice(data.ledgerSummary.underReviewStoreCredit)}</p>
				</div>
				<div class="rounded-lg border p-3" style="border-color: var(--border); background: var(--bg-elev-2);">
					<p style="color: var(--text-dim);">Requested payout</p>
					<p class="font-semibold" style="color: var(--fa-blue-300);">{formatPrice(data.ledgerSummary.requestedStoreCredit)}</p>
				</div>
				<div class="rounded-lg border p-3" style="border-color: var(--border); background: var(--bg-elev-2);">
					<p style="color: var(--text-dim);">Paid payout</p>
					<p class="font-semibold" style="color: var(--status-success);">{formatPrice(data.ledgerSummary.paidStoreCredit)}</p>
				</div>
				<div class="rounded-lg border p-3" style="border-color: var(--border); background: var(--bg-elev-2);">
					<p style="color: var(--text-dim);">Reversed</p>
					<p class="font-semibold" style="color: var(--status-danger);">{formatPrice(data.ledgerSummary.reversedStoreCredit)}</p>
				</div>
			</div>
		</div>
	</div>

	<div class="mb-6 rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
		<h2 class="mb-4 text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">Dashboard Pop-ups</h2>
		<div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
			{#each popupEngagement as item}
				<div class="rounded-lg border p-3" style="border-color: var(--border); background: var(--bg-elev-2);">
					<p style="color: var(--text-dim);">{item.label}</p>
					<p class="font-semibold" style={item.seenAt ? 'color: var(--status-success);' : 'color: var(--text-dim);'}>
						{item.seenAt ? `Seen ${formatDate(item.seenAt)}` : 'Not yet seen'}
					</p>
				</div>
			{/each}
		</div>
	</div>

	<div class="mb-6 rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">Payout Requests</h2>
			<span class="text-sm" style="color: var(--text-dim);">Open: {payoutRequests.length}</span>
		</div>

		{#if payoutRows.length === 0}
			<p class="text-sm" style="color: var(--text-dim);">No payout records yet.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead style="background: var(--bg-elev-2);">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Date</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Amount</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Status</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Reference</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y" style="--tw-divide-opacity: 1; border-color: var(--border);">
						{#each payoutRows as payout}
							<tr style="border-color: var(--border);">
								<td class="px-4 py-3 text-sm" style="color: var(--text);">{formatDate(payout.createdAt)}</td>
								<td class="px-4 py-3 text-sm font-semibold" style="color: var(--text);">{formatPrice(payout.amount)}</td>
								<td class="px-4 py-3">
									<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusBadgeStyle(payout.status)}>
										{payout.status}
									</span>
									{#if payoutAdminNote(payout)}
										<p class="mt-1 max-w-[200px] text-[11px]" style="color: var(--text-dim);">{payoutAdminNote(payout)}</p>
									{/if}
								</td>
								<td class="px-4 py-3 text-xs" style="color: var(--text-dim);">{payout.reference || '-'}</td>
								<td class="px-4 py-3 text-xs">
									{#if ['requested', 'under_review'].includes(String(payout.status || '').toLowerCase())}
										<div class="flex gap-2">
											<button
												onclick={() => updatePayoutStatus(payout.id, 'mark_paid')}
												disabled={isUpdatingPayout(payout.id)}
												class="rounded px-2 py-1 disabled:opacity-60"
												style="background: var(--status-success); color: var(--bg);"
											>
												Mark paid
											</button>
											<button
												onclick={() => updatePayoutStatus(payout.id, 'mark_under_review')}
												disabled={isUpdatingPayout(payout.id)}
												class="rounded px-2 py-1 disabled:opacity-60"
												style="background: var(--status-warning); color: var(--bg);"
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
												class="rounded px-2 py-1 disabled:opacity-60"
												style="background: var(--status-danger); color: var(--bg);"
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

	<div class="mb-6 rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">Bank Details Review</h2>
			{#if bankDetails}
				<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusBadgeStyle(bankDetails.status)}>
					{bankDetails.status}
				</span>
			{/if}
		</div>

		{#if !bankDetails}
			<p class="text-sm" style="color: var(--text-dim);">No bank details submitted yet.</p>
		{:else}
			<div class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
				<div>
					<p style="color: var(--text-dim);">Bank name</p>
					<p class="font-medium" style="color: var(--text);">{bankDetails.bankName}</p>
				</div>
				<div>
					<p style="color: var(--text-dim);">Account number</p>
					<p class="font-medium" style="color: var(--text);">{bankDetails.accountNumber}</p>
				</div>
				<div>
					<p style="color: var(--text-dim);">Account name</p>
					<p class="font-medium" style="color: var(--text);">{bankDetails.accountName}</p>
				</div>
				<div>
					<p style="color: var(--text-dim);">Phone</p>
					<p class="font-medium" style="color: var(--text);">{bankDetails.phone}</p>
				</div>
				{#if bankDetails.feedback}
					<div class="sm:col-span-2">
						<p style="color: var(--text-dim);">Customer feedback</p>
						<p class="font-medium" style="color: var(--text);">{bankDetails.feedback}</p>
					</div>
				{/if}
				{#if bankDetails.rejectionReason}
					<div class="sm:col-span-2">
						<p style="color: var(--text-dim);">Last rejection reason</p>
						<p class="font-medium" style="color: var(--text);">{bankDetails.rejectionReason}</p>
					</div>
				{/if}
			</div>

			{#if bankDetails.status === 'pending'}
				<div class="mt-4 flex gap-2">
					<button
						onclick={() => updateBankDetailsStatus('approve')}
						disabled={bankDetailsActionLoading}
						class="rounded px-3 py-1.5 text-sm disabled:opacity-60"
						style="background: var(--status-success); color: var(--bg);"
					>
						Approve
					</button>
					<button
						onclick={() => {
							const reason = window.prompt('Reason for rejecting these bank details (sent to the user):');
							if (reason === null || !reason.trim()) return;
							updateBankDetailsStatus('reject', reason.trim());
						}}
						disabled={bankDetailsActionLoading}
						class="rounded px-3 py-1.5 text-sm disabled:opacity-60"
						style="background: var(--status-danger); color: var(--bg);"
					>
						Reject
					</button>
				</div>
			{/if}
		{/if}
	</div>

	{#if data.monthlyBreakdown.length > 0}
		<div class="mb-6 rounded-lg border p-6" style="border-color: var(--border); background: var(--bg-elev-1);">
			<h2 class="mb-4 text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">Monthly Performance</h2>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead style="background: var(--bg-elev-2);">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Month</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Orders</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Sales</th>
							<th class="px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Cash</th>
						</tr>
					</thead>
					<tbody class="divide-y" style="border-color: var(--border);">
						{#each data.monthlyBreakdown as month}
							<tr style="border-color: var(--border);">
								<td class="px-4 py-3 text-sm font-medium" style="color: var(--text);">{month.month}</td>
								<td class="px-4 py-3 text-sm" style="color: var(--text);">{month.orders}</td>
								<td class="px-4 py-3 text-sm" style="color: var(--text);">{formatPrice(month.sales)}</td>
								<td class="px-4 py-3 text-sm font-semibold" style="color: var(--status-success);">{formatPrice(month.storeCredit)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<div class="rounded-lg border" style="border-color: var(--border); background: var(--bg-elev-1);">
		<div class="border-b p-6" style="border-color: var(--border);">
			<h2 class="text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">Referred Orders ({data.orders.length})</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead style="background: var(--bg-elev-2);">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Order</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Customer</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Items</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Total</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Cash</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Status</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Date</th>
						<th class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase" style="color: var(--text-dim);">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border);">
					{#if data.orders.length === 0}
						<tr>
							<td colspan="8" class="px-6 py-12 text-center" style="color: var(--text-dim);">No referred orders yet</td>
						</tr>
					{:else}
						{#each data.orders as order}
							<tr style="border-color: var(--border);">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium" style="color: var(--text);">#{order.orderNumber}</div>
									<div class="text-xs" style="color: var(--text-dim);">{order.id.slice(0, 8)}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium" style="color: var(--text);">{order.customerName}</div>
									<div class="text-xs" style="color: var(--text-dim);">{order.customerEmail}</div>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text);">{order.itemCount}</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap" style="color: var(--text);">
									{formatPrice(order.totalAmount)}
								</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap" style="color: var(--status-success);">
									{formatPrice(order.storeCredit)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusBadgeStyle(order.status)}>
										{order.status}
									</span>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text-dim);">{formatDate(order.createdAt)}</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap">
									<a href="/admin/orders/{order.id}" class="flex items-center gap-1" style="color: var(--fa-blue-300);">
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
