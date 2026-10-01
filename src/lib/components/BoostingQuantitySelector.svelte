<script lang="ts">
	import { Minus, Plus } from '$lib/icons';
	import { normalizeBoostingQuantity } from '$lib/helpers/boosting-service-config';

	interface Props {
		value: number;
		minQuantity: number;
		maxQuantity?: number | null;
		stepQuantity: number;
		presets?: number[];
		label?: string;
		compact?: boolean;
		onchange: (value: number) => void;
	}

	let {
		value,
		minQuantity,
		maxQuantity = null,
		stepQuantity,
		presets = [],
		label = 'Quantity',
		compact = false,
		onchange
	}: Props = $props();
	let typedValue = $state<string | number>('');
	let lastExternalValue = $state<number | null>(null);

	$effect(() => {
		if (value === lastExternalValue) return;
		lastExternalValue = value;
		typedValue = String(value);
	});

	function commit(rawValue: number): void {
		const next = normalizeBoostingQuantity(rawValue, minQuantity, stepQuantity, maxQuantity);
		lastExternalValue = next;
		typedValue = String(next);
		onchange(next);
	}

	function commitTyped(): void {
		commit(Number(String(typedValue).replaceAll(',', '')));
	}

	function adjust(direction: -1 | 1): void {
		commit(value + direction * stepQuantity);
	}
</script>

<div class={compact ? 'space-y-2' : 'space-y-3'}>
	{#if presets.length}
		<div class="flex flex-wrap gap-2" aria-label={`${label} quick choices`}>
			{#each presets as preset (preset)}
				<button
					type="button"
					onclick={() => commit(preset)}
					class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
					style={value === preset
						? 'border-color: var(--primary); background: var(--primary); color: #00150b;'
						: 'border-color: var(--border); background: var(--surface); color: var(--text-muted);'}
				>
					{preset.toLocaleString()}
				</button>
			{/each}
		</div>
	{/if}

	<div class="flex items-end justify-between gap-3">
		<label class="min-w-0 flex-1">
			<span class="mb-1 block text-xs font-medium" style="color: var(--text);">{label}</span>
			<span
				class="flex items-stretch overflow-hidden rounded-xl border"
				style="border-color: var(--border); background: var(--bg);"
			>
				<button
					type="button"
					onclick={() => adjust(-1)}
					disabled={value <= minQuantity}
					class="flex min-w-11 items-center justify-center border-r px-3 disabled:opacity-40"
					style="border-color: var(--border); color: var(--text);"
					aria-label={`Decrease ${label.toLowerCase()} by ${stepQuantity.toLocaleString()}`}
				>
					<Minus size={16} />
				</button>
				<input
					type="number"
					inputmode="numeric"
					min={minQuantity}
					max={maxQuantity ?? undefined}
					step={stepQuantity}
					bind:value={typedValue}
					onblur={commitTyped}
					onkeydown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
					class={compact
						? 'min-w-0 flex-1 bg-transparent px-3 py-2 text-center text-sm font-semibold outline-none'
						: 'min-w-0 flex-1 bg-transparent px-3 py-2.5 text-center text-base font-semibold outline-none'}
					style="color: var(--text);"
					aria-label={label}
				/>
				<button
					type="button"
					onclick={() => adjust(1)}
					disabled={maxQuantity !== null && value >= maxQuantity}
					class="flex min-w-11 items-center justify-center border-l px-3 disabled:opacity-40"
					style="border-color: var(--border); color: var(--text);"
					aria-label={`Increase ${label.toLowerCase()} by ${stepQuantity.toLocaleString()}`}
				>
					<Plus size={16} />
				</button>
			</span>
		</label>
	</div>
	<p class="text-[11px]" style="color: var(--text-dim);">
		Type any amount. It will use the nearest valid {stepQuantity.toLocaleString()} increment{maxQuantity !==
		null
			? `, up to ${maxQuantity.toLocaleString()}`
			: ''}.
	</p>
</div>
