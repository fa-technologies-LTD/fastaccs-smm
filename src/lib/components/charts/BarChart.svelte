<script lang="ts">
	import { scaleBand, scaleLinear } from 'd3-scale';
	import { max } from 'd3-array';
	import ChartContainer from './ChartContainer.svelte';
	import { type ChartDatum, DEFAULT_CHART_HEIGHT } from './chart-theme';

	let {
		data,
		orientation = 'horizontal',
		height = DEFAULT_CHART_HEIGHT,
		color = 'var(--primary)',
		formatValue = (value: number) => String(value),
		emptyMessage = 'No data available.'
	}: {
		data: ChartDatum[];
		orientation?: 'horizontal' | 'vertical';
		height?: number;
		color?: string;
		formatValue?: (value: number) => string;
		emptyMessage?: string;
	} = $props();

	const isEmpty = $derived(data.length === 0 || data.every((d) => d.value === 0));

	const horizontalScale = $derived(
		scaleLinear()
			.domain([0, max(data, (d) => d.value) || 1])
			.range([0, 100])
	);

	const margin = { top: 8, right: 8, bottom: 20, left: 8 };
</script>

{#if orientation === 'horizontal'}
	{#if isEmpty}
		<div
			class="flex items-center justify-center text-sm"
			style="color: var(--text-muted); min-height: 60px;"
		>
			{emptyMessage}
		</div>
	{:else}
		<div class="space-y-2">
			{#each data as d, i (d.label)}
				<div class="grid grid-cols-[1fr_auto] items-center gap-3">
					<div class="min-w-0">
						<p class="truncate text-sm" style="color: var(--text);">{d.label}</p>
						<svg
							width="100%"
							height="8"
							viewBox="0 0 100 8"
							preserveAspectRatio="none"
							class="mt-1"
							aria-hidden="true"
						>
							<rect width={horizontalScale(d.value)} height="8" rx="2" fill={d.color || color} />
						</svg>
					</div>
					<span class="text-sm font-semibold whitespace-nowrap" style="color: var(--text);">
						{formatValue(d.value)}
					</span>
				</div>
			{/each}
		</div>
	{/if}
{:else}
	<ChartContainer {height} empty={isEmpty} {emptyMessage} ariaLabel="Bar chart">
		{#snippet children({ width, height: h })}
			{@const x = scaleBand<string>()
				.domain(data.map((d) => d.label))
				.range([margin.left, width - margin.right])
				.padding(0.2)}
			{@const y = scaleLinear()
				.domain([0, max(data, (d) => d.value) || 1])
				.range([h - margin.bottom, margin.top])
				.nice()}
			{@const maxLabels = width < 480 ? 4 : 8}
			{@const step = Math.max(1, Math.ceil(data.length / maxLabels))}

			{#each y.ticks(4) as tick (tick)}
				<line
					x1={margin.left}
					x2={width - margin.right}
					y1={y(tick)}
					y2={y(tick)}
					stroke="var(--border)"
					stroke-width="1"
				/>
			{/each}

			{#each data as d, i (d.label)}
				<rect
					x={x(d.label) ?? 0}
					y={y(d.value)}
					width={x.bandwidth()}
					height={h - margin.bottom - y(d.value)}
					fill={d.color || color}
					rx="2"
				/>
				{#if i % step === 0 || i === data.length - 1}
					<text
						x={(x(d.label) ?? 0) + x.bandwidth() / 2}
						y={h - 4}
						text-anchor="middle"
						font-size="10"
						fill="var(--text-dim)"
					>
						{d.label}
					</text>
				{/if}
			{/each}
		{/snippet}
	</ChartContainer>
{/if}
