<script lang="ts">
	import { Package, CheckCircle, Eye, EyeOff, Copy } from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import { copyToClipboard, copyAccountDetails, copyAllAccounts } from '$lib/helpers/utils';

	let { initialPurchases } = $props();
	let purchases = $state<any[]>(initialPurchases);
	let maskedFields = $state<Record<string, boolean>>({});

	function copyAllPurchaseAccounts(purchase: any) {
		const header = `${purchase.categoryName} - Order #${purchase.orderNumber}\n${purchase.platform}\n\n`;
		const accountsWithHeader = purchase.accounts.map((account: any, index: number) => {
			let details = `=== Account ${index + 1} ===\nUsername: ${account.username}\nPassword: ${account.password}`;
			if (account.email) details += `\nEmail: ${account.email}`;
			if (account.emailPassword) details += `\nEmail Password: ${account.emailPassword}`;
			if (account.twoFa) details += `\n2FA: ${account.twoFa}`;
			if (account.linkUrl) details += `\nLink: ${account.linkUrl}`;
			return details;
		});

		copyToClipboard(header + accountsWithHeader.join('\n\n'), {
			successMessage: `Copied all ${purchase.accounts.length} account(s) details!`,
			showToast: addToast
		});
	}

	// Initialize masked fields for purchases
	function initializeMaskedFields() {
		const masked: Record<string, boolean> = {};
		purchases.forEach((purchase) => {
			purchase.accounts?.forEach((account: any) => {
				masked[`${account.id}-password`] = true;
				masked[`${account.id}-emailPassword`] = true;
				masked[`${account.id}-twoFa`] = true;
			});
		});
		maskedFields = masked;
	}

	function toggleMask(accountId: string, field: string) {
		const key = `${accountId}-${field}`;
		maskedFields[key] = !maskedFields[key];
	}

	function maskValue(value: string | null | undefined): string {
		if (!value) return 'N/A';
		return '•'.repeat(Math.min(value.length, 12));
	}

	// Initialize masked fields on mount
	$effect(() => {
		if (purchases.length > 0 && Object.keys(maskedFields).length === 0) {
			initializeMaskedFields();
		}
	});
</script>

<div class="rounded-lg border border-gray-200 bg-white">
	<div class="border-b border-gray-200 p-6">
		<h2 class="text-xl font-semibold">Your Purchases</h2>
		<p class="text-gray-600">Access your purchased accounts and credentials</p>
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
								<span>Order #{purchase.orderNumber}</span>
								<span>•</span>
								<span>{new Date(purchase.orderDate).toLocaleDateString()}</span>
								<span>•</span>
								<span class="text-green-600">Delivered</span>
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
									class="cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
									title="Copy all accounts in this order"
								>
									<Copy class="h-4 w-4" />
									Copy All
								</button>
							{/if}
						</div>
					</div>

					{#if purchase.accounts && purchase.accounts.length > 0}
						<div class="space-y-4">
							{#each purchase.accounts as account}
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
									<div class="mb-3 flex items-center justify-between">
										<div class="flex items-center">
											<CheckCircle class="mr-2 h-5 w-5 text-green-600" />
											<span class="font-medium text-gray-900">{account.platform} Account</span>
										</div>
										<div class="flex items-center gap-2">
											{#if account.deliveryNotes}
												<span class="text-xs text-gray-500">{account.deliveryNotes}</span>
											{/if}
											<button
												onclick={() => copyAccountDetails(account, { showToast: addToast })}
												class="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 hover:scale-105 active:scale-95"
												title="Copy all details for this account"
											>
												<Copy class="h-4 w-4 " />
											</button>
										</div>
									</div>

									<div class="space-y-3">
										<!-- Username -->
										{#if account.username}
											<div class="flex items-center justify-between rounded bg-white p-3">
												<div class="flex-1">
													<div class="text-xs font-medium text-gray-500 uppercase">Username</div>
													<div class="font-mono text-sm text-gray-900">{account.username}</div>
												</div>
												<button
													onclick={() =>
														copyToClipboard(account.username, {
															label: 'Username',
															showToast: addToast
														})}
													class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 "
												>
													<Copy class="h-4 w-4" />
												</button>
											</div>
										{/if}

										<!-- Password -->
										{#if account.password}
											<div class="flex items-center justify-between rounded bg-white p-3">
												<div class="flex-1">
													<div class="text-xs font-medium text-gray-500 uppercase">Password</div>
													<div class="font-mono text-sm text-gray-900">
														{maskedFields[`${account.id}-password`]
															? maskValue(account.password)
															: account.password}
													</div>
												</div>
												<div class="flex gap-2">
													<button
														onclick={() => toggleMask(account.id, 'password')}
														class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
													>
														{#if maskedFields[`${account.id}-password`]}
															<Eye class="h-4 w-4" />
														{:else}
															<EyeOff class="h-4 w-4" />
														{/if}
													</button>
													<button
														onclick={() =>
															copyToClipboard(account.password, {
																label: 'Password',
																showToast: addToast
															})}
														class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:scale-105 active:scale-95"
													>
														<Copy class="h-4 w-4" />
													</button>
												</div>
											</div>
										{/if}

										<!-- Email -->
										{#if account.email}
											<div class="flex items-center justify-between rounded bg-white p-3">
												<div class="flex-1">
													<div class="text-xs font-medium text-gray-500 uppercase">Email</div>
													<div class="font-mono text-sm text-gray-900">{account.email}</div>
												</div>
												<button
													onclick={() =>
														copyToClipboard(account.email, { label: 'Email', showToast: addToast })}
													class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:scale-105 active:scale-95"
												>
													<Copy class="h-4 w-4" />
												</button>
											</div>
										{/if}

										<!-- Email Password -->
										{#if account.emailPassword}
											<div class="flex items-center justify-between rounded bg-white p-3">
												<div class="flex-1">
													<div class="text-xs font-medium text-gray-500 uppercase">
														Email Password
													</div>
													<div class="font-mono text-sm text-gray-900">
														{maskedFields[`${account.id}-emailPassword`]
															? maskValue(account.emailPassword)
															: account.emailPassword}
													</div>
												</div>
												<div class="flex gap-2">
													<button
														onclick={() => toggleMask(account.id, 'emailPassword')}
														class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
													>
														{#if maskedFields[`${account.id}-emailPassword`]}
															<Eye class="h-4 w-4" />
														{:else}
															<EyeOff class="h-4 w-4" />
														{/if}
													</button>
													<button
														onclick={() =>
															copyToClipboard(account.emailPassword, {
																label: 'Email Password',
																showToast: addToast
															})}
														class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:scale-105 active:scale-95"
													>
														<Copy class="h-4 w-4" />
													</button>
												</div>
											</div>
										{/if}

										<!-- 2FA Code -->
										{#if account.twoFa}
											<div class="flex items-center justify-between rounded bg-white p-3">
												<div class="flex-1">
													<div class="text-xs font-medium text-gray-500 uppercase">2FA Code</div>
													<div class="font-mono text-sm text-gray-900">
														{maskedFields[`${account.id}-twoFa`]
															? maskValue(account.twoFa)
															: account.twoFa}
													</div>
												</div>
												<div class="flex gap-2">
													<button
														onclick={() => toggleMask(account.id, 'twoFa')}
														class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
													>
														{#if maskedFields[`${account.id}-twoFa`]}
															<Eye class="h-4 w-4" />
														{:else}
															<EyeOff class="h-4 w-4" />
														{/if}
													</button>
													<button
														onclick={() =>
															copyToClipboard(account.twoFa, {
																label: '2FA Code',
																showToast: addToast
															})}
														class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:scale-105 active:scale-95"
													>
														<Copy class="h-4 w-4" />
													</button>
												</div>
											</div>
										{/if}

										<!-- Account Link -->
										{#if account.linkUrl}
											<div class="flex items-center justify-between rounded bg-white p-3">
												<div class="flex-1">
													<div class="text-xs font-medium text-gray-500 uppercase">
														Account Link
													</div>
													<div class="text-sm text-blue-600 hover:underline">
														<a href={account.linkUrl} target="_blank" rel="noopener noreferrer">
															Open Account →
														</a>
													</div>
												</div>
												<button
													onclick={() =>
														copyToClipboard(account.linkUrl, {
															label: 'Account Link',
															showToast: addToast
														})}
													class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:scale-105 active:scale-95"
												>
													<Copy class="h-4 w-4" />
												</button>
											</div>
										{/if}

										<!-- Account Stats -->
										{#if account.followers || account.following || account.postsCount}
											<div class="grid grid-cols-3 gap-2 rounded bg-white p-3">
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

										<!-- Additional Info -->
										<div class="flex flex-wrap gap-2 text-xs text-gray-600">
											{#if account.twoFactorEnabled !== null}
												<span class="rounded-full bg-gray-100 px-2 py-1">
													2FA: {account.twoFactorEnabled ? 'Enabled' : 'Disabled'}
												</span>
											{/if}
											{#if account.easyLoginEnabled !== null}
												<span class="rounded-full bg-gray-100 px-2 py-1">
													Easy Login: {account.easyLoginEnabled ? 'Yes' : 'No'}
												</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
