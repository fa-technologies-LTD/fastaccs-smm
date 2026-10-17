<script lang="ts">
	import Pricing from '../../admin/boosting-pricing/+page.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>
<Pricing {data} previewOnly previewSupplierDetails={data.supplierDetails} />
