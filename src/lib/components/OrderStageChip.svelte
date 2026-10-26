<script lang="ts">
	import type { OrderStage } from '$lib/helpers/order-stage';

	// The one status chip for an order, on every screen. Colour comes from the stage, not the product.
	let { stage, size = 'sm' }: { stage: OrderStage; size?: 'sm' | 'lg' } = $props();
</script>

<span class="stage-chip stage-chip--{size}" style="--stage: var(--stage-{stage.tone});">
	{stage.chip}
</span>

<style>
	.stage-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border-radius: 999px;
		font-family: var(--font-head);
		font-weight: 600;
		white-space: nowrap;
		color: var(--stage);
		background: color-mix(in srgb, var(--stage) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--stage) 35%, transparent);
	}
	.stage-chip::before {
		content: '';
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		background: currentColor;
	}
	.stage-chip--sm {
		padding: 0.15rem 0.6rem;
		font-size: 0.75rem;
	}
	.stage-chip--lg {
		padding: 0.3rem 0.85rem;
		font-size: 0.875rem;
	}
</style>
