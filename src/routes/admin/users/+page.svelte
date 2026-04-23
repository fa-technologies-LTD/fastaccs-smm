<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Users,
		UserCheck,
		Mail,
		Phone,
		Wallet,
		ShoppingBag,
		Calendar,
		Search,
		Download,
		ArrowUpRight,
		ShieldOff,
		ShieldCheck
	} from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatPrice, formatDate, exportToCSV } from '$lib/helpers/utils';
	import { ADMIN_MONEY_VISIBILITY_KEY, formatAdminMoney } from '$lib/helpers/admin-money';

	let { data }: { data: PageData } = $props();
	const canViewRevenue = Boolean(data.canViewRevenue);
	let hideMonetaryAmounts = $state(false);

	let searchQuery = $state('');
	let filterType = $state('all');
	let currentPage = $state(1);
	let itemsPerPage = 20;

	let stats = $derived({
		totalUsers: data.stats?.totalUsers || 0,
		registeredUsers: data.stats?.registeredUsers || 0,
		guestUsers: data.stats?.guestUsers || 0,
		affiliates: data.stats?.affiliates || 0,
		activeUsers: data.stats?.activeUsers || 0,
		totalRevenue: data.stats?.totalRevenue || 0
	});

	let users = $state(data.users || []);

	let filteredUsers = $derived.by(() => {
		let filtered = users;

		if (filterType !== 'all') {
			filtered = filtered.filter((user: any) => {
				switch (filterType) {
					case 'registered':
						return user.userType === 'REGISTERED';
					case 'guest':
						return user.userType === 'GUEST';
					case 'affiliate':
						return user.isAffiliateEnabled;
					case 'active':
						return user.isActive;
					case 'inactive':
						return !user.isActive;
					default:
						return true;
				}
			});
		}

		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(user: any) =>
					user.email?.toLowerCase().includes(query) ||
					user.fullName?.toLowerCase().includes(query) ||
					user.id.includes(query) ||
					user.phone?.includes(query)
			);
		}

		return filtered;
	});

	let paginatedUsers = $derived.by(() => {
		const startIndex = (currentPage - 1) * itemsPerPage;
		return filteredUsers.slice(startIndex, startIndex + itemsPerPage);
	});

	let totalPages = $derived(Math.ceil(filteredUsers.length / itemsPerPage));

	function exportData() {
		const today = new Date().toISOString().split('T')[0];
		const csvData = filteredUsers.map((user: any) => ({
			ID: user.id,
			Name: user.fullName || 'N/A',
			Email: user.email || 'N/A',
			Phone: user.phone || 'N/A',
			Type: user.userType,
			'Is Active': user.isActive ? 'Yes' : 'No',
			'Is Affiliate': user.isAffiliateEnabled ? 'Yes' : 'No',
			'Email Verified': user.emailVerified ? 'Yes' : 'No',
			'Total Orders': user.orderCount,
			'Total Spent': canViewRevenue ? user.totalSpent : 'RESTRICTED',
			'Store Credit': user.storeCreditBalance || 0,
			'Registered At': formatDate(user.registeredAt),
			'Last Login': user.lastLogin ? formatDate(user.lastLogin) : 'Never'
		}));

		exportToCSV(csvData, `users-${today}.csv`);

		addToast({
			type: 'success',
			title: 'Export completed successfully',
			duration: 3000
		});
	}

	function formatAdminAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canViewRevenue,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}

	function getUserTypeStyle(userType: string) {
		return userType === 'REGISTERED'
			? 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border)'
			: 'background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border)';
	}

	function getStatusStyle(isActive: boolean) {
		return isActive
			? 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border)'
			: 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border)';
	}

	async function toggleUserAccess(userId: string, isCurrentlyActive: boolean, label: string) {
		try {
			const response = await fetch(`/api/admin/users/${userId}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: !isCurrentlyActive })
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || `Failed to update ${label}`);
			}

			users = users.map((user: any) =>
				user.id === userId ? { ...user, isActive: result.data.isActive } : user
			);

			addToast({
				type: 'success',
				title: result.data.isActive ? `${label} reactivated` : `${label} suspended`,
				duration: 2800
			});
		} catch (error) {
			addToast({
				type: 'error',
				title: error instanceof Error ? error.message : 'Failed to update user access',
				duration: 3500
			});
		}
	}

	onMount(() => {
		hideMonetaryAmounts = localStorage.getItem(ADMIN_MONEY_VISIBILITY_KEY) === 'true';
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold" style="color: var(--text)">User Management</h1>
			<p class="mt-1" style="color: var(--text-muted)">Manage and monitor all user accounts</p>
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

	<!-- Stats Grid -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted)">
						Total Users
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--text)">{stats.totalUsers}</p>
				</div>
				<div class="rounded-full bg-blue-100 p-2">
					<Users class="h-5 w-5 text-blue-600" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted)">
						Registered
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--text)">{stats.registeredUsers}</p>
				</div>
				<div class="rounded-full bg-green-100 p-2">
					<UserCheck class="h-5 w-5 text-green-600" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted)">
						Active
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--status-success);">
						{stats.activeUsers}
					</p>
				</div>
				<div class="rounded-full p-2" style="background: rgba(5,212,113,0.12);">
					<UserCheck class="h-5 w-5" style="color: var(--status-success);" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted)">
						Guests
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--text);">{stats.guestUsers}</p>
				</div>
				<div class="rounded-full p-2" style="background: var(--bg-elev-2);">
					<Users class="h-5 w-5" style="color: var(--text-muted);" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted)">
						Affiliates
					</p>
					<p class="mt-1 text-xl font-bold" style="color: #a855f7;">{stats.affiliates}</p>
				</div>
				<div class="rounded-full p-2" style="background: rgba(168,85,247,0.12);">
					<Users class="h-5 w-5" style="color: #a855f7;" />
				</div>
			</div>
		</div>

		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide uppercase" style="color: var(--text-muted)">
						Total Revenue
					</p>
					<p class="mt-1 text-xl font-bold" style="color: var(--status-success);">
						{formatAdminAmount(stats.totalRevenue)}
					</p>
				</div>
				<div class="rounded-full p-2" style="background: rgba(5,212,113,0.12);">
					<Wallet class="h-5 w-5" style="color: var(--status-success);" />
				</div>
			</div>
		</div>
	</div>

	<!-- Filters and Search -->
	<div class="rounded-lg p-4" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
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
						placeholder="Search by name, email, phone, or ID..."
						class="w-full rounded-lg py-2 pr-4 pl-10 focus:ring-1 focus:outline-none"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					/>
				</div>
			</div>
			<div class="flex gap-2">
				<select
					bind:value={filterType}
					class="rounded-lg px-4 py-2 focus:ring-1 focus:outline-none"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
				>
					<option value="all">All Users</option>
					<option value="registered">Registered</option>
					<option value="guest">Guest</option>
					<option value="affiliate">Affiliates</option>
					<option value="active">Active</option>
					<option value="inactive">Inactive</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Users Table -->
	<div class="rounded-lg" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
		<div class="p-4" style="border-bottom: 1px solid var(--border)">
			<h2 class="text-base font-semibold" style="color: var(--text)">
				Users ({filteredUsers.length})
			</h2>
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
							Contact
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
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Orders
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Total Spent
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Store Credit
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Registered
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border); background: var(--bg-elev-1);">
					{#if paginatedUsers.length === 0}
						<tr>
							<td colspan="9" class="px-6 py-12 text-center" style="color: var(--text-muted);"
								>No users found</td
							>
						</tr>
					{:else}
						{#each paginatedUsers as user}
							<tr
								class="transition-colors"
								style="--hover-bg: var(--bg-elev-2);"
								onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
								onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
							>
								<td class="px-6 py-4 whitespace-nowrap">
									<div>
										<div class="text-sm font-medium" style="color: var(--text);">
											{user.fullName || 'No name'}
										</div>
										<div class="text-xs" style="color: var(--text-muted);">
											{user.id.slice(0, 8)}...
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm" style="color: var(--text);">
										{#if user.email}
											<div class="flex items-center gap-1">
												<Mail class="h-3 w-3" style="color: var(--text-dim);" />
												<span>{user.email}</span>
											</div>
										{/if}
										{#if user.phone}
											<div class="mt-1 flex items-center gap-1">
												<Phone class="h-3 w-3" style="color: var(--text-dim);" />
												<span>{user.phone}</span>
											</div>
										{/if}
										{#if !user.email && !user.phone}
											<span style="color: var(--text-dim);">No contact</span>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
										style={getUserTypeStyle(user.userType)}
									>
										{user.userType}
									</span>
									{#if user.isAffiliateEnabled}
										<span
											class="mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold"
											style="background: rgba(168,85,247,0.12); color: #a855f7; border: 1px solid #a855f7;"
										>
											Affiliate
										</span>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
										style={getStatusStyle(user.isActive)}
									>
										{user.isActive ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center gap-1">
										<ShoppingBag class="h-4 w-4" style="color: var(--text-dim);" />
										<span class="text-sm" style="color: var(--text);">{user.orderCount}</span>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium" style="color: var(--text);">
										{formatAdminAmount(user.totalSpent)}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if user.isAffiliateEnabled}
										<div class="flex items-center gap-1">
											<Wallet class="h-4 w-4" style="color: var(--text-dim);" />
											<span class="text-sm" style="color: var(--text);"
												>{formatPrice(user.storeCreditBalance || 0)}</span
											>
										</div>
									{:else}
										<span class="text-sm" style="color: var(--text-dim);">—</span>
									{/if}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text-muted);">
									<div class="flex items-center gap-1">
										<Calendar class="h-4 w-4" style="color: var(--text-dim);" />
										<span>{formatDate(user.registeredAt)}</span>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex flex-col items-start gap-1.5">
										<a
											href={`/admin/users/${user.id}`}
											class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all hover:opacity-80"
											style="background: rgba(105,109,250,0.14); color: var(--link); border: 1px solid rgba(170,173,255,0.25);"
										>
											<ArrowUpRight class="h-3.5 w-3.5" />
											View Activity
										</a>
										<button
											onclick={() =>
												toggleUserAccess(
													user.id,
													user.isActive,
													user.fullName || user.email || 'User'
												)}
											class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all hover:scale-95 active:scale-90"
											style={user.isActive
												? 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border)'
												: 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border)'}
										>
											{#if user.isActive}
												<ShieldOff class="h-3.5 w-3.5" />
												Suspend
											{:else}
												<ShieldCheck class="h-3.5 w-3.5" />
												Unblock
											{/if}
										</button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div
				class="px-4 py-3 sm:px-6"
				style="border-top: 1px solid var(--border); background: var(--bg-elev-2);"
			>
				<div class="flex items-center justify-between">
					<div class="text-sm" style="color: var(--text-muted);">
						Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(
							currentPage * itemsPerPage,
							filteredUsers.length
						)} of {filteredUsers.length} users
					</div>
					<div class="flex gap-2">
						<button
							onclick={() => (currentPage = Math.max(1, currentPage - 1))}
							disabled={currentPage === 1}
							class="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						>
							Previous
						</button>
						<div class="flex gap-1">
							{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
								const pageNum = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
								return pageNum;
							}) as pageNum}
								<button
									onclick={() => (currentPage = pageNum)}
									class="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80"
									style={currentPage === pageNum
										? 'background: rgba(105,109,250,0.12); color: var(--link); border: 1px solid var(--link)'
										: 'background: var(--bg); color: var(--text); border: 1px solid var(--border)'}
								>
									{pageNum}
								</button>
							{/each}
						</div>
						<button
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							disabled={currentPage === totalPages}
							class="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						>
							Next
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
