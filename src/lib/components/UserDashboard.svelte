<script lang="ts">
	import {
		ShoppingCart,
		Package,
		User,
		Settings,
		LogOut,
		Clock,
		CheckCircle,
		RefreshCw,
		Eye,
		EyeOff,
		Share2,
		Copy,
		DollarSign,
		Wallet,
		Plus,
		ArrowUpRight,
		ArrowDownLeft
	} from '@lucide/svelte';
	import { showSuccess, showError } from '$lib/stores/toasts';

	let activeTab = $state('orders');
	let isLoadingAffiliate = $state(false);
	let affiliateData = $state<any>(null);
	let walletBalance = $state<number>(0);
	let walletTransactions = $state<any[]>([]);
	let loadingWallet = $state(false);
	let fundAmount = $state<string>('');
	let purchases = $state<any[]>([]);
	let loadingPurchases = $state(false);
	let maskedFields = $state<Record<string, boolean>>({});

	let user = {
		name: 'John Doe',
		email: 'john.doe@example.com',
		joinDate: 'March 2024',
		totalOrders: 0,
		totalSpent: 0
	};

	let orders: any[] = [
		// Orders will be loaded from actual data
	];

	let messages: any[] = [
		// Messages will be loaded from actual data
	];

	function getStatusIcon(status: any) {
		switch (status) {
			case 'delivered':
			case 'completed':
				return CheckCircle;
			case 'processing':
				return RefreshCw;
			default:
				return Clock;
		}
	}

	function getStatusColor(status: any) {
		switch (status) {
			case 'delivered':
			case 'completed':
				return 'text-green-600';
			case 'processing':
				return 'text-blue-600';
			default:
				return 'text-yellow-600';
		}
	}

	function reorderItems(order: any) {
		// Add reorder logic here
		console.log('Reordering:', order);
	}

	async function loadAffiliateStats() {
		try {
			const response = await fetch('/api/affiliate/stats');
			const data = await response.json();
			if (data.success) {
				affiliateData = data.data;
			}
		} catch (error) {
			console.error('Error loading affiliate stats:', error);
		}
	}

	async function enableAffiliate() {
		isLoadingAffiliate = true;
		try {
			const response = await fetch('/api/affiliate/enable', { method: 'POST' });
			const data = await response.json();

			if (data.success) {
				showSuccess('Affiliate mode enabled! Your code: ' + data.affiliateCode);
				await loadAffiliateStats();
			} else {
				showError(data.error || 'Failed to enable affiliate mode');
			}
		} catch (error) {
			showError('Failed to enable affiliate mode');
		} finally {
			isLoadingAffiliate = false;
		}
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard.writeText(text);
		showSuccess(`${label} copied to clipboard!`);
	}

	async function loadWalletData() {
		loadingWallet = true;
		try {
			const [balanceRes, transactionsRes] = await Promise.all([
				fetch('/api/wallet/balance'),
				fetch('/api/wallet/transactions?limit=20')
			]);

			const balanceData = await balanceRes.json();
			const transactionsData = await transactionsRes.json();

			if (balanceData.success) {
				walletBalance = balanceData.balance || 0;
			}

			if (transactionsData.success) {
				walletTransactions = transactionsData.transactions || [];
			}
		} catch (error) {
			console.error('Error loading wallet data:', error);
		} finally {
			loadingWallet = false;
		}
	}

	async function fundWallet() {
		const amount = parseFloat(fundAmount);
		if (!amount || amount < 100) {
			showError('Please enter an amount of at least ₦100');
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
				// Redirect to Paystack payment
				window.location.href = data.authorizationUrl;
			} else {
				showError(data.error || 'Failed to initialize payment');
			}
		} catch (error) {
			showError('Failed to fund wallet');
		}
	}

	async function loadPurchases() {
		loadingPurchases = true;
		try {
			const response = await fetch('/api/purchases');
			const data = await response.json();

			if (data.purchases) {
				purchases = data.purchases;
				// Initialize all fields as masked
				const masked: Record<string, boolean> = {};
				purchases.forEach((purchase) => {
					purchase.accounts.forEach((account: any) => {
						masked[`${account.id}-password`] = true;
						masked[`${account.id}-emailPassword`] = true;
						masked[`${account.id}-twoFa`] = true;
					});
				});
				maskedFields = masked;
			}
		} catch (error) {
			console.error('Error loading purchases:', error);
			showError('Failed to load purchases');
		} finally {
			loadingPurchases = false;
		}
	}

	function toggleMask(accountId: string, field: string) {
		const key = `${accountId}-${field}`;
		maskedFields[key] = !maskedFields[key];
	}

	function maskValue(value: string | null | undefined): string {
		if (!value) return 'N/A';
		return '•'.repeat(Math.min(value.length, 12));
	}

	$effect(() => {
		if (activeTab === 'affiliate') {
			loadAffiliateStats();
		} else if (activeTab === 'wallet') {
			loadWalletData();
		} else if (activeTab === 'purchases') {
			loadPurchases();
		}
	});
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
	<!-- Header -->
	<div class="mb-8 rounded-lg border border-gray-200 bg-white p-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center">
				<div
					class="mr-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-xl font-bold text-white"
				>
					{user.name
						.split(' ')
						.map((n) => n[0])
						.join('')}
				</div>
				<div>
					<h1 class="text-2xl font-bold text-gray-900">Welcome back, {user.name}!</h1>
					<p class="text-gray-600">Member since {user.joinDate}</p>
				</div>
			</div>
			<div class="text-right">
				<div class="text-sm text-gray-600">Total Spent</div>
				<div class="text-2xl font-bold text-blue-600">₦{user.totalSpent.toLocaleString()}</div>
			</div>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<Package class="mr-3 h-8 w-8 text-blue-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">{user.totalOrders}</div>
					<div class="text-gray-600">Total Orders</div>
				</div>
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<CheckCircle class="mr-3 h-8 w-8 text-green-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">
						{orders.filter((o) => o.status === 'delivered' || o.status === 'completed').length}
					</div>
					<div class="text-gray-600">Completed Orders</div>
				</div>
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<RefreshCw class="mr-3 h-8 w-8 text-blue-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">
						{orders.filter((o) => o.status === 'processing').length}
					</div>
					<div class="text-gray-600">In Progress</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Navigation Tabs -->
	<div class="mb-6">
		<nav class="flex space-x-8">
			<button
				onclick={() => (activeTab = 'orders')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'orders'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Order History
			</button>
			<button
				onclick={() => (activeTab = 'purchases')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'purchases'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Purchases
			</button>
			<button
				onclick={() => (activeTab = 'messages')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'messages'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Messages ({messages.filter((m) => !m.read).length})
			</button>
			<button
				onclick={() => (activeTab = 'affiliate')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'affiliate'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Affiliate
			</button>
			<button
				onclick={() => (activeTab = 'wallet')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'wallet'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Wallet
			</button>
			<button
				onclick={() => (activeTab = 'profile')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'profile'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Profile Settings
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'orders'}
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 p-6">
				<h2 class="text-xl font-semibold">Order History</h2>
				<p class="text-gray-600">Track your purchases and reorder items</p>
			</div>

			<div class="divide-y divide-gray-200">
				{#each orders as order}
					<div class="p-6">
						<div class="mb-4 flex items-center justify-between">
							<div class="flex items-center">
								{#if order.status === 'delivered' || order.status === 'completed'}
									<CheckCircle class="mr-2 h-5 w-5 text-green-600" />
								{:else if order.status === 'processing'}
									<RefreshCw class="mr-2 h-5 w-5 text-blue-600" />
								{:else}
									<Clock class="mr-2 h-5 w-5 text-yellow-600" />
								{/if}
								<div>
									<div class="font-semibold">Order {order.id}</div>
									<div class="text-sm text-gray-600">{order.date}</div>
								</div>
							</div>
							<div class="text-right">
								<div class="font-semibold">₦{order.total.toLocaleString()}</div>
								<div class="text-sm text-gray-600 capitalize">{order.status}</div>
							</div>
						</div>

						<div class="mb-4 space-y-2">
							{#each order.items as item}
								<div class="flex justify-between text-sm">
									<span>{item.type}</span>
									<span class="text-gray-600">{item.details}</span>
								</div>
							{/each}
						</div>

						<div class="flex items-center justify-between">
							<div class="text-sm text-gray-600">
								Delivery: {order.deliveryMethod}
								{#if order.deliveredAt}
									• Delivered {order.deliveredAt}
								{:else if order.estimatedDelivery}
									• Est. {order.estimatedDelivery}
								{/if}
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => reorderItems(order)}
									class="rounded-lg border border-blue-600 px-4 py-2 text-blue-600 transition-colors hover:bg-blue-50"
								>
									Reorder
								</button>
								<button
									class="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50"
								>
									View Details
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if activeTab === 'messages'}
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 p-6">
				<h2 class="text-xl font-semibold">Inbox</h2>
				<p class="text-gray-600">Order updates and important notifications</p>
			</div>

			<div class="divide-y divide-gray-200">
				{#each messages as message}
					<div class="p-6 transition-colors hover:bg-gray-50 {!message.read ? 'bg-blue-50' : ''}">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="mb-2 flex items-center">
									<div class="font-semibold {!message.read ? 'text-blue-600' : 'text-gray-900'}">
										{message.subject}
									</div>
									{#if !message.read}
										<div class="ml-2 h-2 w-2 rounded-full bg-blue-500"></div>
									{/if}
								</div>
								<p class="mb-2 text-sm text-gray-700">{message.content}</p>
								<div class="text-xs text-gray-500">{message.date}</div>
							</div>
							<button class="ml-4 p-2 text-gray-400 hover:text-gray-600">
								<Eye class="h-4 w-4" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if activeTab === 'purchases'}
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 p-6">
				<h2 class="text-xl font-semibold">Your Purchases</h2>
				<p class="text-gray-600">Access your purchased accounts and credentials</p>
			</div>

			{#if loadingPurchases}
				<div class="flex items-center justify-center p-12">
					<RefreshCw class="mr-2 h-6 w-6 animate-spin text-blue-600" />
					<span class="text-gray-600">Loading your purchases...</span>
				</div>
			{:else if purchases.length === 0}
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
								<div class="text-right">
									<div class="font-semibold text-gray-900">
										{purchase.quantity} Account{purchase.quantity > 1 ? 's' : ''}
									</div>
									<div class="text-sm text-gray-600">{purchase.platform}</div>
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
												{#if account.deliveryNotes}
													<span class="text-xs text-gray-500">{account.deliveryNotes}</span>
												{/if}
											</div>

											<div class="space-y-3">
												<!-- Username -->
												{#if account.username}
													<div class="flex items-center justify-between rounded bg-white p-3">
														<div class="flex-1">
															<div class="text-xs font-medium text-gray-500 uppercase">
																Username
															</div>
															<div class="font-mono text-sm text-gray-900">{account.username}</div>
														</div>
														<button
															onclick={() => copyToClipboard(account.username, 'Username')}
															class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
														>
															<Copy class="h-4 w-4" />
														</button>
													</div>
												{/if}

												<!-- Password -->
												{#if account.password}
													<div class="flex items-center justify-between rounded bg-white p-3">
														<div class="flex-1">
															<div class="text-xs font-medium text-gray-500 uppercase">
																Password
															</div>
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
																onclick={() => copyToClipboard(account.password, 'Password')}
																class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
															onclick={() => copyToClipboard(account.email, 'Email')}
															class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
																	copyToClipboard(account.emailPassword, 'Email Password')}
																class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
															<div class="text-xs font-medium text-gray-500 uppercase">
																2FA Code
															</div>
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
																onclick={() => copyToClipboard(account.twoFa, '2FA Code')}
																class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
															onclick={() => copyToClipboard(account.linkUrl, 'Account Link')}
															class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
	{/if}

	{#if activeTab === 'affiliate'}
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 p-6">
				<h2 class="text-xl font-semibold">Affiliate Program</h2>
				<p class="text-gray-600">Earn commissions by referring customers</p>
			</div>

			<div class="p-6">
				{#if affiliateData}
					<!-- Affiliate Stats -->
					<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
						<div
							class="rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100 p-6"
						>
							<div class="flex items-center">
								<Share2 class="mr-3 h-8 w-8 text-blue-600" />
								<div>
									<div class="text-2xl font-bold text-gray-900">{affiliateData.totalReferrals}</div>
									<div class="text-gray-600">Total Referrals</div>
								</div>
							</div>
						</div>
						<div
							class="rounded-lg border border-gray-200 bg-gradient-to-br from-green-50 to-green-100 p-6"
						>
							<div class="flex items-center">
								<DollarSign class="mr-3 h-8 w-8 text-green-600" />
								<div>
									<div class="text-2xl font-bold text-gray-900">
										₦{affiliateData.totalSales.toLocaleString()}
									</div>
									<div class="text-gray-600">Total Sales</div>
								</div>
							</div>
						</div>
						<div
							class="rounded-lg border border-gray-200 bg-gradient-to-br from-purple-50 to-purple-100 p-6"
						>
							<div class="flex items-center">
								<CheckCircle class="mr-3 h-8 w-8 text-purple-600" />
								<div>
									<div class="text-2xl font-bold text-gray-900">
										₦{affiliateData.totalCommission.toLocaleString()}
									</div>
									<div class="text-gray-600">Total Commission</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Affiliate Code & Link -->
					<div class="space-y-4">
						<div>
							<label class="mb-2 block text-sm font-medium text-gray-700">Your Affiliate Code</label
							>
							<div class="flex gap-2">
								<input
									type="text"
									value={affiliateData.affiliateCode}
									readonly
									class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-lg font-bold"
								/>
								<button
									onclick={() => copyToClipboard(affiliateData.affiliateCode, 'Affiliate code')}
									class="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
								>
									<Copy class="h-5 w-5" />
								</button>
							</div>
						</div>

						<div>
							<label class="mb-2 block text-sm font-medium text-gray-700">Referral Link</label>
							<div class="flex gap-2">
								<input
									type="text"
									value={`https://fastaccs.vercel.app/?ref=${affiliateData.affiliateCode}`}
									readonly
									class="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm"
								/>
								<button
									onclick={() =>
										copyToClipboard(
											`https://fastaccs.vercel.app/?ref=${affiliateData.affiliateCode}`,
											'Referral link'
										)}
									class="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
								>
									<Copy class="h-5 w-5" />
								</button>
							</div>
						</div>

						<div class="rounded-lg bg-blue-50 p-4">
							<p class="text-sm text-gray-700">
								<strong>How it works:</strong> Share your referral link with friends. When they make
								a purchase using your code, you'll earn
								<strong>{affiliateData.commissionRate}%</strong> commission on their order total.
							</p>
						</div>
					</div>
				{:else}
					<!-- Enable Affiliate Mode -->
					<div class="py-12 text-center">
						<Share2 class="mx-auto mb-4 h-16 w-16 text-gray-400" />
						<h3 class="mb-2 text-xl font-semibold text-gray-900">Join Our Affiliate Program</h3>
						<p class="mx-auto mb-6 max-w-md text-gray-600">
							Become an affiliate and earn commissions by referring customers. Get your unique code
							and start earning today!
						</p>
						<button
							onclick={enableAffiliate}
							disabled={isLoadingAffiliate}
							class="rounded-lg bg-blue-600 px-8 py-3 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
						>
							{isLoadingAffiliate ? 'Enabling...' : 'Become an Affiliate'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if activeTab === 'wallet'}
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
						{loadingWallet ? '...' : `₦${walletBalance.toLocaleString()}`}
					</div>
				</div>

				<!-- Fund Wallet Form -->
				<div class="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
					<h3 class="mb-4 text-lg font-semibold">Fund Wallet</h3>
					<div class="flex gap-3">
						<input
							type="number"
							bind:value={fundAmount}
							placeholder="Enter amount (min ₦100)"
							min="100"
							step="100"
							class="flex-1 rounded-lg border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
						<button
							onclick={fundWallet}
							class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
						>
							<Plus class="h-5 w-5" />
							Fund Wallet
						</button>
					</div>
					<p class="mt-2 text-sm text-gray-600">
						Pay with Paystack (cards, bank transfer, USSD, mobile money)
					</p>
				</div>

				<!-- Transaction History -->
				<div>
					<h3 class="mb-4 text-lg font-semibold">Transaction History</h3>
					{#if loadingWallet}
						<div class="py-8 text-center text-gray-500">Loading transactions...</div>
					{:else if walletTransactions.length === 0}
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
	{/if}

	{#if activeTab === 'profile'}
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-6 text-xl font-semibold">Profile Settings</h2>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div>
					<label for="profileName" class="mb-1 block text-sm font-medium text-gray-700"
						>Full Name</label
					>
					<input
						id="profileName"
						type="text"
						value={user.name}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="profileEmail" class="mb-1 block text-sm font-medium text-gray-700"
						>Email Address</label
					>
					<input
						id="profileEmail"
						type="email"
						value={user.email}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="whatsappNumber" class="mb-1 block text-sm font-medium text-gray-700"
						>WhatsApp Number</label
					>
					<input
						id="whatsappNumber"
						type="tel"
						placeholder="+234..."
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="telegramUsername" class="mb-1 block text-sm font-medium text-gray-700"
						>Telegram Username</label
					>
					<input
						id="telegramUsername"
						type="text"
						placeholder="@username"
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
			</div>

			<div class="mt-6 flex gap-4">
				<button
					class="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
				>
					Save Changes
				</button>
				<button
					class="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-50"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}
</div>
