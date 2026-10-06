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
	let softMessage = $state('');

	$effect(() => {
		if (value === lastExternalValue) return;
		lastExternalValue = value;
		typedValue = String(value);
		softMessage = '';
	});

	function commit(rawValue: number): void {
		const next = normalizeBoostingQuantity(rawValue, minQuantity, stepQuantity, maxQuantity);
		lastExternalValue = next;
		typedValue = String(next);
		softMessage = '';
		onchange(next);
	}

	function commitTyped(): void {
		const raw = String(typedValue).replaceAll(',', '').trim();
		const parsed = Number(raw);
		const belowMinimum = raw !== '' && Number.isFinite(parsed) && parsed < minQuantity;
		commit(parsed);
		if (belowMinimum) {
			softMessage = `Minimum is ${minQuantity.toLocaleString()}. We adjusted it for you.`;
		}
	}

	function updateTyped(raw: string): void {
		typedValue = raw;
		const parsed = Number(raw.replaceAll(',', '').trim());
		softMessage =
			raw.trim() !== '' && Number.isFinite(parsed) && parsed < minQuantity
				? `Minimum is ${minQuantity.toLocaleString()}.`
				: '';
	}

	function adjust(direction: -1 | 1): void {
		commit(value + direction * stepQuantity);
	}
</script>

<div class={`boost-quantity ${compact ? 'space-y-2' : 'space-y-3'}`}>
	{#if presets.length}
		<div
			class="preset-scroll -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
			aria-label={`${label} quick choices`}
		>
			{#each presets as preset (preset)}
				<button
					type="button"
					onclick={() => commit(preset)}
					class="min-h-10 shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-semibold transition-colors"
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
			<span class="mb-1 flex items-center justify-between gap-3">
				<span class="block text-xs font-semibold" style="color: var(--text);">{label}</span>
				<span class="text-[10px]" style="color: var(--text-dim);"
					>+/− {stepQuantity.toLocaleString()}</span
				>
			</span>
			<span
				class="flex min-h-12 items-stretch overflow-hidden rounded-xl border"
				style="border-color: var(--border); background: var(--bg);"
			>
				<button
					type="button"
					onclick={() => adjust(-1)}
					disabled={value <= minQuantity}
					class="flex min-w-12 items-center justify-center border-r px-3 transition-colors disabled:opacity-40"
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
					value={typedValue}
					oninput={(event) => updateTyped(event.currentTarget.value)}
					onfocus={(event) => event.currentTarget.select()}
					onblur={commitTyped}
					onkeydown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
					class="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-center text-base font-bold outline-none sm:px-3"
					style="color: var(--text);"
					aria-label={label}
				/>
				<button
					type="button"
					onclick={() => adjust(1)}
					disabled={maxQuantity !== null && value >= maxQuantity}
					class="flex min-w-12 items-center justify-center border-l px-3 transition-colors disabled:opacity-40"
					style="border-color: var(--border); color: var(--text);"
					aria-label={`Increase ${label.toLowerCase()} by ${stepQuantity.toLocaleString()}`}
				>
					<Plus size={16} />
				</button>
			</span>
		</label>
	</div>
	{#if softMessage}
		<p aria-live="polite" class={compact ? 'text-[10px]' : 'text-[11px]'} style="color: #fbbf24;">
			{softMessage}
		</p>
	{/if}
	<p class={compact ? 'text-[10px]' : 'text-[11px]'} style="color: var(--text-dim);">
		Enter a quantity or use +/−.
	</p>
</div>

<style>
	.preset-scroll {
		scrollbar-width: none;
	}

	.preset-scroll::-webkit-scrollbar {
		display: none;
	}

	@media (hover: hover) {
		.boost-quantity button:not(:disabled):hover {
			border-color: var(--primary);
		}
	}
</style>
