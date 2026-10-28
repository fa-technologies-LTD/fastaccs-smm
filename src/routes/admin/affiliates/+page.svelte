<script lang="ts">
	import { Users, TrendingUp, DollarSign, Search, Download, CheckCircle } from '$lib/icons';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatPrice, formatDate } from '$lib/helpers/utils';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let allAffiliates = $state<any[]>([...(data.affiliates || [])]);
	let busyAffiliateIds = $state<string[]>([]);

	let stats = $derived.by(() => {
		const totals = allAffiliates.reduce(
			(acc, affiliate) => {
				acc.totalStoreCreditEarned += Number(affiliate.totalStoreCreditEarned || 0);
				acc.totalAvailableStoreCredit += Number(affiliate.availableStoreCredit || 0);
				acc.totalSuccessfulOrders += Number(affiliate.successfulOrders || 0);
				acc.totalPayoutRequested += Number(affiliate.requestedStoreCredit || 0);
				if (affiliate.isAffiliateEnabled && affiliate.programStatus === 'active') {
					acc.activeAffiliates += 1;
				}
				if (affiliate.hasPendingBankDetails) {
					acc.pendingBankDetailsReviews += 1;
				}
				return acc;
			},
			{
				totalStoreCreditEarned: 0,
				totalAvailableStoreCredit: 0,
				totalSuccessfulOrders: 0,
				totalPayoutRequested: 0,
				activeAffiliates: 0,
				pendingBankDetailsReviews: 0
			}
		);
		return {
			totalAffiliates: allAffiliates.length,
			activeAffiliates: totals.activeAffiliates,
			totalStoreCreditEarned: totals.totalStoreCreditEarned,
			totalAvailableStoreCredit: totals.totalAvailableStoreCredit,
			totalSuccessfulOrders: totals.totalSuccessfulOrders,
			totalPayoutRequested: totals.totalPayoutRequested,
			pendingBankDetailsReviews: totals.pendingBankDetailsReviews
		};
	});

	let affiliates = $derived(
		allAffiliates.filter((affiliate: any) => {
			const q = searchQuery.trim().toLowerCase();
			if (!q) return true;
			return (
				String(affiliate.fullName || '')
					.toLowerCase()
					.includes(q) ||
				String(affiliate.email || '')
					.toLowerCase()
					.includes(q) ||
				String(affiliate.affiliateCode || '')
					.toLowerCase()
					.includes(q)
			);
		})
	);

	// The list opens on what needs you: bank details to check and payout requests.
	type Affiliate = (typeof allAffiliates)[number];
	type ListFilter = 'review' | 'active' | 'none' | 'all';
	const PAGE = 25;
	const needsReview = (a: Affiliate) =>
		Boolean(a.hasPendingBankDetails) || Number(a.requestedStoreCredit || 0) > 0;
	const hasActivity = (a: Affiliate) =>
		Number(a.totalReferrals || 0) > 0 ||
		Number(a.totalSales || 0) > 0 ||
		Number(a.availableStoreCredit || 0) > 0 ||
		Number(a.requestedStoreCredit || 0) > 0;
	const filterCounts = $derived({
		review: affiliates.filter(needsReview).length,
		active: affiliates.filter(hasActivity).length,
		none: affiliates.filter((a: Affiliate) => !hasActivity(a)).length,
		all: affiliates.length
	});
	let chosenFilter = $state<ListFilter | null>(null);
	const listFilter = $derived<ListFilter>(
		chosenFilter ?? (filterCounts.review > 0 ? 'review' : 'active')
	);
	const listed = $derived(
		affiliates.filter((a: Affiliate) =>
			listFilter === 'all'
				? true
				: listFilter === 'review'
					? needsReview(a)
					: listFilter === 'active'
						? hasActivity(a)
						: !hasActivity(a)
		)
	);
	let shownCount = $state(PAGE);
	const LIST_FILTERS: Array<{ value: ListFilter; label: string }> = [
		{ value: 'review', label: 'To review' },
		{ value: 'active', label: 'Active' },
		{ value: 'none', label: 'No referrals yet' },
		{ value: 'all', label: 'All' }
	];
	const amountOrDash = (value: unknown) =>
		Number(value || 0) > 0 ? formatPrice(Number(value)) : '—';

	function isBusy(userId: string): boolean {
		return busyAffiliateIds.includes(userId);
	}

	function exportData() {
		// Generate CSV data
		const headers = [
			'Name',
			'Email',
			'Affiliate Promo Code',
			'Referrals',
			'Successful Orders',
			'Net Sales',
			'Available Affiliate Cash',
			'Affiliate Cash Earned',
			'Open Payouts',
			'Affiliate Type',
			'Status',
			'Joined Date'
		];

		const rows = affiliates.map((affiliate: any) => [
			affiliate.fullName || 'N/A',
			affiliate.email || 'N/A',
			affiliate.affiliateCode || 'N/A',
			Number(affiliate.totalReferrals || 0),
			Number(affiliate.successfulOrders || 0),
			Number(affiliate.totalSales || 0).toFixed(2),
			Number(affiliate.availableStoreCredit || 0).toFixed(2),
			Number(affiliate.totalStoreCreditEarned || 0).toFixed(2),
			Number(affiliate.requestedStoreCredit || 0).toFixed(2),
			affiliate.isSuperAffiliate ? 'Super' : 'Regular',
			affiliate.isAffiliateEnabled && affiliate.programStatus === 'active' ? 'Active' : 'Inactive',
			formatDate(affiliate.joinedAt || affiliate.createdAt)
		]);

		// Convert to CSV string
		const csvContent = [
			headers.join(','),
			...rows.map((row: (string | number)[]) =>
				row
					.map((cell) => {
						// Escape quotes and wrap in quotes if contains comma
						const cellStr = String(cell);
						if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
							return `"${cellStr.replace(/"/g, '""')}"`;
						}
						return cellStr;
					})
					.join(',')
			)
		].join('\n');

		// Create download link
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);

		const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
		link.setAttribute('href', url);
		link.setAttribute('download', `affiliates-export-${today}.csv`);
		link.style.visibility = 'hidden';

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	async function toggleAffiliateStatus(
		userId: string,
		currentStatus: boolean,
		isSuperAffiliate: boolean
	) {
		if (isBusy(userId)) return;
		busyAffiliateIds = [...busyAffiliateIds, userId];
		const nextStatus = !currentStatus;
		const previous = [...allAffiliates];
		allAffiliates = allAffiliates.map((row) =>
			row.id === userId
				? {
						...row,
						isAffiliateEnabled: nextStatus,
						programStatus: nextStatus ? 'active' : 'inactive'
					}
				: row
		);
		try {
			const response = await fetch(`/api/admin/affiliates/${userId}/toggle`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					isAffiliateEnabled: nextStatus,
					affiliateType: isSuperAffiliate ? 'super' : 'regular'
				})
			});

			if (response.ok) {
				addToast({
					type: 'success',
					title: 'Affiliate status updated successfully',
					duration: 3000
				});
			} else {
				allAffiliates = previous;
				addToast({
					type: 'error',
					title: 'Failed to update affiliate status',
					duration: 3000
				});
			}
		} catch (error) {
			allAffiliates = previous;
			addToast({
				type: 'error',
				title: 'Error updating affiliate status',
				duration: 3000
			});
		} finally {
			busyAffiliateIds = busyAffiliateIds.filter((id) => id !== userId);
		}
	}

	async function toggleAffiliateType(userId: string, currentIsSuper: boolean) {
		if (isBusy(userId)) return;
		busyAffiliateIds = [...busyAffiliateIds, userId];
		const previous = [...allAffiliates];
		const nextIsSuper = !currentIsSuper;
		allAffiliates = allAffiliates.map((row) =>
			row.id === userId ? { ...row, isSuperAffiliate: nextIsSuper } : row
		);
		try {
			const response = await fetch(`/api/admin/affiliates/${userId}/toggle`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					isAffiliateEnabled: true,
					affiliateType: nextIsSuper ? 'super' : 'regular'
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to update affiliate type');
			}
			addToast({
				type: 'success',
				title: nextIsSuper ? 'Affiliate upgraded to Super' : 'Affiliate changed to Regular',
				duration: 3000
			});
		} catch (error) {
			allAffiliates = previous;
			addToast({
				type: 'error',
				title: error instanceof Error ? error.message : 'Update failed',
				duration: 3000
			});
		} finally {
			busyAffiliateIds = busyAffiliateIds.filter((id) => id !== userId);
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold" style="color: var(--text)">Affiliates</h1>
			<p class="mt-1" style="color: var(--text-muted)">
				Referrals, earnings, bank details and payouts.
			</p>
		</div>
		<button onclick={exportData} class="btn-fa btn-fa--primary cursor-pointer">
			<Download class="h-4 w-4" />
			Export Data
		</button>
	</div>

	{#if stats.pendingBankDetailsReviews > 0}
		<div
			class="flex items-center justify-between gap-3 rounded-lg p-4"
			style="border: 1px solid var(--status-warning-border); background: var(--status-warning-bg);"
		>
			<p class="text-sm font-medium" style="color: var(--status-warning);">
				{stats.pendingBankDetailsReviews} bank-details submission{stats.pendingBankDetailsReviews ===
				1
					? ''
					: 's'} waiting on your review.
			</p>
		</div>
	{/if}

	<!-- Core business outcome -->
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<div
			class="rounded-lg p-6"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Active Affiliates</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--text);">
						{stats.activeAffiliates}
					</p>
					<p class="mt-1 text-xs" style="color: var(--text-dim);">
						{stats.totalAffiliates} profiles in total
					</p>
				</div>
				<div class="rounded-full p-3" style="background: rgba(105,109,250,0.12);">
					<Users class="h-6 w-6" style="color: var(--link);" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-6"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Referred Buyers</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--status-success);">
						{data.stats.referredBuyers || 0}
					</p>
				</div>
				<div class="rounded-full p-3" style="background: rgba(5,212,113,0.12);">
					<CheckCircle class="h-6 w-6" style="color: var(--status-success);" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-6"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Net Referred Sales</p>
					<p class="mt-2 text-3xl font-bold" style="color: #a855f7;">
						{formatPrice(data.stats.netReferredSales || 0)}
					</p>
				</div>
				<div class="rounded-full p-3" style="background: rgba(168,85,247,0.12);">
					<DollarSign class="h-6 w-6" style="color: #a855f7;" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-6"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Still Owed</p>
					<p class="mt-2 text-3xl font-bold" style="color: #f97316;">
						{formatPrice(data.stats.outstandingAffiliateLiability || 0)}
					</p>
					<p class="mt-1 text-xs" style="color: var(--text-dim);">
						Pending, available, or requested affiliate Cash
					</p>
				</div>
				<div class="rounded-full p-3" style="background: rgba(249,115,22,0.12);">
					<TrendingUp class="h-6 w-6" style="color: #f97316;" />
				</div>
			</div>
		</div>
	</div>

	<div
		class="rounded-lg p-4"
		style="border: 1px solid var(--border); background: var(--bg-elev-1);"
	>
		<h2 class="text-base font-semibold" style="color: var(--text);">Programme cost</h2>
		<p class="mt-1 text-xs" style="color: var(--text-muted);">
			Retained acquisition cost only. Refund reversals and commission adjustments are already
			removed.
		</p>
		<div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
			{#each [{ label: 'Buyer discounts', value: data.stats.buyerDiscountCost || 0 }, { label: 'Regular rewards', value: data.stats.regularRewardCost || 0 }, { label: 'Super rewards', value: data.stats.superRewardCost || 0 }, { label: 'Total affiliate rewards', value: data.stats.totalRewardCost || 0 }, { label: 'Cash paid out', value: data.stats.paidAffiliateCash || 0 }] as item}
				<div class="rounded-lg p-3" style="border: 1px solid var(--border); background: var(--bg);">
					<p class="text-xs" style="color: var(--text-muted);">{item.label}</p>
					<p class="mt-1 text-lg font-bold" style="color: var(--text);">
						{formatPrice(item.value)}
					</p>
				</div>
			{/each}
		</div>
	</div>

	<div
		class="rounded-lg p-4"
		style="border: 1px solid var(--border); background: var(--bg-elev-1);"
	>
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<h2 class="text-base font-semibold" style="color: var(--text);">Affiliate funnel</h2>
				<p class="mt-1 text-xs" style="color: var(--text-muted);">
					Link opens are counted from the new event tracker; the other totals include reconciled
					history. Rates will become meaningful once enough new traffic has passed through it.
				</p>
			</div>
		</div>
		<div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
			{#each [{ label: 'Dashboard views', value: data.stats.dashboardViews || 0 }, { label: 'Share actions', value: data.stats.shareActions || 0 }, { label: 'Tracked link opens', value: data.stats.trackedLinkOpens || 0 }, { label: 'Users linked', value: data.stats.linkedUsers || 0 }, { label: 'Referred buyers', value: data.stats.referredBuyers || 0 }, { label: 'Productive affiliates', value: data.stats.productiveAffiliates || 0 }] as step}
				<div class="rounded-lg p-3" style="border: 1px solid var(--border); background: var(--bg);">
					<p class="text-xs" style="color: var(--text-muted);">{step.label}</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--text);">{step.value}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- Find an affiliate -->
	<div
		class="space-y-3 rounded-lg p-4"
		style="border: 1px solid var(--border); background: var(--bg-elev-1);"
	>
		<div class="relative">
			<Search
				class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2"
				style="color: var(--text-dim);"
			/>
			<input
				type="text"
				bind:value={searchQuery}
				oninput={() => (shownCount = PAGE)}
				placeholder="Search name, email or code"
				aria-label="Search affiliates"
				class="w-full rounded-lg py-2 pr-4 pl-10 focus:ring-1 focus:outline-none"
				style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
			/>
		</div>
		<div class="flex flex-wrap gap-2" role="group" aria-label="Filter affiliates">
			{#each LIST_FILTERS as option (option.value)}
				<button
					type="button"
					aria-pressed={listFilter === option.value}
					onclick={() => {
						chosenFilter = option.value;
						shownCount = PAGE;
					}}
					class="rounded-full px-3 py-1.5 text-xs font-semibold"
					style={listFilter === option.value
						? option.value === 'review'
							? 'background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border);'
							: 'background: rgba(105,109,250,0.14); color: var(--link); border: 1px solid rgba(105,109,250,0.32);'
						: 'background: var(--bg); color: var(--text-muted); border: 1px solid var(--border);'}
				>
					{option.label} · {filterCounts[option.value]}
				</button>
			{/each}
		</div>
	</div>

	<!-- Affiliates -->
	<div class="rounded-lg" style="border: 1px solid var(--border); background: var(--bg-elev-1);">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead style="background: var(--bg-elev-2);">
					<tr
						class="text-left text-xs font-medium tracking-wider uppercase"
						style="color: var(--text-muted);"
					>
						<th class="px-4 py-3">Affiliate</th>
						<th class="hidden px-4 py-3 text-right sm:table-cell">Referrals</th>
						<th class="hidden px-4 py-3 text-right sm:table-cell">Sales brought</th>
						<th class="px-4 py-3 text-right">Balance</th>
						<th class="px-4 py-3">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border);">
					{#each listed.slice(0, shownCount) as affiliate (affiliate.id)}
						<tr>
							<td class="px-4 py-3">
								<a
									href={`/admin/affiliates/${affiliate.id}`}
									class="flex items-center gap-2 text-sm font-semibold hover:underline"
									style="color: var(--text);"
								>
									{affiliate.fullName || affiliate.email}
									{#if affiliate.isSuperAffiliate}
										<span
											class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
											style="background: var(--status-info-bg); border: 1px solid var(--status-info-border); color: var(--status-info);"
											>Super</span
										>
									{/if}
								</a>
								<div class="text-xs" style="color: var(--text-muted);">
									<span class="font-mono" style="color: var(--link);"
										>{affiliate.affiliateCode || 'No code'}</span
									>
									· joined {formatDate(affiliate.joinedAt || affiliate.createdAt)}
								</div>
							</td>
							<td
								class="hidden px-4 py-3 text-right text-sm tabular-nums sm:table-cell"
								style="color: var(--text);"
							>
								{Number(affiliate.totalReferrals || 0) > 0 ? affiliate.totalReferrals : '—'}
							</td>
							<td
								class="hidden px-4 py-3 text-right text-sm tabular-nums sm:table-cell"
								style="color: var(--text);"
							>
								{amountOrDash(affiliate.totalSales)}
							</td>
							<td class="px-4 py-3 text-right text-sm tabular-nums" style="color: var(--text);">
								{amountOrDash(affiliate.availableStoreCredit)}
								{#if Number(affiliate.requestedStoreCredit || 0) > 0}
									<div class="text-xs" style="color: var(--status-warning);">
										{formatPrice(Number(affiliate.requestedStoreCredit))} requested
									</div>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap items-center gap-2">
									{#if affiliate.hasPendingBankDetails}
										<a
											href={`/admin/affiliates/${affiliate.id}#bank-details`}
											class="rounded-full px-2 py-0.5 text-xs font-semibold"
											style="background: var(--status-warning-bg); border: 1px solid var(--status-warning-border); color: var(--status-warning);"
											>Review bank details</a
										>
									{/if}
									{#if Number(affiliate.requestedStoreCredit || 0) > 0}
										<a
											href={`/admin/affiliates/${affiliate.id}`}
											class="rounded-full px-2 py-0.5 text-xs font-semibold"
											style="background: var(--status-warning-bg); border: 1px solid var(--status-warning-border); color: var(--status-warning);"
											>Payout requested</a
										>
									{/if}
									{#if affiliate.isAffiliateEnabled && affiliate.programStatus === 'active'}
										<span class="text-xs font-semibold" style="color: var(--status-success);"
											>Active</span
										>
									{:else}
										<span class="text-xs font-semibold" style="color: var(--text-muted);">Off</span>
									{/if}
									<button
										type="button"
										onclick={() =>
											toggleAffiliateStatus(
												affiliate.id,
												affiliate.isAffiliateEnabled,
												affiliate.isSuperAffiliate
											)}
										disabled={isBusy(affiliate.id)}
										class="rounded-md px-2 py-0.5 text-xs disabled:opacity-50"
										style="border: 1px solid var(--border); color: var(--text-muted);"
										>{affiliate.isAffiliateEnabled ? 'Switch off' : 'Switch on'}</button
									>
									{#if affiliate.isAffiliateEnabled && affiliate.programStatus === 'active'}
										<button
											type="button"
											onclick={() => toggleAffiliateType(affiliate.id, affiliate.isSuperAffiliate)}
											disabled={isBusy(affiliate.id)}
											class="rounded-md px-2 py-0.5 text-xs disabled:opacity-50"
											style="border: 1px solid var(--border); color: var(--text-muted);"
											>{affiliate.isSuperAffiliate ? 'Make regular' : 'Make Super'}</button
										>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td
								colspan="5"
								class="px-4 py-10 text-center text-sm"
								style="color: var(--text-muted);"
							>
								{listFilter === 'review'
									? 'Nothing to review right now.'
									: searchQuery
										? 'No affiliates match that search.'
										: 'No affiliates here.'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if shownCount < listed.length}
			<div class="p-3 text-center" style="border-top: 1px solid var(--border);">
				<button
					type="button"
					onclick={() => (shownCount += PAGE)}
					class="rounded-full px-4 py-1.5 text-sm font-semibold"
					style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
					>Show {Math.min(PAGE, listed.length - shownCount)} more of {listed.length}</button
				>
			</div>
		{/if}
	</div>
</div>
