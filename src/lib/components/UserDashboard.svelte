<script lang="ts">
	import {
		Package,
		CheckCircle,
		Wallet,
		TrendingUp,
		ShoppingBag,
		History,
		Settings,
		LayoutGrid,
		Plus,
		MessageCircle,
		ArrowDown,
		Check
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { getPlatformIcon } from '$lib/helpers/platformColors';
	import { formatPrice } from '$lib/helpers/utils';

	let {
		name,
		orders,
		joinDate,
		affiliateData: initialAffiliateData = null,
		walletBalance: initialWalletBalance = 0,
		walletTransactions: initialWalletTransactions = [],
		purchases: initialPurchases = [],
		user
	} = $props();

	let activeSection = $state('overview');

	// Calculate stats from orders
	let totalOrders = $derived(orders.length);
	let completedOrders = $derived(
		orders.filter((o: any) => o.status === 'delivered' || o.status === 'completed').length
	);
	let activeAccounts = $derived(initialPurchases?.length || 0);
	let totalSpent = $derived(
		orders.reduce((sum: number, order: any) => sum + (Number(order.totalAmount) || 0), 0)
	);

	// Get recent accounts (first 3 purchases)
	let recentAccounts = $derived(initialPurchases?.slice(0, 3) || []);

	// Get recent orders (first 3 orders)
	let recentOrders = $derived(orders.slice(0, 3) || []);

	// Calculate monthly change (mock data for now)
	let monthlyOrderChange = $derived(-3);

	function getStatusColor(status: string) {
		switch (status) {
			case 'delivered':
			case 'completed':
				return 'var(--status-success)';
			case 'processing':
				return 'var(--status-warning)';
			case 'pending':
				return 'var(--status-pending)';
			default:
				return 'var(--text-dim)';
		}
	}

	function getStatusBadgeClass(status: string) {
		switch (status) {
			case 'delivered':
			case 'completed':
				return 'status-delivered';
			case 'processing':
				return 'status-processing';
			case 'pending':
				return 'status-pending';
			default:
				return 'status-default';
		}
	}
</script>

<div class="dashboard-container">
	<!-- Sidebar Navigation -->
	<aside class="dashboard-sidebar">
		<div class="sidebar-header">
			<div class="logo-container">
				<div class="logo-icon">FA</div>
				<span class="logo-text">FastAccs</span>
			</div>
		</div>

		<nav class="sidebar-nav">
			<button
				class="nav-item {activeSection === 'overview' ? 'active' : ''}"
				onclick={() => (activeSection = 'overview')}
			>
				<LayoutGrid size={20} />
				<span>Overview</span>
			</button>
			<button
				class="nav-item {activeSection === 'accounts' ? 'active' : ''}"
				onclick={() => (activeSection = 'accounts')}
			>
				<Package size={20} />
				<span>My Accounts</span>
			</button>
			<button
				class="nav-item {activeSection === 'orders' ? 'active' : ''}"
				onclick={() => (activeSection = 'orders')}
			>
				<History size={20} />
				<span>Order History</span>
			</button>
			<button
				class="nav-item {activeSection === 'wallet' ? 'active' : ''}"
				onclick={() => (activeSection = 'wallet')}
			>
				<Wallet size={20} />
				<span>Wallet</span>
			</button>
			<button class="nav-item" onclick={() => goto('/platforms')}>
				<ShoppingBag size={20} />
				<span>Browse Platforms</span>
			</button>
			<button
				class="nav-item {activeSection === 'settings' ? 'active' : ''}"
				onclick={() => (activeSection = 'settings')}
			>
				<Settings size={20} />
				<span>Settings</span>
			</button>
		</nav>

		<div class="sidebar-footer">
			<div class="user-profile">
				<div class="user-avatar">
					{name
						.split(' ')
						.map((n: string) => n[0])
						.join('')}
				</div>
				<div class="user-info">
					<div class="user-name">{name}</div>
					<div class="user-email">{user?.email || 'john@example.com'}</div>
				</div>
			</div>
		</div>
	</aside>

	<!-- Main Content -->
	<main class="dashboard-main">
		<!-- Welcome Header -->
		<div class="welcome-header">
			<h1 class="welcome-title">Welcome back, {name.split(' ')[0]}! 👋</h1>
			<p class="welcome-subtitle">Here's what's happening with your accounts today</p>
		</div>

		<!-- Stats Cards -->
		<div class="stats-grid">
			<!-- Total Orders -->
			<div class="stat-card">
				<div class="stat-label">
					<Package size={16} />
					<span>total orders</span>
				</div>
				<div class="stat-value">{totalOrders}</div>
				<div class="stat-change negative">
					<ArrowDown size={12} />
					<span>{Math.abs(monthlyOrderChange)} this month</span>
				</div>
			</div>

			<!-- Completed Orders -->
			<div class="stat-card">
				<div class="stat-label">
					<CheckCircle size={16} />
					<span>completed orders</span>
				</div>
				<div class="stat-value">{completedOrders}</div>
				<div class="stat-change positive">
					<Check size={12} />
					<span>All time</span>
				</div>
			</div>

			<!-- Wallet Balance -->
			<div class="stat-card">
				<div class="stat-label">
					<Wallet size={16} />
					<span>Wallet Balance</span>
				</div>
				<div class="stat-value">{formatPrice(initialWalletBalance)}</div>
				<div class="stat-meta">Available balance</div>
			</div>

			<!-- Total Spent -->
			<div class="stat-card">
				<div class="stat-label">
					<TrendingUp size={16} />
					<span>total spent</span>
				</div>
				<div class="stat-value">{activeAccounts}</div>
				<div class="stat-meta">Currently active</div>
			</div>
		</div>

		<!-- Recent Accounts -->
		<div class="section-card">
			<div class="section-header">
				<h2 class="section-title">My Recent Accounts</h2>
				<button class="view-all-link" onclick={() => (activeSection = 'accounts')}>
					View All
				</button>
			</div>

			<div class="accounts-list">
				{#each recentAccounts as account}
					{@const PlatformIcon = getPlatformIcon(account.platformSlug || 'default')}
					<div class="account-item">
						<div class="account-icon">
							<PlatformIcon size={24} class="text-white" />
						</div>
						<div class="account-details">
							<div class="account-name">{account.username || 'Account'}</div>
							<div class="account-meta">
								{account.platformName} • {account.followersCount || '45.2K'} followers • Purchased {new Date(
									account.deliveredAt || Date.now()
								).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</div>
						</div>
						<span class="status-badge active">Active</span>
						<button class="view-details-btn">View Details</button>
					</div>
				{/each}
			</div>
		</div>

		<!-- Recent Orders Table -->
		<div class="section-card">
			<div class="section-header">
				<h2 class="section-title">Recent Orders</h2>
				<button class="view-all-link" onclick={() => (activeSection = 'orders')}> View All </button>
			</div>

			<div class="orders-table">
				<table>
					<thead>
						<tr>
							<th>ORDER ID</th>
							<th>PLATFORM</th>
							<th>ACCOUNT TYPE</th>
							<th>DATE</th>
							<th>AMOUNT</th>
							<th>STATUS</th>
							<th>ACTION</th>
						</tr>
					</thead>
					<tbody>
						{#each recentOrders as order}
							{@const PlatformIcon = getPlatformIcon(order.items?.[0]?.category?.slug || 'default')}
							<tr>
								<td class="order-id">#{order.id.slice(0, 13)}</td>
								<td class="platform-cell">
									<div class="platform-icon-wrapper">
										<PlatformIcon size={16} class="text-white" />
									</div>
									<span>{order.items?.[0]?.category?.name || 'Platform'}</span>
								</td>
								<td>{order.items?.[0]?.category?.metadata?.accountType || 'Account Type'}</td>
								<td
									>{new Date(order.createdAt).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}</td
								>
								<td class="amount">{formatPrice(order.totalAmount)}</td>
								<td>
									<span class="status-badge {getStatusBadgeClass(order.status)}">
										{order.status === 'delivered' ? 'Delivered' : order.status}
									</span>
								</td>
								<td>
									<button class="action-btn" onclick={() => goto(`/order/${order.id}`)}>
										View
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Quick Actions -->
		<div class="quick-actions">
			<h3 class="quick-actions-title">Quick Actions</h3>
			<div class="quick-actions-grid">
				<button class="action-btn-primary" onclick={() => goto('/platforms')}>
					<ShoppingBag size={20} />
					<span>Browse Accounts</span>
				</button>
				<button class="action-btn-secondary">
					<Plus size={20} />
					<span>Add Funds</span>
				</button>
				<button class="action-btn-secondary" onclick={() => goto('https://wa.link/fast_accounts')}>
					<MessageCircle size={20} />
					<span>Contact Support</span>
				</button>
			</div>
		</div>
	</main>
</div>

<style>
	.dashboard-container {
		display: flex;
		min-height: 100vh;
		background: var(--bg);
	}

	/* Sidebar */
	.dashboard-sidebar {
		width: 240px;
		background: linear-gradient(180deg, #0a4d3c 0%, #083d31 100%);
		display: flex;
		flex-direction: column;
		position: fixed;
		height: 100vh;
		left: 0;
		top: 0;
	}

	.sidebar-header {
		padding: 1.5rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.logo-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.logo-icon {
		width: 32px;
		height: 32px;
		background: var(--primary);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.875rem;
		color: #000;
	}

	.logo-text {
		font-size: 1.125rem;
		font-weight: 700;
		color: white;
		font-family: var(--font-head);
	}

	.sidebar-nav {
		flex: 1;
		padding: 1rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.9375rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		font-family: var(--font-body);
	}

	.nav-item:hover {
		background: rgba(255, 255, 255, 0.05);
		color: white;
	}

	.nav-item.active {
		background: rgba(5, 212, 113, 0.15);
		color: var(--primary);
	}

	.sidebar-footer {
		padding: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.user-profile {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--primary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.875rem;
		color: #000;
	}

	.user-info {
		flex: 1;
		min-width: 0;
	}

	.user-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
		font-family: var(--font-body);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-email {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		font-family: var(--font-body);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Main Content */
	.dashboard-main {
		flex: 1;
		margin-left: 240px;
		padding: 2rem 3rem;
	}

	.welcome-header {
		margin-bottom: 2rem;
	}

	.welcome-title {
		font-size: 2rem;
		font-weight: 700;
		color: var(--text);
		font-family: var(--font-head);
		margin-bottom: 0.25rem;
	}

	.welcome-subtitle {
		font-size: 0.9375rem;
		color: var(--text-muted);
		font-family: var(--font-body);
	}

	/* Stats Grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: var(--bg-elev-1);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.stat-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--text-muted);
		margin-bottom: 0.75rem;
		font-family: var(--font-body);
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		color: var(--text);
		font-family: var(--font-head);
		margin-bottom: 0.5rem;
	}

	.stat-change {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8125rem;
		font-family: var(--font-body);
	}

	.stat-change.negative {
		color: var(--status-error);
	}

	.stat-change.positive {
		color: var(--status-success);
	}

	.stat-meta {
		font-size: 0.8125rem;
		color: var(--text-dim);
		font-family: var(--font-body);
	}

	/* Section Card */
	.section-card {
		background: var(--bg-elev-1);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text);
		font-family: var(--font-head);
	}

	.view-all-link {
		font-size: 0.875rem;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-body);
		transition: color 0.2s;
	}

	.view-all-link:hover {
		color: var(--text);
	}

	/* Accounts List */
	.accounts-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.account-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.account-icon {
		width: 48px;
		height: 48px;
		border-radius: 10px;
		background: linear-gradient(135deg, #e1306c 0%, #f77737 50%, #fcaf45 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.account-details {
		flex: 1;
		min-width: 0;
	}

	.account-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text);
		font-family: var(--font-body);
		margin-bottom: 0.25rem;
	}

	.account-meta {
		font-size: 0.8125rem;
		color: var(--text-dim);
		font-family: var(--font-body);
	}

	.status-badge {
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
		font-family: var(--font-body);
	}

	.status-badge.active {
		background: rgba(5, 212, 113, 0.15);
		color: var(--status-success);
		border: 1px solid rgba(5, 212, 113, 0.3);
	}

	.status-badge.status-delivered {
		background: rgba(5, 212, 113, 0.15);
		color: var(--status-success);
		border: 1px solid rgba(5, 212, 113, 0.3);
	}

	.status-badge.status-processing {
		background: var(--status-warning-bg);
		color: var(--status-warning);
		border: 1px solid var(--status-warning-border);
	}

	.status-badge.status-pending {
		background: var(--status-pending-bg);
		color: var(--status-pending);
		border: 1px solid var(--status-pending-border);
	}

	.view-details-btn {
		padding: 0.5rem 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		font-family: var(--font-body);
		transition: all 0.2s;
	}

	.view-details-btn:hover {
		background: var(--bg-elev-2);
		border-color: var(--primary);
	}

	/* Orders Table */
	.orders-table {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	thead {
		border-bottom: 1px solid var(--border);
	}

	th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: var(--font-body);
	}

	tbody tr {
		border-bottom: 1px solid var(--border);
		transition: background 0.2s;
	}

	tbody tr:hover {
		background: var(--bg-elev-2);
	}

	td {
		padding: 1rem;
		font-size: 0.875rem;
		color: var(--text);
		font-family: var(--font-body);
	}

	.order-id {
		font-family: 'Courier New', monospace;
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	.platform-cell {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.platform-icon-wrapper {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		background: linear-gradient(135deg, #1da1f2 0%, #0e71c8 100%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.amount {
		font-weight: 600;
		color: var(--text);
	}

	.action-btn {
		padding: 0.375rem 0.875rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		font-family: var(--font-body);
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: var(--bg-elev-2);
		border-color: var(--primary);
	}

	/* Quick Actions */
	.quick-actions {
		margin-top: 2rem;
	}

	.quick-actions-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text);
		font-family: var(--font-head);
		margin-bottom: 1rem;
	}

	.quick-actions-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.action-btn-primary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		background: var(--btn-primary-gradient);
		border: none;
		border-radius: 10px;
		color: #04140c;
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--font-body);
		transition: all 0.2s;
	}

	.action-btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(5, 212, 113, 0.3);
	}

	.action-btn-secondary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		background: var(--bg-elev-1);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		font-size: 0.9375rem;
		font-weight: 500;
		cursor: pointer;
		font-family: var(--font-body);
		transition: all 0.2s;
	}

	.action-btn-secondary:hover {
		background: var(--bg-elev-2);
		border-color: var(--primary);
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.quick-actions-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 768px) {
		.dashboard-sidebar {
			display: none;
		}

		.dashboard-main {
			margin-left: 0;
			padding: 1.5rem;
		}

		.stats-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
