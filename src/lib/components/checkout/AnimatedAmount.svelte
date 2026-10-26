<script lang="ts">
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { formatPrice } from '$lib/helpers/utils';

	// A naira amount that glides to its new value (e.g. when store credit or a code changes what is due).
	// `from` lets it count up on first show; with reduced motion it simply changes.
	let { value, from }: { value: number; from?: number } = $props();

	const start = () => from ?? value;
	const shown = new Tween(start(), { duration: 450, easing: cubicOut });
	$effect(() => {
		void shown.set(value, { duration: prefersReducedMotion.current ? 0 : 450 });
	});
</script>

<span class="tabular-nums"
	>{shown.current === value ? formatPrice(value) : formatPrice(Math.round(shown.current))}</span
>
