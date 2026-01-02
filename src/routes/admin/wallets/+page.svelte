<script lang="ts">
	import {
		Wallet,
		TrendingUp,
		Users,
		DollarSign,
		Search,
		Filter,
		Download,
		ArrowUpRight,
		ArrowDownLeft,
		RefreshCw
	} from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatPrice, formatDate, exportToCSV } from '$lib/helpers/utils';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let filterType = $state('all'); // all, deposit, debit, refund
	let currentPage = $state(1);
	let itemsPerPage = 10;

	// Mock data - will be replaced with actual data from server
	let stats = $derived({
		totalWallets: data.stats?.totalWallets || 0,
		totalBalance: data.stats?.totalBalance || 0,
		totalDeposits: data.stats?.totalDeposits || 0,
		totalWithdrawals: data.stats?.totalWithdrawals || 0
	});

	let wallets = $derived(data.wallets || []);
	let transactions = $derived(data.transactions || []);

	function getTypeIcon(type: string) {
		switch (type) {
			case 'deposit':
				return ArrowDownLeft;
			case 'debit':
				return ArrowUpRight;
			case 'refund':
				return RefreshCw;
			default:
				return DollarSign;
		}
	}

	function getTypeColor(type: string): string {
		switch (type) {
			case 'deposit':
				return 'text-green-600';
			case 'debit':
				return 'text-red-600';
			case 'refund':
				return 'text-blue-600';
			default:
				return 'text-gray-600';
		}
	}

	function exportData() {
		const today = new Date().toISOString().split('T')[0];
		const exportData = transactions.map((txn) => ({
			User: txn.user?.fullName || txn.user?.email || 'N/A',
			Email: txn.user?.email || 'N/A',
			Type: txn.type,
			Amount: Number(txn.amount),
			'Balance Before': Number(txn.balanceBefore),
			'Balance After': Number(txn.balanceAfter),
			Description: txn.description,
			Reference: txn.reference || 'N/A',
			Status: txn.status,
			Date: formatDate(txn.createdAt)
		}));

		exportToCSV(exportData, `wallet-transactions-${today}.csv`);

		addToast({
			type: 'success',
			title: 'Export completed successfully',
			duration: 3000
		});
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Wallet Oversight</h1>
			<p class="mt-1 text-gray-600">Monitor all user wallets and transactions</p>
		</div>
		<button
			onclick={exportData}
			class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-all hover:scale-95 hover:bg-blue-700 active:scale-90"
		>
			<Download class="h-4 w-4" />
			Export Data
		</button>
	</div>

	{#if data.error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<div class="flex items-center gap-2">
				<svg class="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
						clip-rule="evenodd"
					/>
				</svg>
				<div>
					<p class="font-semibold text-red-800">Connection Error</p>
					<p class="text-sm text-red-700">{data.error}</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Total Wallets</p>
					<p class="mt-1 text-xl font-bold text-gray-900">{stats.totalWallets}</p>
				</div>
				<div class="rounded-full bg-blue-100 p-2">
					<Users class="h-5 w-5 text-blue-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Total Balance</p>
					<p class="mt-1 text-xl font-bold text-gray-900">
						{formatPrice(stats.totalBalance)}
					</p>
				</div>
				<div class="rounded-full bg-green-100 p-2">
					<Wallet class="h-5 w-5 text-green-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Total Deposits</p>
					<p class="mt-1 text-xl font-bold text-green-600">
						{formatPrice(stats.totalDeposits)}
					</p>
				</div>
				<div class="rounded-full bg-green-100 p-2">
					<ArrowDownLeft class="h-5 w-5 text-green-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Total Withdrawals</p>
					<p class="mt-1 text-xl font-bold text-red-600">
						{formatPrice(stats.totalWithdrawals)}
					</p>
				</div>
				<div class="rounded-full bg-red-100 p-2">
					<ArrowUpRight class="h-5 w-5 text-red-600" />
				</div>
			</div>
		</div>
	</div>

	<!-- Filters and Search -->
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex-1">
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by user email or transaction reference..."
						class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
			</div>
			<div class="flex gap-2">
				<select
					bind:value={filterType}
					class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				>
					<option value="all">All Types</option>
					<option value="deposit">Deposits</option>
					<option value="debit">Debits</option>
					<option value="refund">Refunds</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Recent Transactions -->
	<div class="rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 p-4">
			<h2 class="text-base font-semibold text-gray-900">Recent Transactions</h2>
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
							Type
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Amount
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Balance
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Description
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Date
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Status
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if transactions.length === 0}
						<tr>
							<td colspan="7" class="px-6 py-12 text-center text-gray-500">
								No transactions found
							</td>
						</tr>
					{:else}
						{#each transactions as transaction}
							{@const TypeIcon = getTypeIcon(transaction.type)}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<div>
											<div class="text-sm font-medium text-gray-900">
												{transaction.user?.fullName || transaction.user?.email}
											</div>
											<div class="text-sm text-gray-500">{transaction.user?.email}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center gap-2">
										<TypeIcon class="h-4 w-4 {getTypeColor(transaction.type)}" />
										<span class="capitalize {getTypeColor(transaction.type)}">
											{transaction.type}
										</span>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium {getTypeColor(transaction.type)}">
										{transaction.type === 'debit' ? '-' : '+'}
										{formatPrice(Number(transaction.amount))}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm text-gray-900">
										{formatPrice(Number(transaction.balanceAfter))}
									</div>
								</td>
								<td class="max-w-xs truncate px-6 py-4">
									<div class="text-sm text-gray-900">{transaction.description}</div>
									{#if transaction.reference}
										<div class="text-xs text-gray-500">Ref: {transaction.reference}</div>
									{/if}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
									{formatDate(transaction.createdAt)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded-full px-2 py-1 text-xs font-semibold
										{transaction.status === 'completed'
											? 'bg-green-100 text-green-800'
											: transaction.status === 'pending'
												? 'bg-yellow-100 text-yellow-800'
												: 'bg-red-100 text-red-800'}"
									>
										{transaction.status}
									</span>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
