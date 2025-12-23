<script lang="ts">
	import { goto } from '$app/navigation';

	import { Upload, FileText, AlertCircle, CheckCircle, Clock, X, Eye } from '@lucide/svelte';
	import { createBatch, updateBatchStatus } from '$lib/services/batches';
	import { uploadAccountsBatch } from '$lib/services/accounts';
	import type { BatchMetadata } from '$lib/services/batches';
	import { addToast } from '$lib/stores/toasts';
	import { fade, fly } from 'svelte/transition';

	// Props from load function
	interface Props {
		data: {
			batches: BatchMetadata[];
			platforms: any[];
			tiers: any[];
			error: string | null;
		};
	}

	let { data }: Props = $props();

	let batches = $state(data.batches);
	let platforms = $state(data.platforms);
	let allTiers = $state(data.tiers);
	let showUploadModal = $state(false);
	let isUploading = $state(false);
	let uploadError = $state('');
	let selectedFile: File | null = $state(null);
	let selectedPlatform = $state('');
	let dragActive = $state(false);

	// Upload form data
	let uploadForm = $state({
		name: '',
		description: '',
		platform_id: '',
		tier_id: '',
		expected_count: 0
	});

	// Get tiers for selected platform
	const availableTiers = $derived(() => {
		if (!uploadForm.platform_id) return [];
		return allTiers.filter((tier) => tier.parentId === uploadForm.platform_id);
	});

	// Reset tier when platform changes
	$effect(() => {
		if (uploadForm.platform_id) {
			uploadForm.tier_id = ''; // Reset tier when platform changes
		}
	});

	// File drop handlers
	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		dragActive = true;
	};

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault();
		dragActive = false;
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		dragActive = false;

		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
				selectedFile = file;
				uploadForm.name = file.name.replace('.csv', '');
			} else {
				uploadError = 'Please select a CSV file';
			}
		}
	};

	const handleFileSelect = (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
				selectedFile = file;
				uploadForm.name = file.name.replace('.csv', '');
				uploadError = '';
			} else {
				uploadError = 'Please select a CSV file';
			}
		}
	};

	// Process CSV file and create batch
	const handleUpload = async () => {
		if (!selectedFile) {
			uploadError = 'Please select a file';
			return;
		}

		if (!uploadForm.platform_id) {
			uploadError = 'Please select a platform';
			return;
		}

		if (!uploadForm.tier_id) {
			uploadError = 'Please select a tier';
			return;
		}

		isUploading = true;
		uploadError = '';

		try {
			// Read and parse CSV file
			const csvText = await selectedFile.text();
			const lines = csvText.split('\n').filter((line) => line.trim());

			if (lines.length === 0) {
				uploadError = 'CSV file is empty';
				return;
			}

			// Validate CSV format (should have headers: username at minimum)
			const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
			const requiredHeaders = ['username'];
			const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

			if (missingHeaders.length > 0) {
				uploadError = `Missing required columns: ${missingHeaders.join(', ')}`;
				return;
			}

			// Parse accounts data
			const accounts = [];

			// Column mapping - maps CSV headers to our Prisma field names
			const columnMap: Record<string, string> = {
				profile_link: 'linkUrl',
				username: 'username',
				password: 'password',
				email: 'email',
				email_password: 'emailPassword',
				'2fa_link': 'twoFa',
				followers: 'followers',
				engagement_rate: 'engagementRate',
				niche: 'niche',
				quality_score: 'qualityScore',
				two_factor_enabled: 'twoFactorEnabled',
				easy_login_enabled: 'easyLoginEnabled',
				age_months: 'ageMonths'
			};

			for (let i = 1; i < lines.length; i++) {
				const values = lines[i].split(',').map((v) => v.trim());
				if (values.length >= headers.length) {
					const account: any = {};
					headers.forEach((csvHeader, index) => {
						// Map CSV header to database field name
						const dbField = columnMap[csvHeader] || csvHeader;
						const value = values[index];

						if (value) {
							if (dbField === 'followers' || dbField === 'ageMonths') {
								account[dbField] = parseInt(value) || null;
							} else if (dbField === 'engagementRate') {
								account[dbField] = parseFloat(value) || null;
							} else if (dbField === 'qualityScore') {
								const score = parseInt(value);
								account[dbField] = score >= 1 && score <= 10 ? score : null;
							} else if (dbField === 'twoFactorEnabled' || dbField === 'easyLoginEnabled') {
								const val = value.toLowerCase();
								account[dbField] =
									val === 'true' || val === '1' || val === 'yes'
										? true
										: val === 'false' || val === '0' || val === 'no'
											? false
											: null;
							} else {
								account[dbField] = value;
							}
						} else {
							account[dbField] = null;
						}
					});

					// Add required fields
					const selectedPlatform = platforms.find((p) => p.id === uploadForm.platform_id);
					account.categoryId = uploadForm.tier_id;
					account.platform = selectedPlatform?.name || 'Unknown';
					account.status = 'available';

					accounts.push(account);
				}
			}

			if (accounts.length === 0) {
				uploadError = 'No valid accounts found in CSV';
				return;
			}

			// Create batch record
			const batchResult = await createBatch(
				{
					name: uploadForm.name,
					description: uploadForm.description || null,
					tier_id: uploadForm.tier_id,
					total_accounts: accounts.length,
					processed_accounts: 0,
					status: 'processing',
					metadata: {
						filename: selectedFile.name,
						upload_date: new Date().toISOString(),
						file_size: selectedFile.size,
						headers: headers
					}
				},
				fetch
			);

			if (batchResult.error) {
				const error = batchResult.error;
				uploadError =
					typeof error === 'string' ? error : (error as any)?.message || 'Failed to create batch';
				return;
			}

			const batch = batchResult.data!;

			// Add the new batch to the list immediately (with processing status)
			batches = [batch, ...batches];

			// Upload accounts in batch
			console.log('Uploading accounts:', accounts.length, 'accounts to batch:', batch.id);
			const uploadResult = await uploadAccountsBatch(batch.id, accounts);

			if (uploadResult.error) {
				console.error('Account upload failed:', uploadResult.error);
				// Update batch status to failed
				await updateBatchStatus(batch.id, 'failed', fetch);

				// Update the batch in the local array
				const batchIndex = batches.findIndex((b) => b.id === batch.id);
				if (batchIndex !== -1) {
					batches[batchIndex] = {
						...batches[batchIndex],
						status: 'failed'
					};
				}

				uploadError = uploadResult.error;
				return;
			}

			console.log('Accounts uploaded successfully');

			// Update batch as completed
			await updateBatchStatus(batch.id, 'completed', fetch);

			// Update the batch status in the local array
			const batchIndex = batches.findIndex((b) => b.id === batch.id);
			if (batchIndex !== -1) {
				batches[batchIndex] = {
					...batches[batchIndex],
					status: 'completed',
					processed_accounts: accounts.length // Use the actual number of accounts processed
				};
			}

			// Show success notification
			addToast({
				type: 'success',
				title: 'Batch Upload Successful',
				message: `Successfully uploaded ${accounts.length} accounts to ${batch.name}`,
				duration: 5000
			});

			// Close modal and reset form
			showUploadModal = false;
			resetUploadForm();
		} catch (error) {
			console.error('Upload failed:', error);
			uploadError = 'Upload failed. Please try again.';

			// Show error notification
			addToast({
				type: 'error',
				title: 'Upload Failed',
				message: error instanceof Error ? error.message : 'Upload failed. Please try again.',
				duration: 7000
			});
		} finally {
			isUploading = false;
		}
	};

	const resetUploadForm = () => {
		selectedFile = null;
		uploadForm = {
			name: '',
			description: '',
			platform_id: '',
			tier_id: '',
			expected_count: 0
		};
		uploadError = '';
	};

	const openUploadModal = () => {
		resetUploadForm();
		showUploadModal = true;
	};

	const getStatusIcon = (status: string) => {
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

	const getStatusColor = (status: string) => {
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

	const viewBatchDetails = (batch: BatchMetadata) => {
		goto(`/admin/batches/${batch.id}`);
	};
</script>

<svelte:head>
	<title>Batch Import - Admin Panel</title>
</svelte:head>

<div class="p-4 sm:p-6">
	<!-- Header -->
	<div class="mb-6">
		<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0 flex-1">
				<h1 class="text-xl font-bold text-gray-900 sm:text-2xl">Batch Import</h1>
				<p class="mt-1 text-sm text-gray-600 sm:text-base">
					Import and manage account batches from CSV files
				</p>
			</div>
			<button
				onclick={openUploadModal}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-white cursor-pointer transition-all hover:scale-95 hover:bg-blue-700 sm:w-auto sm:py-2"
			>
				<Upload size={18} />
				Import Batch
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

	<!-- Batches List -->
	{#if batches.length === 0}
		<div class="px-4 py-12 text-center">
			<FileText class="mx-auto mb-4 h-12 w-12 text-gray-400" />
			<h3 class="mb-2 text-lg font-medium text-gray-900">No batches found</h3>
			<p class="mx-auto mb-6 max-w-md text-gray-500">
				Get started by importing your first batch of accounts.
			</p>
			<button
				onclick={openUploadModal}
				class="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
			>
				<Upload class="mr-2 h-4 w-4" />
				Import Batch
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			{#each batches as batch}
				{@const StatusIcon = getStatusIcon(batch.status)}
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<!-- Batch Header -->
					<div class="mb-4 flex items-start justify-between">
						<div class="flex items-center gap-3">
							<StatusIcon class="h-6 w-6 {getStatusColor(batch.status)}" />
							<div>
								<h3 class="font-semibold text-gray-900">{batch.name}</h3>
								<p class="text-sm text-gray-500">
									{new Date(batch.created_at).toLocaleDateString()}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-1">
							<button
								onclick={() => viewBatchDetails(batch)}
								class="group rounded p-1 text-gray-400 hover:text-blue-600"
								title="View Details"
							>
								<Eye size={16} class='group-hover:scale-90 transition-transform' />
							</button>
						</div>
					</div>

					<!-- Batch Description -->
					{#if batch.description}
						<p class="mb-4 text-sm text-gray-600">{batch.description}</p>
					{/if}

					<!-- Batch Stats -->
					<div class="mb-4 grid grid-cols-2 gap-4 text-sm">
						<div>
							<span class="text-gray-500">Total Accounts:</span>
							<span class="font-medium text-gray-900">{batch.total_accounts}</span>
						</div>
						<div>
							<span class="text-gray-500">Processed:</span>
							<span class="font-medium text-gray-900">{batch.processed_accounts}</span>
						</div>
						<div>
							<span class="text-gray-500">Status:</span>
							<span class="font-medium {getStatusColor(batch.status)}">
								{batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
							</span>
						</div>
						{#if batch.metadata?.file_size}
							<div>
								<span class="text-gray-500">File Size:</span>
								<span class="font-medium text-gray-900">
									{formatFileSize(batch.metadata.file_size)}
								</span>
							</div>
						{/if}
					</div>

					<!-- Status Display -->
					<div class="mb-4">
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-600">Status:</span>
							<div class="flex items-center gap-2">
								<svelte:component
									this={getStatusIcon(batch.status)}
									class="h-4 w-4 {getStatusColor(batch.status)}"
								/>
								<span class="font-medium {getStatusColor(batch.status)} capitalize">
									{batch.status === 'completed'
										? 'Successful'
										: batch.status === 'failed'
											? 'Failed'
											: batch.status}
								</span>
							</div>
						</div>
						{#if batch.total_accounts > 0}
							<div class="mt-2 text-sm text-gray-600">
								{batch.processed_accounts} / {batch.total_accounts} accounts processed
							</div>
						{/if}
					</div>

					<!-- Actions -->
					<div class="border-t border-gray-200 pt-4">
						<button
							onclick={() => viewBatchDetails(batch)}
							class="group flex w-full items-center justify-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:scale-95 cursor-pointer hover:bg-gray-100"
						>
							<Eye size={16} class='group-hover:scale-90 transition-transform' />
							View Details
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Upload Modal -->
{#if showUploadModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="fixed inset-0 bg-black/20 transition-opacity"
				onclick={() => !isUploading && (showUploadModal = false)}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
				in:fly={{ y: 200, duration: 500 }}
				out:fade={{ duration: 500}}
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleUpload();
					}}
				>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Import Account Batch</h3>
							<p class="mt-1 text-sm text-gray-600">
								Upload a CSV file with account data. Required column: <strong>username</strong>.
							</p>
							<p class="mt-1 text-xs text-gray-500">
								Supported columns: profile_link, username, password, email, email_password,
								2fa_link, followers, engagement_rate, niche, quality_score
							</p>
							<p class="mt-1 text-xs text-gray-500">
								Example: <code class="rounded bg-gray-100 px-1"
									>profile_link,username,password,email,email_password,2fa_link</code
								>
							</p>
						</div>

						{#if uploadError}
							<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
								<div class="flex items-center">
									<AlertCircle class="mr-2 h-4 w-4 text-red-600" />
									<p class="text-sm text-red-800">{uploadError}</p>
								</div>
							</div>
						{/if}

						<div class="space-y-4">
							<!-- File Upload -->
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-700">CSV File *</label>
								<div
									class="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors {dragActive
										? 'border-blue-400 bg-blue-50'
										: ''}"
									ondragover={handleDragOver}
									ondragleave={handleDragLeave}
									ondrop={handleDrop}
								>
									{#if selectedFile}
										<div class="flex items-center justify-center gap-2 text-green-600">
											<FileText size={20} />
											<span class="font-medium">{selectedFile.name}</span>
											<span class="text-sm text-gray-500">
												({formatFileSize(selectedFile.size)})
											</span>
										</div>
									{:else}
										<div class="space-y-2">
											<Upload class="mx-auto h-8 w-8 text-gray-400" />
											<div>
												<p class="text-sm text-gray-600">Drop your CSV file here, or</p>
												<label class="cursor-pointer text-blue-600 hover:text-blue-500">
													<span class="font-medium">browse to upload</span>
													<input
														type="file"
														accept=".csv"
														class="hidden"
														onchange={handleFileSelect}
													/>
												</label>
											</div>
										</div>
									{/if}
								</div>
							</div>

							<!-- Batch Name -->
							<div>
								<label for="batch-name" class="block text-sm font-medium text-gray-700">
									Batch Name *
								</label>
								<input
									id="batch-name"
									type="text"
									required
									bind:value={uploadForm.name}
									class="mt-1 block w-full rounded-md border border-gray-300 px-2 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="e.g., Instagram Influencers Q4 2024"
								/>
							</div>

							<!-- Platform Selection -->
							<div>
								<label for="platform-select" class="block text-sm font-medium text-gray-700">
									Platform *
								</label>
								<select
									id="platform-select"
									required
									bind:value={uploadForm.platform_id}
									class="mt-1 block w-full rounded-md border border-gray-300 py-2 focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="">Select a platform...</option>
									{#each platforms as platform}
										<option value={platform.id}>{platform.name}</option>
									{/each}
								</select>
							</div>

							<!-- Tier Selection -->
							<div>
								<label for="tier-select" class="block text-sm font-medium text-gray-700">
									Tier *
								</label>
								<select
									id="tier-select"
									required
									bind:value={uploadForm.tier_id}
									disabled={!uploadForm.platform_id}
									class="mt-1 block w-full rounded-md border border-gray-300 py-2 focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
								>
									<option value="">
										{uploadForm.platform_id ? 'Select a tier...' : 'Select platform first'}
									</option>
									{#each availableTiers() as tier}
										<option value={tier.id}>{tier.name}</option>
									{/each}
								</select>
							</div>

							<!-- Description -->
							<div>
								<label for="batch-description" class="block text-sm font-medium text-gray-700">
									Description
								</label>
								<textarea
									id="batch-description"
									rows="3"
									bind:value={uploadForm.description}
									class="mt-1 block w-full rounded-md border border-gray-300 focus:border-blue-500 focus:ring-blue-500"
									placeholder="Optional description for this batch..."
								></textarea>
							</div>
						</div>
					</div>

					<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
						<button
							type="submit"
							disabled={isUploading || !selectedFile}
							class="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-3 sm:w-auto"
						>
							{#if isUploading}
								<div class="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
								Processing...
							{:else}
								<Upload class="mr-2 h-4 w-4" />
								Import Batch
							{/if}
						</button>
						<button
							type="button"
							disabled={isUploading}
							onclick={() => (showUploadModal = false)}
							class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50 sm:mt-0 sm:w-auto"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
