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
		formatValue = (value: number) => String(value),
		emptyMessage = 'No revenue data available.'
	}: {
		data: Point[];
		height?: number;
		color?: string;
		formatLabel?: (key: string) => string;
		formatValue?: (value: number) => string;
		emptyMessage?: string;
	} = $props();

	const isEmpty = $derived(data.length === 0 || data.every((d) => d.value === 0));

	const margin = { top: 12, right: 8, bottom: 20, left: 8 };

	let hoverIndex = $state<number | null>(null);

	// Map the pointer to the nearest data point (points are evenly spread across the plot width).
	function onHover(e: PointerEvent) {
		const svg = (e.currentTarget as SVGElement).ownerSVGElement;
		const n = data.length;
		if (!svg || n < 1) return;
		const r = svg.getBoundingClientRect();
		const plot = r.width - margin.left - margin.right;
		if (plot <= 0) return;
		const frac = (e.clientX - r.left - margin.left) / plot;
		hoverIndex = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
	}
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
			<text x={margin.left} y={y(tick) - 2} font-size="9" fill="var(--text-dim)">
				{formatValue(tick)}
			</text>
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

		<!-- Hover tooltip: guide line + dot + value at the nearest point. -->
		{#if hoverIndex !== null && data[hoverIndex]}
			{@const hx = x(data[hoverIndex].key) ?? 0}
			{@const hy = y(data[hoverIndex].value)}
			{@const label = formatValue(data[hoverIndex].value)}
			{@const tw = label.length * 6.5 + 16}
			{@const tx = Math.min(width - margin.right - tw, Math.max(margin.left, hx - tw / 2))}
			<line
				x1={hx}
				x2={hx}
				y1={margin.top}
				y2={h - margin.bottom}
				stroke="var(--text-dim)"
				stroke-width="1"
				stroke-dasharray="3 3"
			/>
			<circle cx={hx} cy={hy} r="4" fill={color} stroke="var(--bg-elev-1)" stroke-width="1.5" />
			<g transform="translate({tx}, {Math.max(0, hy - 26)})">
				<rect width={tw} height="19" rx="4" fill="var(--bg-elev-1)" stroke="var(--border)" />
				<text x={tw / 2} y="13" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)"
					>{label}</text
				>
			</g>
		{/if}

		<!-- Transparent capture layer for pointer tracking. -->
		<rect
			x={margin.left}
			y={margin.top}
			width={Math.max(0, width - margin.left - margin.right)}
			height={Math.max(0, h - margin.top - margin.bottom)}
			fill="transparent"
			style="cursor: crosshair;"
			onpointermove={onHover}
			onpointerleave={() => (hoverIndex = null)}
		/>
	{/snippet}
</ChartContainer>
