<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let likes = $state(0);
	let burst = $state(false);
	let loading = $state(true);

	onMount(async () => {
		try {
			const res = await fetch(`/api/blog/${slug}/like`);
			if (res.ok) {
				const data = await res.json();
				likes = data.likes;
			}
		} finally {
			loading = false;
		}
	});

	async function handleLike() {
		// Optimistic update
		likes += 1;
		burst = true;
		setTimeout(() => (burst = false), 600);

		try {
			const res = await fetch(`/api/blog/${slug}/like`, { method: 'POST' });
			if (res.ok) {
				const data = await res.json();
				likes = data.likes;
			}
		} catch {
			// keep optimistic count — non-critical
		}
	}
</script>

<div class="like-wrap">
	<button
		class="like-btn"
		class:burst
		onclick={handleLike}
		aria-label="Like this article"
		disabled={loading}
	>
		<svg
			class="heart"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
				fill="currentColor"
			/>
		</svg>
		<span class="like-label">
			{#if loading}
				&nbsp;
			{:else}
				{likes.toLocaleString()}
			{/if}
		</span>
	</button>
	<p class="like-hint">Tap to like</p>
</div>

<style>
	.like-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem 0 1rem;
	}

	.like-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem 1.25rem 0.625rem 1rem;
		border-radius: 9999px;
		border: 1px solid rgba(5, 212, 113, 0.28);
		background: rgba(5, 212, 113, 0.07);
		color: rgba(255, 255, 255, 0.55);
		font-family: var(--font-head);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 120ms ease,
			background 120ms ease,
			border-color 120ms ease,
			color 120ms ease;
		will-change: transform;
	}

	.like-btn:hover:not(:disabled) {
		background: rgba(5, 212, 113, 0.14);
		border-color: rgba(5, 212, 113, 0.5);
		color: #fff;
	}

	.like-btn:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.like-btn:active:not(:disabled) {
		transform: scale(0.94);
	}

	.heart {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--fa-green-500);
		transition: transform 120ms ease;
		flex-shrink: 0;
	}

	/* Pop animation on like */
	.burst .heart {
		animation: heart-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	.burst {
		background: rgba(5, 212, 113, 0.18) !important;
		border-color: var(--fa-green-500) !important;
		color: #fff !important;
	}

	.like-label {
		min-width: 1.5rem;
		text-align: left;
	}

	.like-hint {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.28);
		font-family: var(--font-head);
		letter-spacing: 0.03em;
		margin: 0;
	}

	@keyframes heart-pop {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.45);
			color: var(--fa-lime-400);
		}
		70% {
			transform: scale(0.92);
		}
		100% {
			transform: scale(1);
			color: var(--fa-green-500);
		}
	}
</style>
