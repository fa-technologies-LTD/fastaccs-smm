<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		Download,
		FileText,
		Users,
		AlertCircle,
		CheckCircle,
		Clock,
		X
	} from '@lucide/svelte';
	import type { BatchMetadata } from '$lib/services/batches';
	import type { AccountMetadata } from '$lib/services/accounts';

	// Props from load function
	interface Props {
		data: {
			batch: BatchMetadata;
			accounts: AccountMetadata[];
			error: string | null;
		};
	}

	let { data }: Props = $props();

	let batch = $state(data.batch);
	let accounts = $state(data.accounts);
	let filterStatus = $state('all');
	let searchTerm = $state('');

	// Filter accounts based on status and search
	const filteredAccounts = $derived(() => {
		let filtered = accounts;

		// Filter by status
		if (filterStatus !== 'all') {
			filtered = filtered.filter((account) => account.status === filterStatus);
		}

		// Filter by search term
		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
			filtered = filtered.filter(
				(account) =>
					account.username.toLowerCase().includes(term) ||
					account.platform?.toLowerCase().includes(term)
			);
		}

		return filtered;
	});

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'sold':
				return CheckCircle;
			case 'reserved':
				return Clock;
			case 'available':
				return Users;
			case 'unavailable':
				return X;
			default:
				return FileText;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'sold':
				return 'text-green-600 bg-green-50';
			case 'reserved':
				return 'text-yellow-600 bg-yellow-50';
			case 'available':
				return 'text-blue-600 bg-blue-50';
			case 'unavailable':
				return 'text-red-600 bg-red-50';
			default:
				return 'text-gray-600 bg-gray-50';
		}
	};

	const getBatchStatusIcon = (status: string) => {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'processing':
				return Clock;
			case 'failed':
				return X;
			default:
				return FileText;
		}
	};

	const getBatchStatusColor = (status: string) => {
		switch (status) {
			case 'completed':
				return 'text-green-600';
			case 'processing':
				return 'text-yellow-600';
			case 'failed':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	};

	const formatFileSize = (bytes: number) => {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	const formatNumber = (num: number) => {
		if (num >= 1000000) {
			return (num / 1000000).toFixed(1) + 'M';
		} else if (num >= 1000) {
			return (num / 1000).toFixed(1) + 'K';
		}
		return num.toString();
	};

	const exportAccounts = () => {
		// Create CSV content
		const headers = ['Username', 'Platform', 'Followers', 'Engagement Rate', 'Status', 'Price'];
		const csvContent = [
			headers.join(','),
			...filteredAccounts().map((account) =>
				[
					account.username,
					account.platform || 'N/A',
					account.followers || 0,
					account.engagement_rate || 0,
					account.status,
					account.price || 0
				].join(',')
			)
		].join('\n');

		// Download CSV
		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${batch.name}_accounts.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	};

	const goBack = () => {
		goto('/admin/batches');
	};
</script>

<svelte:head>
	<title>{batch.name} - Batch Details - Admin Panel</title>
</svelte:head>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<div class="mb-4 flex items-center gap-4">
			<button
				onclick={goBack}
				class="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 transition-colors hover:bg-gray-50"
			>
				<ArrowLeft size={20} />
			</button>
			<div class="flex-1">
				<div class="mb-2 flex items-center gap-3">
					{#if batch.status === 'completed'}
						<CheckCircle class="h-6 w-6 text-green-600" />
					{:else if batch.status === 'processing'}
						<Clock class="h-6 w-6 text-yellow-600" />
					{:else if batch.status === 'failed'}
						<X class="h-6 w-6 text-red-600" />
					{:else}
						<FileText class="h-6 w-6 text-gray-600" />
					{/if}
					<h1 class="text-2xl font-bold text-gray-900">{batch.name}</h1>
				</div>
				<p class="text-gray-600">
					Batch imported on {new Date(batch.created_at).toLocaleDateString()}
				</p>
			</div>
			<button
				onclick={exportAccounts}
				class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
			>
				<Download size={18} />
				Export CSV
			</button>
		</div>
	</div>

	<!-- Error Display -->
	{#if data.error}
		<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
			<div class="flex items-center">
				<AlertCircle class="mr-2 h-5 w-5 text-red-600" />
				<p class="text-red-800">{data.error}</p>
			</div>
		</div>
	{/if}

	<!-- Batch Overview -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
		<!-- Total Accounts -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<FileText class="h-8 w-8 text-blue-600" />
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Total Accounts</p>
					<p class="text-2xl font-bold text-gray-900">{batch.total_accounts}</p>
				</div>
			</div>
		</div>

		<!-- Processed Accounts -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<CheckCircle class="h-8 w-8 text-green-600" />
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Processed</p>
					<p class="text-2xl font-bold text-gray-900">{batch.processed_accounts}</p>
				</div>
			</div>
		</div>

		<!-- Available Accounts -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<Users class="h-8 w-8 text-blue-600" />
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Available</p>
					<p class="text-2xl font-bold text-gray-900">
						{accounts.filter((a) => a.status === 'available').length}
					</p>
				</div>
			</div>
		</div>

		<!-- Sold Accounts -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<CheckCircle class="h-8 w-8 text-green-600" />
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Sold</p>
					<p class="text-2xl font-bold text-gray-900">
						{accounts.filter((a) => a.status === 'sold').length}
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Batch Info -->
	<div class="mb-8 rounded-lg border border-gray-200 bg-white p-6">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Batch Information</h2>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<dl class="space-y-3">
					<div>
						<dt class="text-sm font-medium text-gray-500">Status</dt>
						<dd class="text-sm font-medium text-gray-900 {getBatchStatusColor(batch.status)}">
							{batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">Description</dt>
						<dd class="text-sm text-gray-900">{batch.description || 'No description provided'}</dd>
					</div>
					{#if batch.metadata?.filename}
						<div>
							<dt class="text-sm font-medium text-gray-500">Original File</dt>
							<dd class="text-sm text-gray-900">{batch.metadata.filename}</dd>
						</div>
					{/if}
				</dl>
			</div>
			<div>
				<dl class="space-y-3">
					<div>
						<dt class="text-sm font-medium text-gray-500">Upload Date</dt>
						<dd class="text-sm text-gray-900">
							{new Date(batch.created_at).toLocaleString()}
						</dd>
					</div>
					{#if batch.metadata?.file_size}
						<div>
							<dt class="text-sm font-medium text-gray-500">File Size</dt>
							<dd class="text-sm text-gray-900">{formatFileSize(batch.metadata.file_size)}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-sm font-medium text-gray-500">Progress</dt>
						<dd class="text-sm text-gray-900">
							{Math.round((batch.processed_accounts / batch.total_accounts) * 100)}%
						</dd>
					</div>
				</dl>
			</div>
		</div>

		<!-- Progress Bar -->
		{#if batch.total_accounts > 0}
			<div class="mt-6">
				<div class="mb-2 flex justify-between text-sm text-gray-600">
					<span>Processing Progress</span>
					<span>{batch.processed_accounts} / {batch.total_accounts}</span>
				</div>
				<div class="h-3 w-full rounded-full bg-gray-200">
					<div
						class="h-3 rounded-full bg-blue-600 transition-all duration-300"
						style="width: {(batch.processed_accounts / batch.total_accounts) * 100}%"
					></div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Accounts List -->
	<div class="rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 px-6 py-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">
					Accounts ({filteredAccounts().length})
				</h2>
				<div class="flex items-center gap-4">
					<!-- Search -->
					<input
						type="text"
						placeholder="Search accounts..."
						bind:value={searchTerm}
						class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>

					<!-- Status Filter -->
					<select
						bind:value={filterStatus}
						class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
					>
						<option value="all">All Status</option>
						<option value="available">Available</option>
						<option value="reserved">Reserved</option>
						<option value="sold">Sold</option>
						<option value="unavailable">Unavailable</option>
					</select>
				</div>
			</div>
		</div>

		{#if filteredAccounts().length === 0}
			<div class="py-12 text-center">
				<Users class="mx-auto mb-4 h-12 w-12 text-gray-400" />
				<h3 class="mb-2 text-lg font-medium text-gray-900">No accounts found</h3>
				<p class="text-gray-500">Try adjusting your search or filter criteria.</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Account
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Platform
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Followers
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Engagement
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Status
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>
								Price
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each filteredAccounts() as account}
							{@const StatusIcon = getStatusIcon(account.status)}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<StatusIcon
											class="h-4 w-4 {getStatusColor(account.status).split(' ')[0]} mr-3"
										/>
										<div>
											<div class="text-sm font-medium text-gray-900">@{account.username}</div>
											{#if account.display_name}
												<div class="text-sm text-gray-500">{account.display_name}</div>
											{/if}
										</div>
									</div>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{account.platform || 'N/A'}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{formatNumber(account.followers || 0)}
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									{((account.engagement_rate || 0) * 100).toFixed(1)}%
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
											account.status
										)}"
									>
										{account.status.charAt(0).toUpperCase() + account.status.slice(1)}
									</span>
								</td>
								<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
									${(account.price || 0).toFixed(2)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
