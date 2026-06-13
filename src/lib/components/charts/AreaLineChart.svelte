<script lang="ts">
	import { scaleLinear, scalePoint } from 'd3-scale';
	import { area, curveMonotoneX, line } from 'd3-shape';
	import { max } from 'd3-array';
	import ChartContainer from './ChartContainer.svelte';
	import { DEFAULT_CHART_HEIGHT } from './chart-theme';

	type Point = { key: string; value: number };

	let {
		data,
		height = DEFAULT_CHART_HEIGHT,
		color = 'var(--primary)',
		formatLabel = (key: string) => key,
		emptyMessage = 'No revenue data available.'
	}: {
		data: Point[];
		height?: number;
		color?: string;
		formatLabel?: (key: string) => string;
		emptyMessage?: string;
	} = $props();

	const isEmpty = $derived(data.length === 0 || data.every((d) => d.value === 0));

	const margin = { top: 8, right: 8, bottom: 20, left: 8 };
</script>

<ChartContainer {height} empty={isEmpty} {emptyMessage} ariaLabel="Revenue trend chart">
	{#snippet children({ width, height: h })}
		{@const x = scalePoint<string>()
			.domain(data.map((d) => d.key))
			.range([margin.left, width - margin.right])}
		{@const y = scaleLinear()
			.domain([0, max(data, (d) => d.value) || 1])
			.range([h - margin.bottom, margin.top])
			.nice()}
		{@const areaPath = area<Point>()
			.x((d) => x(d.key) ?? 0)
			.y0(y(0))
			.y1((d) => y(d.value))
			.curve(curveMonotoneX)(data)}
		{@const linePath = line<Point>()
			.x((d) => x(d.key) ?? 0)
			.y((d) => y(d.value))
			.curve(curveMonotoneX)(data)}
		{@const maxLabels = width < 480 ? 4 : 8}
		{@const step = Math.max(1, Math.ceil(data.length / maxLabels))}
		{@const lastIndex = data.length - 1}

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

		{#if areaPath}
			<path d={areaPath} fill={color} fill-opacity="0.15" stroke="none" />
		{/if}
		{#if linePath}
			<path d={linePath} fill="none" stroke={color} stroke-width="2" />
		{/if}

		{#each data as d, i (d.key)}
			{#if i % step === 0 || i === lastIndex}
				<text
					x={x(d.key) ?? 0}
					y={h - 4}
					text-anchor={i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle'}
					font-size="10"
					fill="var(--text-dim)"
				>
					{formatLabel(d.key)}
				</text>
			{/if}
		{/each}
	{/snippet}
</ChartContainer>
