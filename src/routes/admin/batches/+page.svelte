<script lang="ts">
	import { goto } from '$app/navigation';

	import { Upload, FileText, AlertCircle, CheckCircle, Clock, X, Eye } from '@lucide/svelte';
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
			const selectedPlatformRecord = platforms.find((p) => p.id === uploadForm.platform_id);
			if (!selectedPlatformRecord) {
				uploadError = 'Please select a valid platform';
				return;
			}

			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('name', uploadForm.name.trim());
			formData.append('description', uploadForm.description.trim());
			formData.append('platform_id', uploadForm.platform_id);
			formData.append('tier_id', uploadForm.tier_id);

			const response = await fetch('/api/batches/import', {
				method: 'POST',
				body: formData
			});
			const result = await response.json();

			if (!response.ok || result.error || !result.data) {
				uploadError =
					(typeof result.error === 'string' && result.error) || 'Failed to import batch';
				return;
			}

			const importedBatch = result.data as BatchMetadata;
			batches = [importedBatch, ...batches];

			// Show success notification
			addToast({
				type: 'success',
				title: 'Batch Upload Successful',
				message: `Successfully uploaded ${importedBatch.total_accounts} accounts to ${importedBatch.name}`,
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
				return '';
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
				<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Batch Management</h1>
				<p class="mt-1 text-sm sm:text-base" style="color: var(--text-muted)">
					Import and manage account batches from CSV files
				</p>
			</div>
			<button
				onclick={openUploadModal}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-3 text-white transition-all hover:scale-95 active:scale-90 sm:w-auto sm:py-2"
				style="background: var(--link);"
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
			<FileText class="mx-auto mb-4 h-12 w-12" style="color: var(--text-dim);" />
			<h3 class="mb-2 text-lg font-medium" style="color: var(--text);">No batches found</h3>
			<p class="mx-auto mb-6 max-w-md" style="color: var(--text-muted);">
				Get started by importing your first batch of accounts.
			</p>
			<button
				onclick={openUploadModal}
				class="inline-flex items-center justify-center rounded-full px-6 py-3 font-medium text-white transition-all active:scale-95"
				style="background: var(--link);"
			>
				<Upload class="mr-2 h-4 w-4" />
				Import Batch
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			{#each batches as batch}
				{@const StatusIcon = getStatusIcon(batch.status)}
				<div
					class="rounded-lg p-6 shadow-sm"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<!-- Batch Header -->
					<div class="mb-4 flex items-start justify-between">
						<div class="flex items-center gap-3">
							<StatusIcon class="h-6 w-6 {getStatusColor(batch.status)}" />
							<div>
								<h3 class="font-semibold" style="color: var(--text);">{batch.name}</h3>
								<p class="text-sm" style="color: var(--text-muted);">
									{new Date(batch.created_at).toLocaleDateString()}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-1">
							<button
								onclick={() => viewBatchDetails(batch)}
								class="group rounded p-1"
								style="color: var(--text-dim);"
								title="View Details"
							>
								<Eye size={16} class="transition-transform group-hover:scale-90" />
							</button>
						</div>
					</div>

					<!-- Batch Description -->
					{#if batch.description}
						<p class="mb-4 text-sm" style="color: var(--text-muted);">{batch.description}</p>
					{/if}

					<!-- Batch Stats -->
					<div class="mb-4 grid grid-cols-2 gap-4 text-sm">
						<div>
							<span style="color: var(--text-muted);">Total Accounts:</span>
							<span class="font-medium" style="color: var(--text);">{batch.total_accounts}</span>
						</div>
						<div>
							<span style="color: var(--text-muted);">Processed:</span>
							<span class="font-medium" style="color: var(--text);">{batch.processed_accounts}</span
							>
						</div>
						<div>
							<span style="color: var(--text-muted);">Status:</span>
							<span class="font-medium {getStatusColor(batch.status)}">
								{batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
							</span>
						</div>
						{#if batch.metadata?.file_size}
							<div>
								<span style="color: var(--text-muted);">File Size:</span>
								<span class="font-medium" style="color: var(--text);">
									{formatFileSize(batch.metadata.file_size)}
								</span>
							</div>
						{/if}
					</div>

					<!-- Status Display -->
					<div class="mb-4">
						<div class="flex items-center justify-between text-sm">
							<span style="color: var(--text-muted);">Status:</span>
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
							<div class="mt-2 text-sm" style="color: var(--text-muted);">
								{batch.processed_accounts} / {batch.total_accounts} accounts processed
							</div>
						{/if}
					</div>

					<!-- Actions -->
					<div class="pt-4" style="border-top: 1px solid var(--border);">
						<button
							onclick={() => viewBatchDetails(batch)}
							class="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all hover:scale-95"
							style="background: var(--bg-elev-2); color: var(--text);"
						>
							<Eye size={16} class="transition-transform group-hover:scale-90" />
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
				class="fixed inset-0 bg-black/50 transition-opacity"
				onclick={() => !isUploading && (showUploadModal = false)}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
				style="background: var(--bg-elev-1);"
				in:fly={{ y: 200, duration: 500 }}
				out:fade={{ duration: 500 }}
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleUpload();
					}}
				>
					<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
							<div class="mb-4">
								<h3 class="text-lg font-semibold" style="color: var(--text);">
									Import Account Batch
								</h3>
								<p class="mt-1 text-sm" style="color: var(--text-muted);">
									Upload a CSV file with any credential/log schema. Columns are auto-detected.
								</p>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									Known fields (mapped automatically when present): profile link, username, password,
									email, email password, 2FA link, followers, engagement rate, niche, quality score.
								</p>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									Example: <code class="rounded px-1" style="background: var(--surface);">
										Profile Link,Username,Password,Email,Email Password,2FA Link,Backup Email</code
									>
								</p>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									Hard-fail mode: if any row is invalid, nothing is imported.
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
								<label class="mb-2 block text-sm font-medium" style="color: var(--text);"
									>CSV File *</label
								>
								<div
									class="rounded-lg border-2 border-dashed p-6 text-center transition-colors"
									style={dragActive
										? 'border-color: var(--primary); background: var(--surface);'
										: 'border-color: var(--border);'}
									ondragover={handleDragOver}
									ondragleave={handleDragLeave}
									ondrop={handleDrop}
								>
									{#if selectedFile}
										<div class="flex items-center justify-center gap-2 text-green-600">
											<FileText size={20} />
											<span class="font-medium">{selectedFile.name}</span>
											<span class="text-sm" style="color: var(--text-muted);">
												({formatFileSize(selectedFile.size)})
											</span>
										</div>
									{:else}
										<div class="space-y-2">
											<Upload class="mx-auto h-8 w-8" style="color: var(--text-dim);" />
											<div>
												<p class="text-sm" style="color: var(--text-muted);">
													Drop your CSV file here, or
												</p>
												<label class="cursor-pointer" style="color: var(--primary);">
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
								<label
									for="tier-select"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Tier *
								</label>
								<select
									id="tier-select"
									required
									bind:value={uploadForm.tier_id}
									disabled={!uploadForm.platform_id}
									class="mt-1 block w-full rounded-md py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
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
								<label
									for="batch-description"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Description
								</label>
								<textarea
									id="batch-description"
									rows="3"
									bind:value={uploadForm.description}
									class="mt-1 block w-full rounded-md"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									placeholder="Optional description for this batch..."
								></textarea>
							</div>
						</div>
					</div>

					<div
						class="px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6"
						style="background: var(--surface);"
					>
						<button
							type="submit"
							disabled={isUploading || !selectedFile}
							class="inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:ml-3 sm:w-auto"
							style="background: var(--primary); color: #000;"
						>
							{#if isUploading}
								<div class="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-black"></div>
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
							class="mt-3 inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-50 sm:mt-0 sm:w-auto"
							style="border: 1px solid var(--border); color: var(--text); background: transparent;"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
