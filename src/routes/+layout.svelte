<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Cart from '$lib/components/Cart.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import type { LayoutData } from './$types';

	interface Props {
		children: any;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-white">
	{@render children?.()}
	<Cart />
	<ToastContainer />
</div>
