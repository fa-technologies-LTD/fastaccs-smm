<script lang="ts">
	import { ImagePlus, Trash2, Upload } from '@lucide/svelte';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import { MAX_TIER_SAMPLE_SCREENSHOTS } from '$lib/helpers/tierSampleScreenshots';

	interface Props {
		urls: string[];
		disabled?: boolean;
	}

	interface UploadOptions {
		showSuccessToast?: boolean;
	}

	const slotIndexes = Array.from({ length: MAX_TIER_SAMPLE_SCREENSHOTS }, (_, index) => index);
	const inputIdPrefix = 'tier-sample-upload';
	const MAX_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024;
	const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

	let { urls = $bindable([]), disabled = false }: Props = $props();
	let uploadLoadingBySlot = $state<Record<number, boolean>>({});
	let isDraggingFiles = $state(false);

	function getSlotValue(index: number): string {
		const value = urls[index];
		return typeof value === 'string' ? value : '';
	}

	function setSlotValue(index: number, value: string): void {
		const next = [...urls];
		next[index] = value;
		urls = next.slice(0, MAX_TIER_SAMPLE_SCREENSHOTS);
	}

	function clearSlot(index: number): void {
		setSlotValue(index, '');
	}

	function isUploading(index: number): boolean {
		return Boolean(uploadLoadingBySlot[index]);
	}

	function setUploading(index: number, value: boolean): void {
		uploadLoadingBySlot = {
			...uploadLoadingBySlot,
			[index]: value
		};
	}

	function getFileInputId(index: number): string {
		return `${inputIdPrefix}-${index}`;
	}

	function openFilePicker(index: number): void {
		if (disabled || isUploading(index)) return;
		const input = document.getElementById(getFileInputId(index)) as HTMLInputElement | null;
		input?.click();
	}

	async function uploadFileToSlot(
		index: number,
		file: File,
		options: UploadOptions = {}
	): Promise<boolean> {
		if (disabled || isUploading(index)) {
			return false;
		}

		if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
			showError('Unsupported file type', 'Use JPG, PNG, or WEBP for sample screenshots.');
			return false;
		}

		if (file.size > MAX_UPLOAD_SIZE_BYTES) {
			showError('File too large', 'Sample screenshots must be 3MB or smaller.');
			return false;
		}

		setUploading(index, true);
		try {
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetch('/api/admin/uploads/tier-sample-screenshot', {
				method: 'POST',
				body: formData
			});
			const result = await response.json().catch(() => null);

			if (!response.ok || !result?.success || !result?.data?.url) {
				const message = result?.error || 'Unable to upload screenshot right now.';
				showError('Upload failed', message);
				return false;
			}

			setSlotValue(index, String(result.data.url));
			if (options.showSuccessToast !== false) {
				showSuccess('Sample screenshot uploaded', `Slot ${index + 1} is now updated.`);
			}
			return true;
		} catch (error) {
			console.error('Sample screenshot upload failed:', error);
			showError('Upload failed', 'Unable to upload screenshot right now.');
			return false;
		} finally {
			setUploading(index, false);
		}
	}

	async function uploadScreenshot(index: number, event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) {
			return;
		}

		await uploadFileToSlot(index, file);
		input.value = '';
	}

	function getAvailableSlots(): number[] {
		return slotIndexes.filter((index) => !getSlotValue(index) && !isUploading(index));
	}

	function handleDragOver(event: DragEvent): void {
		if (disabled) return;
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
		isDraggingFiles = true;
	}

	function handleDragLeave(event: DragEvent): void {
		const currentTarget = event.currentTarget as HTMLElement | null;
		const nextTarget = event.relatedTarget as Node | null;
		if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) {
			return;
		}

		isDraggingFiles = false;
	}

	async function handleDrop(event: DragEvent): Promise<void> {
		if (disabled) return;
		event.preventDefault();
		isDraggingFiles = false;

		const droppedFiles = Array.from(event.dataTransfer?.files || []).filter(
			(file) => file.size > 0
		);
		if (droppedFiles.length === 0) {
			return;
		}

		const availableSlots = getAvailableSlots();
		if (availableSlots.length === 0) {
			showError('No empty slots', 'All sample screenshot slots are already filled.');
			return;
		}

		const filesToUpload = droppedFiles.slice(0, availableSlots.length);
		let uploadedCount = 0;

		for (let index = 0; index < filesToUpload.length; index += 1) {
			const slot = availableSlots[index];
			const success = await uploadFileToSlot(slot, filesToUpload[index], {
				showSuccessToast: false
			});
			if (success) {
				uploadedCount += 1;
			}
		}

		if (uploadedCount > 0) {
			showSuccess(
				'Sample screenshots uploaded',
				`${uploadedCount} screenshot${uploadedCount === 1 ? '' : 's'} uploaded successfully.`
			);
		}

		if (droppedFiles.length > filesToUpload.length) {
			showError(
				'Some files were skipped',
				`Only ${MAX_TIER_SAMPLE_SCREENSHOTS} sample screenshots are allowed per tier.`
			);
		}
	}
</script>

<div
	class={`rounded-lg p-2 transition-all md:col-span-2 ${isDraggingFiles ? 'ring-2 ring-emerald-500/60 ring-offset-2' : ''}`}
	ondragenter={handleDragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={(event) => void handleDrop(event)}
>
	<div class="mb-2 flex items-center justify-between">
		<label class="block text-sm font-medium" style="color: var(--text);">Sample Screenshots</label>
		<span class="text-xs" style="color: var(--text-muted);"
			>Up to {MAX_TIER_SAMPLE_SCREENSHOTS}</span
		>
	</div>
	<p class="mb-3 text-xs" style="color: var(--text-muted);">
		These images appear on the tier details page as sample previews before checkout. Drag and drop
		images anywhere in this section for quick upload.
	</p>

	<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
		{#each slotIndexes as index (index)}
			{@const slotValue = getSlotValue(index)}
			<div
				class="rounded-lg p-3"
				style="border: 1px solid var(--border); background: var(--bg-elev-1);"
			>
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-medium" style="color: var(--text);">Sample {index + 1}</span>
					{#if slotValue}
						<span
							class="rounded-full px-2 py-0.5 text-[10px] font-medium"
							style="background: rgba(34, 197, 94, 0.15); color: rgb(34, 197, 94); border: 1px solid rgba(34, 197, 94, 0.25);"
						>
							Ready
						</span>
					{/if}
				</div>

				<div
					class="relative mb-2 flex h-32 items-center justify-center overflow-hidden rounded-md"
					style="border: 1px dashed var(--border); background: var(--bg);"
				>
					{#if slotValue}
						<img
							src={slotValue}
							alt="Sample screenshot preview {index + 1}"
							class="h-full w-full object-cover"
						/>
						<span
							class="absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
							style="background: rgba(15, 23, 42, 0.75); color: #fff;"
						>
							Sample Screenshot
						</span>
					{:else}
						<div class="flex flex-col items-center gap-1" style="color: var(--text-muted);">
							<ImagePlus class="h-5 w-5" />
							<span class="text-[11px]">No image</span>
						</div>
					{/if}
				</div>

				<input
					type="url"
					value={slotValue}
					oninput={(event) => setSlotValue(index, (event.currentTarget as HTMLInputElement).value)}
					class="mb-2 block w-full rounded-md px-2 py-1.5 text-xs"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
					placeholder="https://..."
					{disabled}
				/>

				<div class="flex items-center gap-2">
					<input
						id={getFileInputId(index)}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						class="hidden"
						onchange={(event) => void uploadScreenshot(index, event)}
						disabled={disabled || isUploading(index)}
					/>
					<button
						type="button"
						onclick={() => openFilePicker(index)}
						disabled={disabled || isUploading(index)}
						class="inline-flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
						style="border: 1px solid var(--border); background: var(--surface); color: var(--text);"
					>
						{#if isUploading(index)}
							Uploading...
						{:else}
							<Upload class="h-3.5 w-3.5" />
							Upload
						{/if}
					</button>
					<button
						type="button"
						onclick={() => clearSlot(index)}
						disabled={disabled || (!slotValue && !isUploading(index))}
						class="inline-flex items-center justify-center rounded-full p-1.5 text-red-600 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
						style="background: var(--surface); border: 1px solid var(--border);"
						aria-label={`Clear sample screenshot ${index + 1}`}
					>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>
