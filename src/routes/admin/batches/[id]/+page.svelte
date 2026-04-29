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
		X,
		Copy,
		ExternalLink
	} from '@lucide/svelte';
	import type { BatchMetadata } from '$lib/services/batches';
	import { resolveCredentialField } from '$lib/helpers/credential-links';
	import { getCredentialExtraEntries } from '$lib/helpers/account-credentials';
	import { addToast } from '$lib/stores/toasts';

	interface BatchAccountLog {
		id: string;
		username: string | null;
		password: string | null;
		email: string | null;
		emailPassword: string | null;
		twoFa: string | null;
		linkUrl: string | null;
		platform: string | null;
		status: string;
		createdAt: string | null;
		updatedAt: string | null;
		deliveredAt: string | null;
		deliveryNotes: string | null;
		followers: number | null;
		engagementRate: number | null;
		qualityScore: number | null;
		niche: string | null;
		orderItemId: string | null;
		credentialExtras: Record<string, string>;
	}

	// Props from load function
	interface Props {
		data: {
			batch: BatchMetadata;
			accounts: BatchAccountLog[];
			error: string | null;
		};
	}

	let { data }: Props = $props();

	let batch = $state(data.batch);
	let accounts = $state(data.accounts);
	let filterStatus = $state('all');
	let searchTerm = $state('');

	// Calculate processed accounts (total accounts that exist)
	const processedCount = $derived(accounts.length);
	const availableCount = $derived(accounts.filter((a) => a.status === 'available').length);
	const deliveredCount = $derived(accounts.filter((a) => a.status === 'delivered').length);
	const totalUnits = $derived(batch.total_accounts || (batch as any).totalUnits || accounts.length || 0);

	function formatDateShort(value: string | null | undefined): string {
		if (!value) return 'N/A';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'N/A';
		return date.toLocaleDateString();
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return 'N/A';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'N/A';
		return date.toLocaleString();
	}

	function toSearchableText(value: unknown): string {
		return typeof value === 'string' ? value.toLowerCase() : '';
	}

	function escapeCsv(value: unknown): string {
		const text = typeof value === 'string' ? value : value == null ? '' : String(value);
		if (/[",\n\r]/.test(text)) {
			return `"${text.replace(/"/g, '""')}"`;
		}
		return text;
	}

	function buildCredentialText(account: BatchAccountLog): string {
		const lines = [
			`Username: ${account.username || ''}`,
			`Password: ${account.password || ''}`,
			`Email: ${account.email || ''}`,
			`Email Password: ${account.emailPassword || ''}`,
			`2FA: ${account.twoFa || ''}`,
			`Link: ${account.linkUrl || ''}`,
			`Status: ${account.status || ''}`
		];
		for (const entry of getCredentialExtraEntries(account.credentialExtras)) {
			lines.push(`${entry.label}: ${entry.value}`);
		}
		return lines.join('\n').trim();
	}

	async function copyAccountDetails(account: BatchAccountLog): Promise<void> {
		try {
			await navigator.clipboard.writeText(buildCredentialText(account));
			addToast({ type: 'success', title: 'Copied account log' });
		} catch {
			addToast({ type: 'error', title: 'Failed to copy account log' });
		}
	}

	// Filter accounts based on status and search
	const filteredAccounts = $derived(() => {
		let filtered = accounts;

		if (filterStatus !== 'all') {
			filtered = filtered.filter((account) => account.status === filterStatus);
		}

		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
				filtered = filtered.filter((account) => {
					const fields = [
						account.username,
						account.email,
						account.emailPassword,
						account.twoFa,
						account.linkUrl,
						account.platform,
						account.status,
						...Object.values(account.credentialExtras || {})
					];
					return fields.some((value) => toSearchableText(value).includes(term));
				});
			}

		return filtered;
	});

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'delivered':
			case 'sold':
				return CheckCircle;
			case 'reserved':
			case 'processing':
				return Clock;
			case 'available':
				return Users;
			case 'failed':
			case 'retired':
			case 'unavailable':
				return X;
			default:
				return FileText;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'delivered':
			case 'sold':
				return 'text-green-600 bg-green-100';
			case 'reserved':
			case 'processing':
				return 'text-yellow-700 bg-yellow-100';
			case 'available':
				return 'text-blue-600 bg-blue-100';
			case 'failed':
			case 'retired':
			case 'unavailable':
				return 'text-red-600 bg-red-100';
			default:
				return 'text-gray-600 bg-gray-100';
		}
	};

	const formatStatusLabel = (status: string) =>
		String(status || '')
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown';

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
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	const exportAccounts = () => {
		const baseHeaders = [
			'Username',
			'Password',
			'Email',
			'Email Password',
			'2FA',
			'Link',
			'Platform',
			'Status',
			'Created At',
			'Delivered At',
			'Notes'
		];
		const extraHeaders: string[] = [];
		for (const account of filteredAccounts()) {
			for (const entry of getCredentialExtraEntries(account.credentialExtras)) {
				if (!extraHeaders.includes(entry.label)) {
					extraHeaders.push(entry.label);
				}
			}
		}
		const headers = [...baseHeaders, ...extraHeaders];

		const rows = filteredAccounts().map((account) => {
			const extrasByLabel = Object.fromEntries(
				getCredentialExtraEntries(account.credentialExtras).map((entry) => [entry.label, entry.value])
			);
			return [
				account.username || '',
				account.password || '',
				account.email || '',
				account.emailPassword || '',
				account.twoFa || '',
				account.linkUrl || '',
				account.platform || '',
				account.status || '',
				account.createdAt || '',
				account.deliveredAt || '',
				account.deliveryNotes || '',
				...extraHeaders.map((header) => extrasByLabel[header] || '')
			]
				.map((value) => escapeCsv(value))
				.join(',');
		});

		const csvContent = [headers.join(','), ...rows].join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${batch.name || 'batch'}_credential_logs.csv`;
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

<div class="admin-batch-detail-page min-h-screen p-3 sm:p-6">
	<div class="mx-auto max-w-7xl">
		<!-- Header -->
		<div class="mb-6">
			<div class="mb-4 flex items-center gap-4">
				<button
					onclick={goBack}
					class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-gray-300 transition-all hover:scale-95 hover:bg-gray-50"
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
					<p class="text-gray-600">Batch imported on {formatDateShort(batch.created_at)}</p>
				</div>
				<button
					onclick={exportAccounts}
					class="flex cursor-pointer items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-all hover:scale-95 hover:bg-green-700"
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
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<FileText class="h-8 w-8 text-blue-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Total Accounts</p>
						<p class="text-2xl font-bold text-gray-900">{totalUnits}</p>
					</div>
				</div>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<CheckCircle class="h-8 w-8 text-green-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Processed</p>
						<p class="text-2xl font-bold text-gray-900">{processedCount}</p>
					</div>
				</div>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<Users class="h-8 w-8 text-blue-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Available</p>
						<p class="text-2xl font-bold text-gray-900">{availableCount}</p>
					</div>
				</div>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<CheckCircle class="h-8 w-8 text-green-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Delivered</p>
						<p class="text-2xl font-bold text-gray-900">{deliveredCount}</p>
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
								{formatStatusLabel(batch.status)}
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
							<dd class="text-sm text-gray-900">{formatDateTime(batch.created_at)}</dd>
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
								{totalUnits > 0 ? Math.round((processedCount / totalUnits) * 100) : 0}%
							</dd>
						</div>
					</dl>
				</div>
			</div>

			{#if totalUnits > 0}
				<div class="mt-6">
					<div class="mb-2 flex justify-between text-sm text-gray-600">
						<span>Processing Progress</span>
						<span>{processedCount} / {totalUnits}</span>
					</div>
					<div class="h-3 w-full rounded-full bg-gray-200">
						<div
							class="h-3 rounded-full bg-blue-600 transition-all duration-300"
							style="width: {(processedCount / totalUnits) * 100}%"
						></div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Accounts List -->
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 px-6 py-4">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<h2 class="text-lg font-semibold text-gray-900">Accounts ({filteredAccounts().length})</h2>
					<div class="flex flex-wrap items-center gap-3">
						<input
							type="text"
							placeholder="Search username, email, 2FA, link..."
							bind:value={searchTerm}
							class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none sm:w-72"
						/>
						<select
							bind:value={filterStatus}
							class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
						>
							<option value="all">All Status</option>
							<option value="available">Available</option>
							<option value="reserved">Reserved</option>
							<option value="assigned">Assigned</option>
							<option value="delivered">Delivered</option>
							<option value="failed">Failed</option>
							<option value="retired">Retired</option>
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
				<!-- Mobile cards -->
					<div class="space-y-3 p-3 lg:hidden">
						{#each filteredAccounts() as account}
							{@const twoFaField = resolveCredentialField(account.twoFa)}
							{@const linkField = resolveCredentialField(account.linkUrl)}
							{@const extraFields = getCredentialExtraEntries(account.credentialExtras)}
							<div class="rounded-lg border border-gray-200 p-3">
							<div class="mb-3 flex items-start justify-between gap-3">
								<div>
									<div class="text-sm font-semibold text-gray-900">@{account.username || 'N/A'}</div>
									{#if account.email}
										<div class="text-xs text-gray-500">{account.email}</div>
									{/if}
								</div>
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium {getStatusColor(
										account.status
									)}"
								>
									{formatStatusLabel(account.status)}
								</span>
							</div>

							<div class="space-y-1 rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
								<div><span class="font-semibold">Password:</span> {account.password || 'N/A'}</div>
								<div><span class="font-semibold">Email Pass:</span> {account.emailPassword || 'N/A'}</div>
								<div>
									<span class="font-semibold">2FA:</span>
									{#if twoFaField.display}
										{#if twoFaField.isUrl && twoFaField.href}
											<a
												href={twoFaField.href}
												target="_blank"
												rel="noopener noreferrer"
												class="ml-1 underline"
												style="color: var(--link);"
											>
												{twoFaField.display}
											</a>
										{:else}
											<span class="ml-1">{twoFaField.display}</span>
										{/if}
									{:else}
										N/A
									{/if}
								</div>
									<div>
										<span class="font-semibold">Link:</span>
									{#if linkField.display}
										{#if linkField.isUrl && linkField.href}
											<a
												href={linkField.href}
												target="_blank"
												rel="noopener noreferrer"
												class="ml-1 underline"
												style="color: var(--link);"
											>
												{linkField.display}
											</a>
										{:else}
											<span class="ml-1">{linkField.display}</span>
										{/if}
									{:else}
										N/A
										{/if}
									</div>
									{#if extraFields.length > 0}
										{#each extraFields as field}
											<div>
												<span class="font-semibold">{field.label}:</span>
												<span class="ml-1">{field.value}</span>
											</div>
										{/each}
									{/if}
								</div>

							<div class="mt-3 flex items-center justify-between text-xs text-gray-500">
								<span>Added: {formatDateTime(account.createdAt)}</span>
								<button
									onclick={() => copyAccountDetails(account)}
									class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700"
								>
									<Copy class="h-3.5 w-3.5" />
									Copy
								</button>
							</div>
						</div>
					{/each}
				</div>

				<!-- Desktop table -->
				<div class="hidden overflow-x-auto lg:block">
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
									Credentials Log
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Status
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Timeline
								</th>
								<th
									class="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Action
								</th>
							</tr>
						</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each filteredAccounts() as account}
									{@const StatusIcon = getStatusIcon(account.status)}
									{@const twoFaField = resolveCredentialField(account.twoFa)}
									{@const linkField = resolveCredentialField(account.linkUrl)}
									{@const extraFields = getCredentialExtraEntries(account.credentialExtras)}
									<tr class="hover:bg-gray-50">
									<td class="px-6 py-4 align-top">
										<div class="flex items-start gap-3">
											<StatusIcon
												class="mt-0.5 h-4 w-4 {getStatusColor(account.status).split(' ')[0]}"
											/>
											<div class="min-w-0">
												<div class="font-medium text-gray-900">@{account.username || 'N/A'}</div>
												<div class="text-sm text-gray-500">{account.email || 'No email'}</div>
												{#if account.platform}
													<div class="mt-1 text-xs text-gray-500">{account.platform}</div>
												{/if}
											</div>
										</div>
									</td>
									<td class="px-6 py-4 align-top">
										<div class="space-y-1 rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
											<div><span class="font-semibold">Password:</span> {account.password || 'N/A'}</div>
											<div>
												<span class="font-semibold">Email Pass:</span> {account.emailPassword || 'N/A'}
											</div>
											<div>
												<span class="font-semibold">2FA:</span>
												{#if twoFaField.display}
													{#if twoFaField.isUrl && twoFaField.href}
														<a
															href={twoFaField.href}
															target="_blank"
															rel="noopener noreferrer"
															class="inline-flex items-center gap-1 underline"
															style="color: var(--link);"
														>
															{twoFaField.display}
															<ExternalLink class="h-3 w-3" />
														</a>
													{:else}
														<span>{twoFaField.display}</span>
													{/if}
												{:else}
													N/A
												{/if}
											</div>
												<div>
													<span class="font-semibold">Link:</span>
												{#if linkField.display}
													{#if linkField.isUrl && linkField.href}
														<a
															href={linkField.href}
															target="_blank"
															rel="noopener noreferrer"
															class="inline-flex items-center gap-1 underline"
															style="color: var(--link);"
														>
															{linkField.display}
															<ExternalLink class="h-3 w-3" />
														</a>
													{:else}
														<span>{linkField.display}</span>
													{/if}
												{:else}
													N/A
													{/if}
												</div>
												{#if extraFields.length > 0}
													{#each extraFields as field}
														<div>
															<span class="font-semibold">{field.label}:</span>
															<span>{field.value}</span>
														</div>
													{/each}
												{/if}
											</div>
										</td>
									<td class="px-6 py-4 align-top">
										<span
											class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
												account.status
											)}"
										>
											{formatStatusLabel(account.status)}
										</span>
									</td>
									<td class="px-6 py-4 align-top text-xs text-gray-500">
										<div>Created: {formatDateTime(account.createdAt)}</div>
										{#if account.deliveredAt}
											<div class="mt-1">Delivered: {formatDateTime(account.deliveredAt)}</div>
										{/if}
										{#if account.deliveryNotes}
											<div class="mt-1">Note: {account.deliveryNotes}</div>
										{/if}
									</td>
									<td class="px-6 py-4 text-right align-top">
										<button
											onclick={() => copyAccountDetails(account)}
											class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
										>
											<Copy class="h-3.5 w-3.5" />
											Copy
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.admin-batch-detail-page) {
		background: var(--bg);
	}

	:global(.admin-batch-detail-page .bg-gray-50) {
		background: var(--bg-elev-1) !important;
	}

	:global(.admin-batch-detail-page .bg-white) {
		background: var(--surface) !important;
	}

	:global(.admin-batch-detail-page .border-gray-200),
	:global(.admin-batch-detail-page .border-gray-300) {
		border-color: var(--border) !important;
	}

	:global(.admin-batch-detail-page .text-gray-900) {
		color: var(--text) !important;
	}

	:global(.admin-batch-detail-page .text-gray-800),
	:global(.admin-batch-detail-page .text-gray-700),
	:global(.admin-batch-detail-page .text-gray-600) {
		color: var(--text-muted) !important;
	}

	:global(.admin-batch-detail-page .text-gray-500),
	:global(.admin-batch-detail-page .text-gray-400) {
		color: var(--text-dim) !important;
	}

	@media (max-width: 767px) {
		:global(.admin-batch-detail-page .p-12) {
			padding: 1rem !important;
		}
	}
</style>
