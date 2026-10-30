<script lang="ts">
	import { Upload } from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';

	let {
		affiliateId,
		payoutId,
		hasReceipt,
		onUploaded
	}: {
		affiliateId: string;
		payoutId: string;
		hasReceipt: boolean;
		onUploaded: (uploadedAt: string) => void;
	} = $props();

	let uploading = $state(false);
	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	// Phone screenshots are large; a 1600px JPEG keeps every word legible at a fraction of the size.
	async function shrink(file: File): Promise<File> {
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/jpeg', 0.82)
			);
			return blob && blob.size < file.size
				? new File([blob], 'receipt.jpg', { type: 'image/jpeg' })
				: file;
		} catch {
			return file;
		}
	}

	async function upload(file: File | undefined) {
		if (!file || uploading) return;
		if (!file.type.startsWith('image/')) {
			showError('Use an image', 'Upload a screenshot or photo of the transfer receipt.');
			return;
		}
		uploading = true;
		try {
			const body = new FormData();
			body.append('file', await shrink(file));
			const response = await fetch(
				`/api/admin/affiliates/${affiliateId}/payouts/${payoutId}/receipt`,
				{ method: 'POST', body }
			);
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success) {
				showError('Receipt not saved', result?.error || 'Try again.');
				return;
			}
			onUploaded(result.receipt.uploadedAt);
			showSuccess('Receipt added', 'The affiliate can now view it.');
		} finally {
			uploading = false;
			if (input) input.value = '';
		}
	}
</script>

<div class="flex flex-col gap-1">
	{#if hasReceipt}
		<a
			href={`/api/payouts/${payoutId}/receipt`}
			target="_blank"
			rel="noopener"
			class="font-semibold"
			style="color: var(--primary);">View receipt</a
		>
	{/if}
	<button
		type="button"
		class="flex items-center gap-1.5 rounded border border-dashed px-2 py-1.5 text-left disabled:opacity-60"
		style="border-color: {dragging ? 'var(--primary)' : 'var(--border)'}; color: var(--text-dim);"
		disabled={uploading}
		onclick={() => input?.click()}
		ondragover={(event) => {
			event.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={(event) => {
			event.preventDefault();
			dragging = false;
			void upload(event.dataTransfer?.files?.[0]);
		}}
	>
		<Upload class="size-3.5 shrink-0" />
		{uploading ? 'Uploading…' : hasReceipt ? 'Replace receipt' : 'Drop receipt or click'}
	</button>
	<input
		bind:this={input}
		type="file"
		accept="image/jpeg,image/png,image/webp"
		class="hidden"
		onchange={(event) => void upload(event.currentTarget.files?.[0])}
	/>
</div>
