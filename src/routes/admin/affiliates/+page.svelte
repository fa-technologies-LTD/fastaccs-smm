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
			class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-all hover:scale-95 hover:bg-blue-700 active:scale-90"
		>
			<Download class="h-4 w-4" />
			Export Data
		</button>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Affiliates</p>
					<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalAffiliates}</p>
				</div>
				<div class="rounded-full bg-blue-100 p-3">
					<Users class="h-6 w-6 text-blue-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Active Affiliates</p>
					<p class="mt-2 text-3xl font-bold text-green-600">{stats.activeAffiliates}</p>
				</div>
				<div class="rounded-full bg-green-100 p-3">
					<CheckCircle class="h-6 w-6 text-green-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Commissions</p>
					<p class="mt-2 text-3xl font-bold text-purple-600">
						{formatPrice(stats.totalCommissions)}
					</p>
				</div>
				<div class="rounded-full bg-purple-100 p-3">
					<DollarSign class="h-6 w-6 text-purple-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Referrals</p>
					<p class="mt-2 text-3xl font-bold text-orange-600">{stats.totalReferrals}</p>
				</div>
				<div class="rounded-full bg-orange-100 p-3">
					<TrendingUp class="h-6 w-6 text-orange-600" />
				</div>
			</div>
		</div>
	</div>

	<!-- Search -->
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<div class="relative">
			<Search class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search by name, email, or affiliate code..."
				class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			/>
		</div>
	</div>

	<!-- Affiliates Table -->
	<div class="rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 p-6">
			<h2 class="text-lg font-semibold text-gray-900">All Affiliates</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							User
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Code
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Referrals
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Total Sales
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Commission
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Joined
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if affiliates.length === 0}
						<tr>
							<td colspan="8" class="px-6 py-12 text-center text-gray-500">
								No affiliates found
							</td>
						</tr>
					{:else}
						{#each affiliates as affiliate}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div>
										<div class="text-sm font-medium text-gray-900">
											{affiliate.fullName || 'N/A'}
										</div>
										<div class="text-sm text-gray-500">{affiliate.email}</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="font-mono text-sm font-semibold text-blue-600">
										{affiliate.affiliatePrograms[0]?.affiliateCode || 'N/A'}
									</div>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{affiliate.affiliatePrograms[0]?.totalReferrals || 0}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{formatPrice(Number(affiliate.affiliatePrograms[0]?.totalSales || 0))}
								</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-green-600">
									{formatPrice(Number(affiliate.affiliatePrograms[0]?.totalCommission || 0))}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
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
