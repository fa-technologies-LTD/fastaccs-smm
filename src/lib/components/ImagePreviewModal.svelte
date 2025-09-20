<script lang="ts">
	import { X, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { onMount } from 'svelte';

	interface Props {
		images: string[];
		isOpen: boolean;
		onClose: () => void;
		initialIndex?: number;
	}

	let { images, isOpen, onClose, initialIndex = 0 }: Props = $props();

	let currentIndex = $state(initialIndex);
	let modalElement: HTMLDivElement | undefined = $state();

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;

		switch (event.key) {
			case 'Escape':
				onClose();
				break;
			case 'ArrowLeft':
				goToPrevious();
				break;
			case 'ArrowRight':
				goToNext();
				break;
		}
	}

	function goToPrevious() {
		currentIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
	}

	function goToNext() {
		currentIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === modalElement) {
			onClose();
		}
	}

	onMount(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
		}

		return () => {
			document.body.style.overflow = 'auto';
		};
	});

	// Update body overflow when modal state changes
	$effect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
			currentIndex = initialIndex;
		} else {
			document.body.style.overflow = 'auto';
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Modal Backdrop -->
	<div
		bind:this={modalElement}
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Image preview"
		tabindex="-1"
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
	>
		<!-- Close Button -->
		<button
			onclick={onClose}
			class="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
		>
			<X class="h-6 w-6" />
		</button>

		<!-- Navigation Buttons -->
		{#if images.length > 1}
			<button
				onclick={goToPrevious}
				class="absolute top-1/2 left-4 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
			>
				<ChevronLeft class="h-6 w-6" />
			</button>

			<button
				onclick={goToNext}
				class="absolute top-1/2 right-4 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
			>
				<ChevronRight class="h-6 w-6" />
			</button>
		{/if}

		<!-- Main Image Container -->
		<div class="relative max-h-[90vh] max-w-[90vw]">
			<img
				src={images[currentIndex]}
				alt="Preview {currentIndex + 1}"
				class="h-auto max-h-[90vh] max-w-[90vw] object-contain"
			/>

			<!-- Image Counter -->
			{#if images.length > 1}
				<div class="absolute bottom-4 left-1/2 -translate-x-1/2">
					<div class="rounded-full bg-black/70 px-3 py-1 text-sm text-white">
						{currentIndex + 1} / {images.length}
					</div>
				</div>
			{/if}
		</div>

		<!-- Thumbnail Navigation -->
		{#if images.length > 1}
			<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
				{#each images as _, index}
					<button
						onclick={() => (currentIndex = index)}
						class="h-12 w-12 overflow-hidden rounded border-2 {index === currentIndex
							? 'border-white'
							: 'border-transparent'} transition-all hover:scale-110"
					>
						<img
							src={images[index]}
							alt="Thumbnail {index + 1}"
							class="h-full w-full object-cover"
						/>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	:global(body.modal-open) {
		overflow: hidden;
	}
</style>
