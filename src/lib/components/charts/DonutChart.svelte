<script lang="ts">
	import { arc, pie, type PieArcDatum } from 'd3-shape';
	import { CHART_COLORS, type ChartDatum } from './chart-theme';

	let {
		data,
		size = 140,
		innerRadiusRatio = 0.62,
		colors = CHART_COLORS,
		formatValue = (value: number) => String(value),
		centerLabel,
		emptyMessage = 'No data available.'
	}: {
		data: ChartDatum[];
		size?: number;
		innerRadiusRatio?: number;
		colors?: readonly string[];
		formatValue?: (value: number) => string;
		centerLabel?: string;
		emptyMessage?: string;
	} = $props();

	const total = $derived(data.reduce((sum, d) => sum + d.value, 0));
	const isEmpty = $derived(data.length === 0 || total <= 0);

	const pieGenerator = pie<ChartDatum>()
		.value((d) => d.value)
		.sort(null);

	const arcGenerator = arc<PieArcDatum<ChartDatum>>()
		.innerRadius((size / 2) * innerRadiusRatio)
		.outerRadius(size / 2 - 1);

	const arcs = $derived(pieGenerator(data));

	function colorFor(d: ChartDatum, index: number): string {
		return d.color || colors[index % colors.length];
	}

	function percentOf(value: number): string {
		return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';
	}
</script>

{#if isEmpty}
	<div
		class="flex items-center justify-center text-sm"
		style="height: {size}px; color: var(--text-muted);"
	>
		{emptyMessage}
	</div>
{:else}
	<div class="flex flex-col items-center gap-3">
		<div class="relative" style="width: {size}px; height: {size}px;">
			<svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label="Donut chart">
				<g transform="translate({size / 2},{size / 2})">
					{#each arcs as arcDatum, i (arcDatum.data.label)}
						<path d={arcGenerator(arcDatum) ?? undefined} fill={colorFor(arcDatum.data, i)} />
					{/each}
				</g>
			</svg>
			{#if centerLabel}
				<div
					class="absolute inset-0 flex items-center justify-center text-center text-xs font-semibold"
					style="color: var(--text);"
				>
					{centerLabel}
				</div>
			{/if}
		</div>
		<ul class="w-full space-y-1">
			{#each data as d, i (d.label)}
				<li class="flex items-center justify-between gap-2 text-xs" style="color: var(--text-muted);">
					<span class="flex min-w-0 items-center gap-2">
						<span
							class="h-2.5 w-2.5 shrink-0 rounded-full"
							style="background: {colorFor(d, i)};"
						></span>
						<span class="truncate">{d.label}</span>
					</span>
					<span class="shrink-0 font-semibold" style="color: var(--text);">
						{formatValue(d.value)} ({percentOf(d.value)})
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
