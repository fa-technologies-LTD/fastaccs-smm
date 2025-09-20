<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Cart from '$lib/components/Cart.svelte';
	import type { LayoutData } from './$types';

	interface Props {
		children: any;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

	let { session, supabase } = $derived(data);

	onMount(() => {
		const { data: subscription } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		return () => subscription?.subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-white">
	{@render children?.()}
	<Cart />
</div>
