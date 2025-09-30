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

	function getToastColors(type: Toast['type']) {
		switch (type) {
			case 'success':
				return 'bg-green-50 border-green-200 text-green-800';
			case 'error':
				return 'bg-red-50 border-red-200 text-red-800';
			case 'warning':
				return 'bg-yellow-50 border-yellow-200 text-yellow-800';
			case 'info':
				return 'bg-blue-50 border-blue-200 text-blue-800';
		}
	}

	function getIconColors(type: Toast['type']) {
		switch (type) {
			case 'success':
				return 'text-green-600';
			case 'error':
				return 'text-red-600';
			case 'warning':
				return 'text-yellow-600';
			case 'info':
				return 'text-blue-600';
		}
	}
</script>

<!-- Toast Container -->
<div class="fixed top-4 right-4 z-50 w-full max-w-sm space-y-2">
	{#each $toasts as toast (toast.id)}
		{@const Icon = getToastIcon(toast.type)}
		<div
			transition:fly={{ x: 400, duration: 300 }}
			class="flex items-start gap-3 rounded-lg border p-4 shadow-lg {getToastColors(toast.type)}"
		>
			<Icon class="mt-0.5 h-5 w-5 flex-shrink-0 {getIconColors(toast.type)}" />

			<div class="min-w-0 flex-1">
				<p class="text-sm font-medium">{toast.title}</p>
				{#if toast.message}
					<p class="mt-1 text-sm opacity-90">{toast.message}</p>
				{/if}
			</div>

			<button
				onclick={() => removeToast(toast.id)}
				class="ml-2 flex-shrink-0 rounded p-0.5 transition-colors hover:bg-black/5"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/each}
</div>
