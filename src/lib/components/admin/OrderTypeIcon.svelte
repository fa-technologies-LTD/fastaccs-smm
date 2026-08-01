<script lang="ts">
	import { Phone, Zap } from '$lib/icons';
	import { getOrderServiceType } from '$lib/helpers/order-service-type';

	// Matches the user dashboard cues: 📞 blue = numbers, ⚡ purple = boosting, accounts = none.
	let {
		order
	}: {
		order: {
			orderType?: string | null;
			orderItems?: Array<{ productName?: string | null; boostTargetUrl?: string | null } | null> | null;
		};
	} = $props();

	const type = $derived(getOrderServiceType(order));
</script>

{#if type === 'numbers'}
	<Phone class="inline h-3.5 w-3.5 flex-shrink-0" style="color: #38bdf8;" />
{:else if type === 'boosting'}
	<Zap class="inline h-3.5 w-3.5 flex-shrink-0" style="color: #a78bfa;" />
{/if}
