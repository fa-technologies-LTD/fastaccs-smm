<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';

	import favicon from '$lib/assets/favicon.png';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import PageLoadingBar from '$lib/components/PageLoadingBar.svelte';
	import type { LayoutData } from './$types';

	interface Props {
		children: any;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

	onNavigate((navigation) => {
		// Skip if view transitions not supported
		if (!document.startViewTransition) return;

		const from = navigation.from?.route.id;
		const to = navigation.to?.route.id;

		// Skip transitions for admin panel (prioritize speed)
		if (from?.startsWith('/admin') || to?.startsWith('/admin')) {
			return;
		}

		// Skip transitions for API routes and auth pages
		if (to?.startsWith('/api') || to?.startsWith('/auth')) {
			return;
		}

		// Only apply smooth transitions for main navigation
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<PageLoadingBar />

<div class="min-h-screen bg-white">
	{@render children?.()}
	<Cart />
	<ToastContainer />
</div>
