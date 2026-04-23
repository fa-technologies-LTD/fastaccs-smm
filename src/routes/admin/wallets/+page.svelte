<script lang="ts">
	import {
		Wallet,
		TrendingUp,
		Users,
		DollarSign,
		Search,
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
	// let currentPage = $state(1);
	// let itemsPerPage = 10;

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
				return 'style="color: var(--text-muted);"';
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

		exportToCSV(exportData, `store-credit-transactions-${today}.csv`);

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
			<h1 class="text-2xl font-bold" style="color: var(--text)">Store Credit Oversight</h1>
			<p class="mt-1" style="color: var(--text-muted)">
				Affiliate-only store credit monitoring and transaction history.
			</p>
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

	{#if data.error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<div class="flex items-center gap-2">
				<svg class="size-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
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
		<div
			class="group rounded-lg p-4"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted);">
						Affiliate Credit Wallets
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--text);">{stats.totalWallets}</p>
				</div>
				<div class="rounded-full p-2" style="background: rgba(105,109,250,0.12);">
					<Users
						class="size-5 group-hover:scale-80 group-hover:-rotate-20"
						style="color: var(--link);"
					/>
				</div>
			</div>
		</div>

		<div
			class="group rounded-lg p-4"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted);">
						Total Store Credit
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--text);">
						{formatPrice(stats.totalBalance)}
					</p>
				</div>
				<div class="rounded-full p-2" style="background: rgba(5,212,113,0.12);">
					<Wallet
						class="size-5 group-hover:scale-80 group-hover:-rotate-20"
						style="color: var(--status-success);"
					/>
				</div>
			</div>
		</div>

		<div
			class="group rounded-lg p-4"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted);">
						Credit Added
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--status-success);">
						{formatPrice(stats.totalDeposits)}
					</p>
				</div>
				<div class="rounded-full p-2" style="background: rgba(5,212,113,0.12);">
					<ArrowDownLeft
						class="size-5 group-hover:scale-80 group-hover:-rotate-20"
						style="color: var(--status-success);"
					/>
				</div>
			</div>
		</div>

		<div
			class="group rounded-lg p-4"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted);">
						Credit Used
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--status-error);">
						{formatPrice(stats.totalWithdrawals)}
					</p>
				</div>
				<div class="rounded-full p-2" style="background: rgba(255,77,79,0.12);">
					<ArrowUpRight
						class="size-5 group-hover:scale-80 group-hover:-rotate-20"
						style="color: var(--status-error);"
					/>
				</div>
			</div>
		</div>
	</div>

	<!-- Filters and Search -->
	<div
		class="rounded-lg p-4"
		style="border: 1px solid var(--border); background: var(--bg-elev-1);"
	>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex-1">
				<div class="relative">
					<Search
						class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2"
						style="color: var(--text-dim);"
					/>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by user email or transaction reference..."
						class="w-full rounded-lg py-2 pr-4 pl-10 focus:ring-1 focus:outline-none"
						style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
					/>
				</div>
			</div>
			<div class="flex gap-2">
				<select
					bind:value={filterType}
					class="rounded-lg px-4 py-2 focus:ring-1 focus:outline-none"
					style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
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
	<div class="rounded-lg" style="border: 1px solid var(--border); background: var(--bg-elev-1);">
		<div class="p-4" style="border-bottom: 1px solid var(--border);">
			<h2 class="text-base font-semibold" style="color: var(--text);">Recent Transactions</h2>
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
							Type
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Amount
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Credit Balance
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Description
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Date
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Status
						</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border); background: var(--bg-elev-1);">
					{#if transactions.length === 0}
						<tr>
							<td colspan="7" class="px-6 py-12 text-center" style="color: var(--text-muted);">
								No transactions found
							</td>
						</tr>
					{:else}
						{#each transactions as transaction}
							{@const TypeIcon = getTypeIcon(transaction.type)}
							<tr
								class="transition-colors"
								style="--hover-bg: var(--bg-elev-2);"
								onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
								onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
							>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<div>
											<div class="text-sm font-medium" style="color: var(--text);">
												{transaction.user?.fullName || transaction.user?.email}
											</div>
											<div class="text-sm" style="color: var(--text-muted);">
												{transaction.user?.email}
											</div>
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
									<div class="text-sm" style="color: var(--text);">
										{formatPrice(Number(transaction.balanceAfter))}
									</div>
								</td>
								<td class="max-w-xs truncate px-6 py-4">
									<div class="text-sm" style="color: var(--text);">{transaction.description}</div>
									{#if transaction.reference}
										<div class="text-xs" style="color: var(--text-muted);">
											Ref: {transaction.reference}
										</div>
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
