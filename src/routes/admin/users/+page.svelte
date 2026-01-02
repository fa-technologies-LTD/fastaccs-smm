<script lang="ts">
	import {
		Users,
		UserCheck,
		Mail,
		Phone,
		Wallet,
		ShoppingBag,
		Calendar,
		Search,
		Download
	} from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatPrice, formatDate, exportToCSV } from '$lib/helpers/utils';

	let { data }: { data: PageData } = $props();

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

	let allUsers = $derived(data.users || []);

	let filteredUsers = $derived.by(() => {
		let filtered = allUsers;

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
			'Total Spent': user.totalSpent,
			'Wallet Balance': user.walletBalance,
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

	function getUserTypeBadge(userType: string) {
		return userType === 'REGISTERED' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
	}

	function getStatusBadge(isActive: boolean) {
		return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">User Management</h1>
			<p class="mt-1 text-gray-600">Manage and monitor all user accounts</p>
		</div>
		<button
			onclick={exportData}
			class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-all hover:scale-95 hover:bg-blue-700 active:scale-90"
		>
			<Download class="h-4 w-4" />
			Export Data
		</button>
	</div>

	<!-- Stats Grid -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Total Users</p>
					<p class="mt-1 text-xl font-bold text-gray-900">{stats.totalUsers}</p>
				</div>
				<div class="rounded-full bg-blue-100 p-2">
					<Users class="h-5 w-5 text-blue-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Registered</p>
					<p class="mt-1 text-xl font-bold text-gray-900">{stats.registeredUsers}</p>
				</div>
				<div class="rounded-full bg-green-100 p-2">
					<UserCheck class="h-5 w-5 text-green-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Active</p>
					<p class="mt-1 text-xl font-bold text-green-600">{stats.activeUsers}</p>
				</div>
				<div class="rounded-full bg-green-100 p-2">
					<UserCheck class="h-5 w-5 text-green-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Guests</p>
					<p class="mt-1 text-xl font-bold text-gray-900">{stats.guestUsers}</p>
				</div>
				<div class="rounded-full bg-gray-100 p-2">
					<Users class="h-5 w-5 text-gray-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Affiliates</p>
					<p class="mt-1 text-xl font-bold text-purple-600">{stats.affiliates}</p>
				</div>
				<div class="rounded-full bg-purple-100 p-2">
					<Users class="h-5 w-5 text-purple-600" />
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-wide text-gray-500 uppercase">Total Revenue</p>
					<p class="mt-1 text-xl font-bold text-green-600">{formatPrice(stats.totalRevenue)}</p>
				</div>
				<div class="rounded-full bg-green-100 p-2">
					<Wallet class="h-5 w-5 text-green-600" />
				</div>
			</div>
		</div>
	</div>

	<!-- Filters and Search -->
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex-1">
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by name, email, phone, or ID..."
						class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
			</div>
			<div class="flex gap-2">
				<select
					bind:value={filterType}
					class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
	<div class="rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 p-4">
			<h2 class="text-base font-semibold text-gray-900">Users ({filteredUsers.length})</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							User
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Contact
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Type
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Orders
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Total Spent
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Wallet
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Registered
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if paginatedUsers.length === 0}
						<tr>
							<td colspan="8" class="px-6 py-12 text-center text-gray-500">No users found</td>
						</tr>
					{:else}
						{#each paginatedUsers as user}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div>
										<div class="text-sm font-medium text-gray-900">
											{user.fullName || 'No name'}
										</div>
										<div class="text-xs text-gray-500">{user.id.slice(0, 8)}...</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm text-gray-900">
										{#if user.email}
											<div class="flex items-center gap-1">
												<Mail class="h-3 w-3 text-gray-400" />
												<span>{user.email}</span>
											</div>
										{/if}
										{#if user.phone}
											<div class="mt-1 flex items-center gap-1">
												<Phone class="h-3 w-3 text-gray-400" />
												<span>{user.phone}</span>
											</div>
										{/if}
										{#if !user.email && !user.phone}
											<span class="text-gray-400">No contact</span>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getUserTypeBadge(
											user.userType
										)}"
									>
										{user.userType}
									</span>
									{#if user.isAffiliateEnabled}
										<span
											class="mt-1 inline-flex rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-800"
										>
											Affiliate
										</span>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getStatusBadge(
											user.isActive
										)}"
									>
										{user.isActive ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center gap-1">
										<ShoppingBag class="h-4 w-4 text-gray-400" />
										<span class="text-sm text-gray-900">{user.orderCount}</span>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium text-gray-900">
										{formatPrice(user.totalSpent)}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center gap-1">
										<Wallet class="h-4 w-4 text-gray-400" />
										<span class="text-sm text-gray-900">{formatPrice(user.walletBalance)}</span>
									</div>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
									<div class="flex items-center gap-1">
										<Calendar class="h-4 w-4 text-gray-400" />
										<span>{formatDate(user.registeredAt)}</span>
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
			<div class="border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
				<div class="flex items-center justify-between">
					<div class="text-sm text-gray-700">
						Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(
							currentPage * itemsPerPage,
							filteredUsers.length
						)} of {filteredUsers.length} users
					</div>
					<div class="flex gap-2">
						<button
							onclick={() => (currentPage = Math.max(1, currentPage - 1))}
							disabled={currentPage === 1}
							class="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
									class="rounded-lg border px-3 py-1 text-sm font-medium {currentPage === pageNum
										? 'border-blue-500 bg-blue-50 text-blue-600'
										: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
								>
									{pageNum}
								</button>
							{/each}
						</div>
						<button
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							disabled={currentPage === totalPages}
							class="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Next
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
