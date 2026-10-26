<script lang="ts">
	import { toasts, removeToast, type Toast } from '$lib/stores/toasts';
	import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from '$lib/icons';
	import { fly } from 'svelte/transition';
	import { toneStyle } from '$lib/notify/kinds';

	function getToastIcon(type: Toast['type']) {
		switch (type) {
			case 'success':
				return CheckCircle;
			case 'error':
				return AlertCircle;
			case 'warning':
				return AlertTriangle;
			case 'info':
				return Info;
		}
	}
</script>

<!-- Toast Container -->
<div class="toast-container">
	{#each $toasts as toast (toast.id)}
		{@const Icon = getToastIcon(toast.type)}
		{#if toast.link}
			<a
				href={toast.link}
				transition:fly={{ x: 240, duration: 220 }}
				class="toast toast-{toast.type} toast-link"
				style={toneStyle(toast.type)}
			>
				<span class="toast-icon-wrap" aria-hidden="true"><Icon class="toast-icon" /></span>

				<div class="toast-content">
					<div class="toast-title-row">
						<p class="toast-title">{toast.title}</p>
						{#if (toast.count || 1) > 1}
							<span class="toast-count">x{toast.count}</span>
						{/if}
					</div>
					{#if toast.message}
						<p class="toast-message">{toast.message}</p>
					{/if}
				</div>

				<button
					onclick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						removeToast(toast.id);
					}}
					class="toast-close"
				>
					<X class="toast-close-icon" />
				</button>
			</a>
		{:else}
			<div
				transition:fly={{ x: 240, duration: 220 }}
				class="toast toast-{toast.type}"
				style={toneStyle(toast.type)}
			>
				<span class="toast-icon-wrap" aria-hidden="true"><Icon class="toast-icon" /></span>

				<div class="toast-content">
					<div class="toast-title-row">
						<p class="toast-title">{toast.title}</p>
						{#if (toast.count || 1) > 1}
							<span class="toast-count">x{toast.count}</span>
						{/if}
					</div>
					{#if toast.message}
						<p class="toast-message">{toast.message}</p>
					{/if}
				</div>

				<button onclick={() => removeToast(toast.id)} class="toast-close">
					<X class="toast-close-icon" />
				</button>
			</div>
		{/if}
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		left: auto;
		z-index: 50;
		width: min(24rem, calc(100vw - 2rem));
		max-width: 24rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		border-radius: 0.875rem;
		border-width: 1px;
		border-style: solid;
		padding: 0.75rem 0.875rem;
		box-shadow:
			0 10px 15px -3px rgb(0 0 0 / 0.1),
			0 4px 6px -4px rgb(0 0 0 / 0.1);
		will-change: transform, opacity;
	}

	.toast-link {
		cursor: pointer;
		transition: box-shadow 0.2s;
		text-decoration: none;
	}

	.toast-link:hover {
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.1),
			0 8px 10px -6px rgb(0 0 0 / 0.1);
	}

	/* Every kind shares one look (see $lib/notify/kinds): a surface card with the kind's border and
	   icon chip, and readable text. */
	.toast {
		background-color: var(--bg-elev-1);
		border-color: var(--tone-border);
		color: var(--text);
		backdrop-filter: blur(8px);
	}

	.toast-icon-wrap {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		border-radius: 999px;
		background: var(--tone-bg);
		color: var(--tone);
	}

	.toast-icon {
		height: 1rem;
		width: 1rem;
	}

	.toast-content {
		min-width: 0;
		flex: 1;
	}

	.toast-title-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.toast-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text);
	}

	.toast-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.35rem;
		height: 1.15rem;
		padding: 0 0.38rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
		border: 1px solid currentColor;
		opacity: 0.82;
	}

	.toast-message {
		margin-top: 0.125rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.toast-close {
		margin-left: 0.5rem;
		flex-shrink: 0;
		border-radius: 0.25rem;
		padding: 0.125rem;
		transition: background-color 0.2s;
		background: transparent;
		border: none;
		cursor: pointer;
		color: inherit;
	}

	.toast-close:hover {
		background-color: rgba(0, 0, 0, 0.1);
	}

	.toast-close-icon {
		height: 1rem;
		width: 1rem;
	}

	@media (max-width: 640px) {
		.toast-container {
			top: 4.5rem;
			right: 0.75rem;
			left: 0.75rem;
			width: auto;
			max-width: none;
		}

		.toast {
			padding: 0.8rem;
			backdrop-filter: none;
		}
	}
</style>
