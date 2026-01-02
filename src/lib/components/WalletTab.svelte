<script lang="ts">
	import {
		Wallet,
		Plus,
		RefreshCw,
		ArrowUpRight,
		ArrowDownLeft,
		Zap,
		Shield,
		Lock
	} from '@lucide/svelte';
	import { showError, showSuccess } from '$lib/stores/toasts';

	let { initialWalletBalance, initialWalletTransactions } = $props();

	let loading = $state(false);

	let walletBalance = $state<number>(initialWalletBalance);
	let walletTransactions = $state<any[]>(initialWalletTransactions);
	let fundAmount = $state<string>('');

	// Quick amount presets in Naira
	const quickAmounts = [5000, 10000, 25000, 50000];

	function setQuickAmount(amount: number) {
		fundAmount = amount.toString();
	}

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
				// Show success confirmation before redirect
				showSuccess(
					'Payment Initialized',
					'Redirecting to secure payment gateway. Your wallet will be credited instantly after payment.',
					4000
				);
				// Redirect to Korapay payment (external URL)
				setTimeout(() => {
					window.location.href = data.authorizationUrl;
				}, 1000);
			} else {
				showError(data.error || 'Failed to initialize payment');
				loading = false;
			}
		} catch (error) {
			showError('Failed to fund wallet');
		} finally {
			// Don't reset loading on success since we're redirecting
			if (!loading) {
				loading = false;
			}
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

		<!-- Security Indicator -->
		<div
			class="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3"
		>
			<div class="flex items-center gap-2">
				<Shield class="h-5 w-5 text-blue-600" />
				<span class="text-sm font-medium text-blue-900">Payments secured by Korapay</span>
			</div>
			<a
				href="/support"
				class="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
			>
				Wallet FAQ
			</a>
		</div>

		<!-- Fund Wallet Form -->
		<div class="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold">Fund Wallet</h3>
				<div class="flex items-center gap-1 text-xs text-gray-500">
					<Lock class="h-3 w-3" />
					<span>Secure</span>
				</div>
			</div>

			<!-- Quick Amount Buttons -->
			<div class="mb-4">
				<p class="mb-2 text-sm font-medium text-gray-700">Quick Amount</p>
				<div class="grid grid-cols-4 gap-2">
					{#each quickAmounts as amount}
						<button
							onclick={() => setQuickAmount(amount)}
							disabled={loading}
							class="rounded-lg border-2 {fundAmount === amount.toString()
								? 'border-blue-600 bg-blue-50 text-blue-600'
								: 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50'} px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
						>
							₦{(amount / 1000).toFixed(0)}k
						</button>
					{/each}
				</div>
			</div>

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
					disabled={loading}
					class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if loading}
						<RefreshCw class="h-5 w-5 animate-spin" />
						Processing...
					{:else}
						<Plus class="h-5 w-5" />
						Fund Wallet
					{/if}
				</button>
			</div>

			<!-- Helper Text -->
			<div class="mt-4 space-y-2">
				<div class="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
					<Zap class="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
					<div>
						<p class="text-sm font-semibold text-green-800">Instant Credit</p>
						<p class="text-sm text-green-700">
							Your wallet is credited instantly after successful payment verification.
						</p>
					</div>
				</div>
				<div class="flex items-start gap-2">
					<Lock class="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
					<p class="text-xs text-gray-600">
						<span class="font-semibold text-gray-700">Secure payment by Korapay.</span> Supports cards,
						bank transfer, and mobile money. Maximum: ₦850,000 per transaction.
					</p>
				</div>
			</div>
		</div>

		<!-- Transaction History -->
		<div>
			<h3 class="mb-4 text-lg font-semibold">Transaction History</h3>
			{#if walletTransactions.length === 0}
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200"
					>
						<Wallet class="h-8 w-8 text-gray-400" />
					</div>
					<h4 class="mb-2 text-lg font-semibold text-gray-900">No Transactions Yet</h4>
					<p class="mb-6 text-sm text-gray-600">
						Your transaction history will appear here once you fund your wallet or make a purchase.
					</p>
					<button
						onclick={() => {
							// Scroll to fund wallet form
							const fundWalletSection = document.querySelector('h3');
							fundWalletSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
							// Focus the amount input
							setTimeout(() => {
								const amountInput = document.querySelector(
									'input[type="number"]'
								) as HTMLInputElement;
								amountInput?.focus();
							}, 500);
						}}
						class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white transition-all hover:bg-blue-700 active:scale-95"
					>
						<Plus class="h-5 w-5" />
						Fund Wallet Now
					</button>
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
