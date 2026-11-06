<script lang="ts">
	import { Upload } from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';

	type ProofSummary = {
		uploadedAt: string | null;
		firstViewedAt: string | null;
		deletedAt: string | null;
		expiresAt: string | null;
	};
	let {
		itemId,
		proof = null,
		onUploaded
	}: {
		itemId: string;
		proof?: ProofSummary | null;
		onUploaded: () => void | Promise<void>;
	} = $props();

	let uploading = $state(false);
	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);
	const live = $derived(Boolean(proof && !proof.deletedAt));
	const day = (value: string | null) =>
		value
			? new Date(value).toLocaleDateString('en-NG', {
					day: 'numeric',
					month: 'short',
					timeZone: 'Africa/Lagos'
				})
			: '';
	const status = $derived(
		!proof
			? 'Optional. The customer sees it only after you close their report, and only once.'
			: proof.deletedAt
				? `Deleted ${day(proof.deletedAt)} after 30 days.`
				: proof.firstViewedAt
					? `Saved ${day(proof.uploadedAt)} · customer viewed it ${day(proof.firstViewedAt)} · deleted ${day(proof.expiresAt)}.`
					: `Saved ${day(proof.uploadedAt)} · not viewed by the customer · deleted ${day(proof.expiresAt)}.`
	);

	// Phone screenshots are large; a 1600px JPEG keeps every number legible at a fraction of the size.
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
				? new File([blob], 'proof.jpg', { type: 'image/jpeg' })
				: file;
		} catch {
			return file;
		}
	}

	async function upload(file: File | null | undefined) {
		if (!file || uploading) return;
		if (!file.type.startsWith('image/')) {
			showError('Use an image', 'Add a screenshot that shows the delivery.');
			return;
		}
		uploading = true;
		try {
			const body = new FormData();
			body.append('file', await shrink(file));
			const response = await fetch(
				`/api/admin/boosting-orders/${encodeURIComponent(itemId)}/proof`,
				{ method: 'POST', body }
			);
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success) {
				showError('Proof not saved', result?.error || 'Try again.');
				return;
			}
			showSuccess('Proof saved', 'Kept privately for 30 days.');
			await onUploaded();
		} finally {
			uploading = false;
			if (input) input.value = '';
		}
	}

	function pasted(event: ClipboardEvent) {
		const file = [...(event.clipboardData?.files ?? [])].find((entry) =>
			entry.type.startsWith('image/')
		);
		if (!file) return;
		event.preventDefault();
		void upload(file);
	}
</script>

<div class="proof">
	<div class="proof__head">
		<span class="proof__title">Delivery proof</span>
		{#if live}<a
				href={`/api/admin/boosting-orders/${encodeURIComponent(itemId)}/proof`}
				target="_blank"
				rel="noopener">View proof</a
			>{/if}
	</div>
	<!-- A text box is the natural paste target on every device; it only ever takes an image. -->
	<textarea
		class="proof__zone"
		class:is-dragging={dragging}
		rows="1"
		aria-label="Paste or drop a delivery screenshot"
		placeholder={uploading
			? 'Saving…'
			: live
				? 'Paste or drop a new screenshot to replace it'
				: 'Paste or drop a screenshot here'}
		disabled={uploading}
		value=""
		oninput={(event) => (event.currentTarget.value = '')}
		onpaste={pasted}
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
	></textarea>
	<button type="button" class="proof__choose" disabled={uploading} onclick={() => input?.click()}>
		<Upload class="size-3.5 shrink-0" />{live ? 'Choose another screenshot' : 'Choose screenshot'}
	</button>
	<input
		bind:this={input}
		type="file"
		accept="image/jpeg,image/png,image/webp"
		class="hidden"
		onchange={(event) => void upload(event.currentTarget.files?.[0])}
	/>
	<p class="proof__status">{status}</p>
</div>

<style>
	.proof {
		display: grid;
		gap: 0.35rem;
		font-size: 0.75rem;
	}
	.proof__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.proof__title {
		color: var(--text-muted);
		font-weight: 600;
	}
	.proof__head a {
		color: var(--primary);
		font-weight: 600;
	}
	.proof__zone {
		min-height: 2.75rem;
		padding: 0.65rem 0.75rem;
		border: 1px dashed var(--border);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--text);
		font-size: 0.75rem;
		resize: none;
		caret-color: transparent;
	}
	.proof__zone::placeholder {
		color: var(--text-dim);
	}
	.proof__zone:focus,
	.proof__zone.is-dragging {
		border-color: var(--primary);
		outline: none;
	}
	.proof__zone:disabled {
		opacity: 0.6;
	}
	.proof__choose {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		justify-self: start;
		min-height: 2.75rem;
		padding: 0 0.25rem;
		color: var(--primary);
		font-weight: 600;
	}
	.proof__choose:disabled {
		opacity: 0.6;
	}
	.proof__status {
		margin: 0;
		color: var(--text-dim);
	}
</style>
