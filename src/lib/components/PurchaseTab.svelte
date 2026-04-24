<script lang="ts">
	import { Package, CheckCircle, Copy, Clock, Shield, Lock } from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import { copyToClipboard } from '$lib/helpers/utils';
	import { resolveCredentialField } from '$lib/helpers/credential-links';

	let { initialPurchases } = $props();
	let purchases = $state<any[]>(initialPurchases);

	function copyAccount(account: any, index: number) {
		const twoFa = resolveCredentialField(account.twoFa);
		const link = resolveCredentialField(account.linkUrl);
		let details = `Account ${index + 1}\n`;
		details += `Username: ${account.username}\n`;
		details += `Password: ${account.password}`;
		if (account.email) details += `\nEmail: ${account.email}`;
		if (account.emailPassword) details += `\nEmail Password: ${account.emailPassword}`;
		if (twoFa.display) details += `\n2FA: ${twoFa.display}`;
		if (link.display) details += `\nLink: ${link.display}`;

		copyToClipboard(details, {
			successMessage: 'Account credentials copied',
			showToast: addToast
		});
	}

	function copyAllPurchaseAccounts(purchase: any) {
		const header = `${purchase.categoryName} • ${purchase.orderNumber}\n${purchase.platform}\nDelivered: ${formatDateTime(purchase.deliveryDate || purchase.orderDate)}\n\n`;
		const accountsWithHeader = purchase.accounts.map((account: any, index: number) => {
			const twoFa = resolveCredentialField(account.twoFa);
			const link = resolveCredentialField(account.linkUrl);
			let details = `Account ${index + 1}\nUsername: ${account.username}\nPassword: ${account.password}`;
			if (account.email) details += `\nEmail: ${account.email}`;
			if (account.emailPassword) details += `\nEmail Password: ${account.emailPassword}`;
			if (twoFa.display) details += `\n2FA: ${twoFa.display}`;
			if (link.display) details += `\nLink: ${link.display}`;
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

<div
	class="rounded-[var(--r-md)] border border-[var(--border)]"
	style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
>
	<div class="border-b border-[var(--border)] p-4 sm:p-6">
		<h2 class="text-base font-semibold" style="color: var(--text); font-family: var(--font-head);">
			Your Purchases
		</h2>
		<p style="color: var(--text-muted);">Access your purchased accounts and credentials</p>
	</div>

	<!-- Security Notice -->
	<div class="border-b border-[var(--border)] p-4" style="background: rgba(5,212,113,0.08);">
		<div class="flex items-start gap-3">
			<Shield class="mt-0.5 h-5 w-5 flex-shrink-0" style="color: var(--primary);" />
			<div class="flex-1">
				<div class="flex items-center gap-2">
					<p class="text-sm font-semibold" style="color: var(--text);">
						Your credentials are secure
					</p>
					<Lock class="h-3.5 w-3.5" style="color: var(--primary);" />
				</div>
				<p class="mt-1 text-xs" style="color: var(--text-muted);">
					All account details are encrypted and delivered only to you. Need login guidance? See the
					<a href="/support#faq" class="font-medium underline" style="color: var(--link);">
						quick account care guide
					</a>
					and report issues within 2 hours for the fastest support response.
				</p>
			</div>
		</div>
	</div>

	{#if purchases.length === 0}
		<div class="p-12 text-center">
			<Package class="mx-auto mb-4 h-12 w-12" style="color: var(--text-dim);" />
			<h3
				class="mb-2 text-base font-semibold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				No Purchases Yet
			</h3>
			<p style="color: var(--text-muted);">Start shopping to see your purchased accounts here!</p>
		</div>
	{:else}
		<div class="divide-y divide-[var(--border)]">
			{#each purchases as purchase}
				<div class="p-4 sm:p-5">
					<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div class="min-w-0">
							<h3 class="font-semibold" style="color: var(--text); font-family: var(--font-head);">
								{purchase.categoryName}
							</h3>
							<div
								class="flex flex-wrap items-center gap-2 text-xs sm:gap-3 sm:text-sm"
								style="color: var(--text-muted);"
							>
								<span class="min-w-0 truncate font-medium">#{purchase.orderNumber}</span>
								<span class="text-[color:var(--text-dim)]">•</span>
								<div class="flex items-center gap-1.5">
									<Clock class="h-3.5 w-3.5" style="color: var(--text-dim);" />
									<span class="whitespace-nowrap" style="color: var(--text-muted);">
										{formatDateTime(purchase.deliveryDate || purchase.orderDate)}
									</span>
								</div>
								<span class="text-[color:var(--text-dim)]">•</span>
								<span class="font-medium" style="color: var(--primary);">Delivered</span>
							</div>
						</div>
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
							<div class="text-left sm:text-right">
								<div
									class="font-semibold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									{purchase.quantity} Account{purchase.quantity > 1 ? 's' : ''}
								</div>
								<div class="text-sm" style="color: var(--text-dim);">{purchase.platform}</div>
							</div>
							{#if purchase.accounts && purchase.accounts.length > 0}
								<button
									onclick={() => copyAllPurchaseAccounts(purchase)}
									class="copy-all-btn flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 sm:w-auto"
									style="background: linear-gradient(180deg, rgba(5,212,113,0.92), rgba(13,145,82,0.92)); border: 1px solid rgba(5,212,113,0.45); color: #04140C;"
									title="Copy all accounts in this order"
								>
									<Copy class="h-4 w-4" />
									Copy All
								</button>
							{/if}
						</div>
					</div>

					{#if purchase.accounts && purchase.accounts.length > 0}
						<div class="space-y-3">
							{#each purchase.accounts as account, index}
								<div
									class="rounded-[var(--r-sm)] border-2 border-[var(--border-2)] p-4"
									style="background: var(--surface);"
								>
									<div
										class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
									>
										<div class="flex flex-wrap items-center gap-2">
											<CheckCircle class="h-5 w-5" style="color: var(--primary);" />
											<span class="text-sm font-medium" style="color: var(--text-dim);">
												#{index + 1}
											</span>
											{#if account.deliveryNotes}
												<span class="text-sm" style="color: var(--text-dim);"
													>• {account.deliveryNotes}</span
												>
											{/if}
										</div>
										<button
											onclick={() => copyAccount(account, index)}
											class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all hover:-translate-y-0.5 sm:w-auto"
											style="background: var(--surface-2); border: 1px solid var(--border-2); color: var(--text-muted);"
											title="Copy this account's credentials"
										>
											<Copy class="h-3.5 w-3.5" />
											Copy Account
										</button>
									</div>

									<div
										class="space-y-2 rounded-[var(--r-sm)] p-3 font-mono text-sm sm:p-4"
										style="background: rgba(0,0,0,0.3);"
									>
										<!-- Username -->
										<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
											<span class="w-24 font-semibold sm:w-32" style="color: var(--text-muted);"
												>Username:</span
											>
											<span class="credential-value flex-1" style="color: var(--text);"
												>{account.username}</span
											>
										</div>

										<!-- Password -->
										<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
											<span class="w-24 font-semibold sm:w-32" style="color: var(--text-muted);"
												>Password:</span
											>
											<span class="credential-value flex-1" style="color: var(--text);"
												>{account.password}</span
											>
										</div>

										<!-- Email (if available) -->
										{#if account.email}
											<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
												<span class="w-24 font-semibold sm:w-32" style="color: var(--text-muted);"
													>Email:</span
												>
												<span class="credential-value flex-1" style="color: var(--text);"
													>{account.email}</span
												>
											</div>
										{/if}

										<!-- Email Password (if available) -->
										{#if account.emailPassword}
											<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
												<span class="w-24 font-semibold sm:w-32" style="color: var(--text-muted);"
													>Email Pass:</span
												>
												<span class="credential-value flex-1" style="color: var(--text);"
													>{account.emailPassword}</span
												>
											</div>
										{/if}

										<!-- 2FA (if available) -->
										{#if account.twoFa}
											{@const twoFaField = resolveCredentialField(account.twoFa)}
											{#if twoFaField.display}
												<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
													<span class="w-24 font-semibold sm:w-32" style="color: var(--text-muted);"
														>2FA Code:</span
													>
													{#if twoFaField.isUrl && twoFaField.href}
														<a
															href={twoFaField.href}
															target="_blank"
															rel="noopener noreferrer"
															class="credential-value flex-1 hover:underline"
															style="color: var(--link);"
														>
															{twoFaField.display}
														</a>
													{:else}
														<span class="credential-value flex-1" style="color: var(--text);"
															>{twoFaField.display}</span
														>
													{/if}
												</div>
											{/if}
										{/if}

										<!-- Link (if available) -->
										{#if account.linkUrl}
											{@const linkField = resolveCredentialField(account.linkUrl)}
											{#if linkField.display}
												<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
													<span class="w-24 font-semibold sm:w-32" style="color: var(--text-muted);"
														>Link:</span
													>
													{#if linkField.isUrl && linkField.href}
														<a
															href={linkField.href}
															target="_blank"
															rel="noopener noreferrer"
															class="credential-value flex-1 hover:underline"
															style="color: var(--link);"
														>
															{linkField.display}
														</a>
													{:else}
														<span class="credential-value flex-1" style="color: var(--text);"
															>{linkField.display}</span
														>
													{/if}
												</div>
											{/if}
										{/if}
									</div>

									<!-- Account Stats (if available) -->
									{#if account.followers || account.following || account.postsCount}
										<div class="mt-4 grid grid-cols-3 gap-4 border-t border-[var(--border)] pt-4">
											{#if account.followers}
												<div>
													<div class="text-xs font-medium" style="color: var(--text-dim);">
														Followers
													</div>
													<div
														class="text-sm font-semibold"
														style="color: var(--text); font-family: var(--font-head);"
													>
														{account.followers.toLocaleString()}
													</div>
												</div>
											{/if}
											{#if account.following}
												<div>
													<div class="text-xs font-medium" style="color: var(--text-dim);">
														Following
													</div>
													<div
														class="text-sm font-semibold"
														style="color: var(--text); font-family: var(--font-head);"
													>
														{account.following.toLocaleString()}
													</div>
												</div>
											{/if}
											{#if account.postsCount}
												<div>
													<div class="text-xs font-medium" style="color: var(--text-dim);">
														Posts
													</div>
													<div
														class="text-sm font-semibold"
														style="color: var(--text); font-family: var(--font-head);"
													>
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

<style>
	.copy-all-btn {
		letter-spacing: 0.01em;
		box-shadow: 0 8px 18px rgba(5, 212, 113, 0.18);
	}

	.credential-value {
		min-width: 0;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
</style>
