<script lang="ts">
	import { scaleLinear, scalePoint } from 'd3-scale';
	import { area, curveMonotoneX, line } from 'd3-shape';
	import { max } from 'd3-array';

	let {
		data,
		width = 80,
		height = 24,
		color = 'var(--primary)',
		fillOpacity = 0.12
	}: {
		data: number[];
		width?: number;
		height?: number;
		color?: string;
		fillOpacity?: number;
	} = $props();

	const points = $derived(data.map((value, index) => ({ index: String(index), value })));

	const x = $derived(
		scalePoint<string>()
			.domain(points.map((p) => p.index))
			.range([0, width])
	);

	const y = $derived(
		scaleLinear()
			.domain([0, max(data) || 1])
			.range([height - 1, 1])
	);

	const areaPath = $derived(
		area<{ index: string; value: number }>()
			.x((p) => x(p.index) ?? 0)
			.y0(height)
			.y1((p) => y(p.value))
			.curve(curveMonotoneX)(points)
	);

	const linePath = $derived(
		line<{ index: string; value: number }>()
			.x((p) => x(p.index) ?? 0)
			.y((p) => y(p.value))
			.curve(curveMonotoneX)(points)
	);

	const hasTrend = $derived(data.length >= 2 && data.some((v) => v > 0));
</script>

{#if hasTrend}
	<svg {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
		{#if areaPath}
			<path d={areaPath} fill={color} fill-opacity={fillOpacity} stroke="none" />
		{/if}
		{#if linePath}
			<path d={linePath} fill="none" stroke={color} stroke-width="1.5" />
		{/if}
	</svg>
{/if}
