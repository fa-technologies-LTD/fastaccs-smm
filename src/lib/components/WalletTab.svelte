<script lang="ts">
	import { Wallet, Plus, RefreshCw, ArrowUpRight, ArrowDownLeft } from '@lucide/svelte';
	import { showError } from '$lib/stores/toasts';

	let { initialWalletBalance, initialWalletTransactions } = $props();

	let loading = $state(false);

	let walletBalance = $state<number>(initialWalletBalance);
	let walletTransactions = $state<any[]>(initialWalletTransactions);
	let fundAmount = $state<string>('');

	async function fundWallet() {
		loading = true;
		const amount = parseFloat(fundAmount);
		if (!amount || amount < 100) {
			showError('Please enter an amount of at least ₦100');
			loading = false;
			return;
		}
		if (amount > 850000) {
			showError('Maximum funding amount is ₦850,000');
			loading = false;
			return;
		}

		try {
			const response = await fetch('/api/wallet/fund', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount })
			});

			const data = await response.json();

			if (data.success) {
				// Redirect to Korapay payment (external URL)
				window.location.href = data.authorizationUrl;
			} else {
				showError(data.error || 'Failed to initialize payment');
				loading = false;
			}
		} catch (error) {
			showError('Failed to fund wallet');
		} finally {
			loading = false;
		}
	}
</script>

<div class="rounded-lg border border-gray-200 bg-white">
	<div class="border-b border-gray-200 p-6">
		<h2 class="text-xl font-semibold">Wallet</h2>
		<p class="text-gray-600">Manage your account balance and transactions</p>
	</div>

	<div class="p-6">
		<!-- Wallet Balance Card -->
		<div class="mb-8 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-white">
			<div class="mb-2 flex items-center gap-2">
				<Wallet class="h-6 w-6" />
				<span class="text-sm opacity-90">Available Balance</span>
			</div>
			<div class="text-4xl font-bold">
				₦{walletBalance.toLocaleString()}
			</div>
		</div>

		<!-- Fund Wallet Form -->
		<div class="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
			<h3 class="mb-4 text-lg font-semibold">Fund Wallet</h3>
			<div class="flex gap-3">
				<input
					type="number"
					bind:value={fundAmount}
					placeholder="Enter amount (min ₦100, max ₦850,000)"
					min="100"
					max="850000"
					step="100"
					class="flex-1 rounded-lg border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
				<button
					onclick={fundWallet}
					class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[.98]"
				>
					{#if loading}
						<RefreshCw class="h-5 w-5 animate-spin" />
					{:else}
						<Plus class="h-5 w-5" />
					{/if}
					Fund Wallet
				</button>
			</div>
			<p class="mt-2 text-sm text-gray-600">
				Pay with Korapay (cards, bank transfer, mobile money). Maximum: ₦850,000 per transaction.
			</p>
		</div>

		<!-- Transaction History -->
		<div>
			<h3 class="mb-4 text-lg font-semibold">Transaction History</h3>
			{#if walletTransactions.length === 0}
				<div class="rounded-lg bg-gray-50 p-8 text-center">
					<p class="text-gray-600">No transactions yet</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each walletTransactions as transaction}
						<div class="rounded-lg border border-gray-200 p-4">
							<div class="flex items-start justify-between">
								<div class="flex items-start gap-3">
									<div
										class="rounded-full p-2 {transaction.type === 'deposit'
											? 'bg-green-100'
											: transaction.type === 'refund'
												? 'bg-blue-100'
												: 'bg-red-100'}"
									>
										{#if transaction.type === 'deposit' || transaction.type === 'refund'}
											<ArrowDownLeft
												class="h-4 w-4 {transaction.type === 'deposit'
													? 'text-green-600'
													: 'text-blue-600'}"
											/>
										{:else}
											<ArrowUpRight class="h-4 w-4 text-red-600" />
										{/if}
									</div>
									<div>
										<div class="font-medium capitalize">{transaction.type}</div>
										<div class="text-sm text-gray-600">{transaction.description}</div>
										<div class="text-xs text-gray-500">
											{new Date(transaction.createdAt).toLocaleDateString()} •
											{new Date(transaction.createdAt).toLocaleTimeString()}
										</div>
									</div>
								</div>
								<div class="text-right">
									<div
										class="text-lg font-bold {transaction.type === 'deposit' ||
										transaction.type === 'refund'
											? 'text-green-600'
											: 'text-red-600'}"
									>
										{transaction.type === 'deposit' || transaction.type === 'refund'
											? '+'
											: '-'}₦{Number(transaction.amount).toLocaleString()}
									</div>
									<div class="text-xs text-gray-500">
										Balance: ₦{Number(transaction.balanceAfter).toLocaleString()}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
