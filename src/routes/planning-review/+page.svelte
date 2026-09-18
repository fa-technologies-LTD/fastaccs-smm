<script lang="ts">
	import PlanningReview from '../admin/planning-review/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PlanningReview {data} />
