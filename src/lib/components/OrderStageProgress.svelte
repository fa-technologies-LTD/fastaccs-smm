<script lang="ts">
	// A thin delivery bar for engagement, shown only when the supplier has reported numbers.
	let { percent }: { percent: number } = $props();
	const width = $derived(Math.max(0, Math.min(100, Math.round(percent))));
</script>

<div
	class="stage-progress"
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={width}
	aria-label="Delivered so far"
>
	<span style="width: {width}%"></span>
</div>

<style>
	.stage-progress {
		height: 6px;
		width: 100%;
		border-radius: 999px;
		background: color-mix(in srgb, var(--stage-progress) 16%, transparent);
		overflow: hidden;
	}
	.stage-progress span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--stage-progress);
		transition: width 400ms ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.stage-progress span {
			transition: none;
		}
	}
</style>
