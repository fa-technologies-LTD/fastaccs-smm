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

<div
	class="rounded-[var(--r-md)] border border-[var(--border)]"
	style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
>
	<div class="border-b border-[var(--border)] p-6">
		<h2 class="text-base font-semibold" style="color: var(--text); font-family: var(--font-head);">
			Wallet
		</h2>
		<p style="color: var(--text-muted);">Manage your account balance and transactions</p>
	</div>

	<div class="p-6">
		<!-- Wallet Balance Card -->
		<div
			class="mb-8 rounded-[var(--r-md)] p-8"
			style="background: linear-gradient(135deg, rgba(5,212,113,0.20), rgba(105,109,250,0.15)); border: 1px solid var(--border-2);"
		>
			<div class="mb-2 flex items-center gap-2">
				<Wallet class="h-6 w-6" style="color: var(--primary);" />
				<span class="text-sm" style="color: var(--text-muted);">Available Balance</span>
			</div>
			<div class="text-xl font-semibold" style="color: var(--text); font-family: var(--font-head);">
				₦{Number(walletBalance).toLocaleString('en-US', {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				})}
			</div>
		</div>

		<!-- Security Indicator -->
		<div
			class="mb-4 flex items-center justify-between rounded-[var(--r-sm)] border border-[var(--border)] p-3"
			style="background: rgba(5,212,113,0.08);"
		>
			<div class="flex items-center gap-2">
				<Shield class="h-5 w-5" style="color: var(--primary);" />
				<span class="text-sm font-medium" style="color: var(--text);"
					>Payments secured by Korapay</span
				>
			</div>
			<a href="/support" class="text-xs font-medium hover:underline" style="color: var(--link);">
				Wallet FAQ
			</a>
		</div>

		<!-- Fund Wallet Form -->
		<div
			class="mb-8 rounded-[var(--r-md)] border border-[var(--border)] p-6"
			style="background: var(--surface-2);"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3
					class="text-base font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Fund Wallet
				</h3>
				<div class="flex items-center gap-1 text-xs" style="color: var(--text-dim);">
					<Lock class="h-3 w-3" />
					<span>Secure</span>
				</div>
			</div>

			<!-- Quick Amount Buttons -->
			<div class="mb-4">
				<p
					class="mb-2 text-sm font-medium"
					style="color: var(--text-muted); font-family: var(--font-head);"
				>
					Quick Amount
				</p>
				<div class="grid grid-cols-4 gap-2">
					{#each quickAmounts as amount}
						<button
							onclick={() => setQuickAmount(amount)}
							disabled={loading}
							class="rounded-[var(--r-sm)] border-2 sm:px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
							style={fundAmount === amount.toString()
								? 'border-color: var(--primary); background: rgba(5,212,113,0.12); color: var(--primary);'
								: 'border-color: var(--border); background: var(--surface); color: var(--text-muted);'}
						>
							₦{(amount / 1000).toFixed(0)}k
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col sm:flex-row gap-3">
				<input
					type="number"
					bind:value={fundAmount}
					placeholder="Enter amount (min ₦100, max ₦850,000)"
					min="100"
					max="850000"
					step="100"
					class="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] px-4 py-3 focus:outline-none"
					style="background: rgba(0,0,0,0.3); color: var(--text);"
				/>
				<button
					onclick={fundWallet}
					disabled={loading}
					class="flex items-center justify-center gap-2  rounded-full px-6 py-3 font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C; box-shadow: var(--glow-primary);"
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
			<div class="mt-4 space-y-4">
				<div
					class="flex items-start gap-2 rounded-[var(--r-sm)] border p-3"
					style="background: rgba(5,212,113,0.08); border-color: rgba(5,212,113,0.2);"
				>
					<Zap class="mt-0.5 h-5 w-5 flex-shrink-0" style="color: var(--primary);" />
					<div>
						<p class="text-sm font-semibold" style="color: var(--text);">Instant Credit</p>
						<p class="text-sm" style="color: var(--text-muted);">
							Your wallet is credited instantly after successful payment verification.
						</p>
					</div>
				</div>
				<div class="flex items-start gap-2">
					<Lock class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style="color: var(--text-dim);" />
					<p class="text-xs" style="color: var(--text-dim);">
						<span class="font-semibold" style="color: var(--text-muted);"
							>Secure payment by Korapay.</span
						> Supports cards, bank transfer, and mobile money. Maximum: ₦850,000 per transaction.
					</p>
				</div>
			</div>
		</div>

		<!-- Transaction History -->
		<div>
			<h3
				class="mb-4 text-base font-semibold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Transaction History
			</h3>
			{#if walletTransactions.length === 0}
				<div
					class="rounded-[var(--r-md)] border border-[var(--border)] p-12 text-center"
					style="background: var(--surface);"
				>
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
						style="background: var(--surface-2);"
					>
						<Wallet class="h-8 w-8" style="color: var(--text-dim);" />
					</div>
					<h4
						class="mb-2 text-base font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						No Transactions Yet
					</h4>
					<p class="mb-6 text-sm" style="color: var(--text-muted);">
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
						class="inline-flex items-center gap-2 rounded-full px-6 py-2.5 font-semibold transition-all hover:-translate-y-0.5 active:scale-95"
						style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C;"
					>
						<Plus class="h-5 w-5" />
						Fund Wallet
					</button>
				</div>
			{:else}
				<div class="space-y-3">
					{#each walletTransactions as transaction}
						<div
							class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
							style="background: var(--surface);"
						>
							<div class="flex items-start justify-between">
								<div class="flex items-start gap-3">
									<div
										class="rounded-full p-2"
										style="background: {transaction.type === 'deposit'
											? 'rgba(5,212,113,0.12)'
											: transaction.type === 'refund'
												? 'rgba(105,109,250,0.12)'
												: 'rgba(255,80,80,0.12)'};"
									>
										{#if transaction.type === 'deposit' || transaction.type === 'refund'}
											<ArrowDownLeft
												class="h-4 w-4"
												style="color: {transaction.type === 'deposit'
													? 'var(--primary)'
													: 'var(--link)'};"
											/>
										{:else}
											<ArrowUpRight class="h-4 w-4" style="color: var(--status-error);" />
										{/if}
									</div>
									<div>
										<div
											class="font-medium capitalize"
											style="color: var(--text); font-family: var(--font-head);"
										>
											{transaction.type}
										</div>
										<div class="text-sm" style="color: var(--text-muted);">
											{transaction.description}
										</div>
										<div class="text-xs" style="color: var(--text-dim);">
											{new Date(transaction.createdAt).toLocaleDateString()} •
											{new Date(transaction.createdAt).toLocaleTimeString()}
										</div>
									</div>
								</div>
								<div class="text-right">
									<div
										class="text-sm font-semibold"
										style="color: {transaction.type === 'deposit' || transaction.type === 'refund'
											? 'var(--primary)'
											: 'var(--status-error)'}; font-family: var(--font-head);"
									>
										{transaction.type === 'deposit' || transaction.type === 'refund'
											? '+'
											: '-'}₦{Number(transaction.amount).toLocaleString()}
									</div>
									<div class="text-xs" style="color: var(--text-dim);">
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
