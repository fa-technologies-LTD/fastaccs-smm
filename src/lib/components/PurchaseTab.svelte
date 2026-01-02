<script lang="ts">
	import { Package, CheckCircle, Copy, Clock, Shield, Lock } from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import { copyToClipboard } from '$lib/helpers/utils';

	let { initialPurchases } = $props();
	let purchases = $state<any[]>(initialPurchases);

	function copyAccount(account: any, index: number) {
		let details = `=== Account ${index + 1} ===\n`;
		details += `Username: ${account.username}\n`;
		details += `Password: ${account.password}`;
		if (account.email) details += `\nEmail: ${account.email}`;
		if (account.emailPassword) details += `\nEmail Password: ${account.emailPassword}`;
		if (account.twoFa) details += `\n2FA: ${account.twoFa}`;
		if (account.linkUrl) details += `\nLink: ${account.linkUrl}`;

		copyToClipboard(details, {
			successMessage: 'Account credentials copied',
			showToast: addToast
		});
	}

	function copyAllPurchaseAccounts(purchase: any) {
		const header = `${purchase.categoryName} - Order #${purchase.orderNumber}\n${purchase.platform}\nDelivered: ${formatDateTime(purchase.deliveryDate || purchase.orderDate)}\n\n`;
		const accountsWithHeader = purchase.accounts.map((account: any, index: number) => {
			let details = `=== Account ${index + 1} ===\nUsername: ${account.username}\nPassword: ${account.password}`;
			if (account.email) details += `\nEmail: ${account.email}`;
			if (account.emailPassword) details += `\nEmail Password: ${account.emailPassword}`;
			if (account.twoFa) details += `\n2FA: ${account.twoFa}`;
			if (account.linkUrl) details += `\nLink: ${account.linkUrl}`;
			return details;
		});

		copyToClipboard(header + accountsWithHeader.join('\n\n'), {
			successMessage: 'All accounts copied',
			showToast: addToast
		});
	}

	function formatDateTime(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: true
		});
	}
</script>

<div class="rounded-lg border border-gray-200 bg-white">
	<div class="border-b border-gray-200 p-6">
		<h2 class="text-xl font-semibold">Your Purchases</h2>
		<p class="text-gray-600">Access your purchased accounts and credentials</p>
	</div>

	<!-- Security Notice -->
	<div class="border-b border-gray-200 bg-blue-50 p-4">
		<div class="flex items-start gap-3">
			<Shield class="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
			<div class="flex-1">
				<div class="flex items-center gap-2">
					<p class="text-sm font-semibold text-blue-900">Your credentials are secure</p>
					<Lock class="h-3.5 w-3.5 text-blue-600" />
				</div>
				<p class="mt-1 text-xs text-blue-700">
					All account details are encrypted and delivered only to you. Need help?
					<a href="/support" class="font-medium underline hover:text-blue-800"> Contact Support </a>
				</p>
			</div>
		</div>
	</div>

	{#if purchases.length === 0}
		<div class="p-12 text-center">
			<Package class="mx-auto mb-4 h-12 w-12 text-gray-400" />
			<h3 class="mb-2 text-lg font-semibold text-gray-900">No Purchases Yet</h3>
			<p class="text-gray-600">Start shopping to see your purchased accounts here!</p>
		</div>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each purchases as purchase}
				<div class="p-6">
					<div class="mb-4 flex items-center justify-between">
						<div>
							<h3 class="font-semibold text-gray-900">{purchase.categoryName}</h3>
							<div class="flex items-center gap-3 text-sm text-gray-600">
								<span class="font-medium">Order #{purchase.orderNumber}</span>
								<span>•</span>
								<div class="flex items-center gap-1.5">
									<Clock class="h-3.5 w-3.5 text-gray-500" />
									<span class="text-gray-700">
										{formatDateTime(purchase.deliveryDate || purchase.orderDate)}
									</span>
								</div>
								<span>•</span>
								<span class="font-medium text-green-600">Delivered</span>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<div class="text-right">
								<div class="font-semibold text-gray-900">
									{purchase.quantity} Account{purchase.quantity > 1 ? 's' : ''}
								</div>
								<div class="text-sm text-gray-600">{purchase.platform}</div>
							</div>
							{#if purchase.accounts && purchase.accounts.length > 0}
								<button
									onclick={() => copyAllPurchaseAccounts(purchase)}
									class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:scale-105 hover:bg-blue-700 active:scale-95"
									title="Copy all accounts in this order"
								>
									<Copy class="h-4 w-4" />
									Copy All Accounts
								</button>
							{/if}
						</div>
					</div>

					{#if purchase.accounts && purchase.accounts.length > 0}
						<div class="space-y-3">
							{#each purchase.accounts as account, index}
								<div class="rounded-lg border-2 border-gray-200 bg-white p-5">
									<div class="mb-4 flex items-center justify-between">
										<div class="flex items-center gap-2">
											<CheckCircle class="h-5 w-5 text-green-600" />
											<span class="text-sm font-medium text-gray-500">
												#{index + 1}
											</span>
											{#if account.deliveryNotes}
												<span class="text-sm text-gray-500">• {account.deliveryNotes}</span>
											{/if}
										</div>
										<button
											onclick={() => copyAccount(account, index)}
											class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-all hover:scale-105 hover:bg-gray-200 active:scale-95"
											title="Copy this account's credentials"
										>
											<Copy class="h-3.5 w-3.5" />
											Copy Account
										</button>
									</div>

									<div class="space-y-2 rounded-lg bg-gray-50 p-4 font-mono text-sm">
										<!-- Username -->
										<div class="flex">
											<span class="w-32 font-semibold text-gray-600">Username:</span>
											<span class="flex-1 text-gray-900">{account.username}</span>
										</div>

										<!-- Password -->
										<div class="flex">
											<span class="w-32 font-semibold text-gray-600">Password:</span>
											<span class="flex-1 text-gray-900">{account.password}</span>
										</div>

										<!-- Email (if available) -->
										{#if account.email}
											<div class="flex">
												<span class="w-32 font-semibold text-gray-600">Email:</span>
												<span class="flex-1 text-gray-900">{account.email}</span>
											</div>
										{/if}

										<!-- Email Password (if available) -->
										{#if account.emailPassword}
											<div class="flex">
												<span class="w-32 font-semibold text-gray-600">Email Pass:</span>
												<span class="flex-1 text-gray-900">{account.emailPassword}</span>
											</div>
										{/if}

										<!-- 2FA (if available) -->
										{#if account.twoFa}
											<div class="flex">
												<span class="w-32 font-semibold text-gray-600">2FA Code:</span>
												<span class="flex-1 text-gray-900">{account.twoFa}</span>
											</div>
										{/if}

										<!-- Link (if available) -->
										{#if account.linkUrl}
											<div class="flex">
												<span class="w-32 font-semibold text-gray-600">Link:</span>
												<a
													href={account.linkUrl}
													target="_blank"
													rel="noopener noreferrer"
													class="flex-1 text-blue-600 hover:underline"
												>
													{account.linkUrl}
												</a>
											</div>
										{/if}
									</div>

									<!-- Account Stats (if available) -->
									{#if account.followers || account.following || account.postsCount}
										<div class="mt-4 grid grid-cols-3 gap-4 border-t border-gray-200 pt-4">
											{#if account.followers}
												<div>
													<div class="text-xs font-medium text-gray-500">Followers</div>
													<div class="text-sm font-semibold text-gray-900">
														{account.followers.toLocaleString()}
													</div>
												</div>
											{/if}
											{#if account.following}
												<div>
													<div class="text-xs font-medium text-gray-500">Following</div>
													<div class="text-sm font-semibold text-gray-900">
														{account.following.toLocaleString()}
													</div>
												</div>
											{/if}
											{#if account.postsCount}
												<div>
													<div class="text-xs font-medium text-gray-500">Posts</div>
													<div class="text-sm font-semibold text-gray-900">
														{account.postsCount.toLocaleString()}
													</div>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
