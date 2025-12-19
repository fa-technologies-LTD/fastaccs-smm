<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import favicon from '$lib/assets/favicon.png';
	import Cart from '$lib/components/Cart.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import type { LayoutData } from './$types';

	interface Props {
		children: any;
		data: LayoutData;
	}

	let { children, data }: Props = $props();


	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async() => {{
				resolve()
				await navigation.complete
			}})
		})
	})

</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-white">
	{@render children?.()}
	<Cart />
	<ToastContainer />
</div>
