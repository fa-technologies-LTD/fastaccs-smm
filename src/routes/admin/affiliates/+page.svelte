<script lang="ts">
	import {
		Users,
		TrendingUp,
		DollarSign,
		Search,
		Download,
		Eye,
		CheckCircle,
		XCircle
	} from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { formatPrice, formatDate } from '$lib/helpers/utils';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let currentPage = $state(1);
	let itemsPerPage = 10;

	let stats = $derived({
		totalAffiliates: data.stats?.totalAffiliates || 0,
		activeAffiliates: data.stats?.activeAffiliates || 0,
		totalCommissions: data.stats?.totalCommissions || 0,
		totalReferrals: data.stats?.totalReferrals || 0
	});

	let affiliates = $derived(data.affiliates || []);

	function exportData() {
		// Generate CSV data
		const headers = [
			'Name',
			'Email',
			'Affiliate Code',
			'Referrals',
			'Total Sales',
			'Total Commission',
			'Status',
			'Joined Date'
		];

		const rows = affiliates.map((affiliate: any) => [
			affiliate.fullName || 'N/A',
			affiliate.email || 'N/A',
			affiliate.affiliatePrograms[0]?.affiliateCode || 'N/A',
			affiliate.affiliatePrograms[0]?.totalReferrals || 0,
			Number(affiliate.affiliatePrograms[0]?.totalSales || 0).toFixed(2),
			Number(affiliate.affiliatePrograms[0]?.totalCommission || 0).toFixed(2),
			affiliate.isAffiliateEnabled ? 'Active' : 'Inactive',
			formatDate(affiliate.affiliatePrograms[0]?.createdAt || affiliate.createdAt)
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

	async function toggleAffiliateStatus(userId: string, currentStatus: boolean) {
		try {
			const response = await fetch(`/api/admin/affiliates/${userId}/toggle`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isAffiliateEnabled: !currentStatus })
			});

			if (response.ok) {
				addToast({
					type: 'success',
					title: 'Affiliate status updated successfully',
					duration: 3000
				});
				window.location.reload();
			} else {
				addToast({
					type: 'error',
					title: 'Failed to update affiliate status',
					duration: 3000
				});
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Error updating affiliate status',
				duration: 3000
			});
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Affiliate Management</h1>
			<p class="mt-1 text-gray-600">Monitor and manage affiliate programs</p>
		</div>
		<button
			onclick={exportData}
			class="flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-white transition-all hover:scale-95 active:scale-90"
			style="background: var(--btn-primary-gradient)"
		>
			<Download class="h-4 w-4" />
			Export Data
		</button>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<div
			class="rounded-lg p-6"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium" style="color: var(--text-muted);">Total Affiliates</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--text);">{stats.totalAffiliates}</p>
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
					<p class="text-sm font-medium" style="color: var(--text-muted);">Active Affiliates</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--status-success);">
						{stats.activeAffiliates}
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
					<p class="text-sm font-medium" style="color: var(--text-muted);">Total Commissions</p>
					<p class="mt-2 text-3xl font-bold" style="color: #a855f7;">
						{formatPrice(stats.totalCommissions)}
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
					<p class="text-sm font-medium" style="color: var(--text-muted);">Total Referrals</p>
					<p class="mt-2 text-3xl font-bold" style="color: #f97316;">{stats.totalReferrals}</p>
				</div>
				<div class="rounded-full p-3" style="background: rgba(249,115,22,0.12);">
					<TrendingUp class="h-6 w-6" style="color: #f97316;" />
				</div>
			</div>
		</div>
	</div>

	<!-- Search -->
	<div
		class="rounded-lg p-4"
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
				placeholder="Search by name, email, or affiliate code..."
				class="w-full rounded-lg py-2 pr-4 pl-10 focus:ring-1 focus:outline-none"
				style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
			/>
		</div>
	</div>

	<!-- Affiliates Table -->
	<div class="rounded-lg" style="border: 1px solid var(--border); background: var(--bg-elev-1);">
		<div class="p-6" style="border-bottom: 1px solid var(--border);">
			<h2 class="text-lg font-semibold" style="color: var(--text);">All Affiliates</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead style="background: var(--bg-elev-2);">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							User
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Code
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Referrals
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Total Sales
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Commission
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Joined
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border); background: var(--bg-elev-1);">
					{#if affiliates.length === 0}
						<tr>
							<td colspan="8" class="px-6 py-12 text-center" style="color: var(--text-muted);">
								No affiliates found
							</td>
						</tr>
					{:else}
						{#each affiliates as affiliate}
							<tr
								class="transition-colors"
								style="--hover-bg: var(--bg-elev-2);"
								onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
								onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
							>
								<td class="px-6 py-4 whitespace-nowrap">
									<div>
										<div class="text-sm font-medium" style="color: var(--text);">
											{affiliate.fullName || 'N/A'}
										</div>
										<div class="text-sm" style="color: var(--text-muted);">{affiliate.email}</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="font-mono text-sm font-semibold" style="color: var(--link);">
										{affiliate.affiliatePrograms[0]?.affiliateCode || 'N/A'}
									</div>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text);">
									{affiliate.affiliatePrograms[0]?.totalReferrals || 0}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text);">
									{formatPrice(Number(affiliate.affiliatePrograms[0]?.totalSales || 0))}
								</td>
								<td
									class="px-6 py-4 text-sm font-medium whitespace-nowrap"
									style="color: var(--status-success);"
								>
									{formatPrice(Number(affiliate.affiliatePrograms[0]?.totalCommission || 0))}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text-muted);">
									{formatDate(affiliate.affiliatePrograms[0]?.createdAt || affiliate.createdAt)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if affiliate.isAffiliateEnabled}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
										>
											<CheckCircle class="h-3 w-3" />
											Active
										</span>
									{:else}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800"
										>
											<XCircle class="h-3 w-3" />
											Inactive
										</span>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex gap-2">
										<button
											onclick={() => goto(`/admin/affiliates/${affiliate.id}`)}
											class="group cursor-pointer text-blue-600 hover:text-blue-900"
											title="View Details"
										>
											<Eye class="h-5 w-5 transition-all group-hover:scale-90" />
										</button>
										<button
											onclick={() =>
												toggleAffiliateStatus(affiliate.id, affiliate.isAffiliateEnabled)}
											class="group cursor-pointer text-gray-600 hover:text-gray-900"
											title={affiliate.isAffiliateEnabled ? 'Disable' : 'Enable'}
										>
											{#if affiliate.isAffiliateEnabled}
												<XCircle class="h-5 w-5 text-red-600 transition-all group-hover:scale-90" />
											{:else}
												<CheckCircle
													class="h-5 w-5 text-green-600 transition-all group-hover:scale-90"
												/>
											{/if}
										</button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
