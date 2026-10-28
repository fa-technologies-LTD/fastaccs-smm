<script lang="ts">
	import MicrocopyEditor from '$lib/components/admin/MicrocopyEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Site Text - Admin Panel</title></svelte:head>

<MicrocopyEditor items={data.microcopy} mode="text" />
