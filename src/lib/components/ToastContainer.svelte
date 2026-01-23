<script lang="ts">
	import { toasts, removeToast, type Toast } from '$lib/stores/toasts';
	import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from '@lucide/svelte';
	import { fly } from 'svelte/transition';

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
				transition:fly={{ x: 400, duration: 300 }}
				class="toast toast-{toast.type} toast-link"
			>
				<Icon class="toast-icon" />

				<div class="toast-content">
					<p class="toast-title">{toast.title}</p>
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
			<div transition:fly={{ x: 400, duration: 300 }} class="toast toast-{toast.type}">
				<Icon class="toast-icon" />

				<div class="toast-content">
					<p class="toast-title">{toast.title}</p>
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
		z-index: 50;
		width: 100%;
		max-width: 24rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		border-radius: 0.5rem;
		border-width: 1px;
		padding: 1rem;
		box-shadow:
			0 10px 15px -3px rgb(0 0 0 / 0.1),
			0 4px 6px -4px rgb(0 0 0 / 0.1);
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

	/* Success Toast */
	.toast-success {
		background-color: rgba(7, 25, 12, 0.98);
		border-color: var(--status-success-border);
		color: var(--status-success);
		backdrop-filter: blur(8px);
	}

	/* Error Toast */
	.toast-error {
		background-color: rgba(25, 7, 7, 0.98);
		border-color: var(--status-error-border);
		color: var(--status-error);
		backdrop-filter: blur(8px);
	}

	/* Warning Toast */
	.toast-warning {
		background-color: rgba(25, 22, 7, 0.98);
		border-color: var(--status-warning-border);
		color: var(--status-warning);
		backdrop-filter: blur(8px);
	}

	/* Info Toast */
	.toast-info {
		background-color: rgba(7, 8, 25, 0.98);
		border-color: var(--status-info-border);
		color: var(--status-info);
		backdrop-filter: blur(8px);
	}

	.toast-icon {
		margin-top: 0.125rem;
		height: 1.25rem;
		width: 1.25rem;
		flex-shrink: 0;
	}

	.toast-content {
		min-width: 0;
		flex: 1;
	}

	.toast-title {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.toast-message {
		margin-top: 0.25rem;
		font-size: 0.875rem;
		opacity: 0.9;
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
</style>
