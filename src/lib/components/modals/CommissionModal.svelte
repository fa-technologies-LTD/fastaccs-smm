<script>
	import { fly, fade } from 'svelte/transition';

	let {
		newCommissionRate = $bindable(),
		commissionError,
		updateCommissionRate,
		isUpdatingRate,
		onclick
	} = $props();
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4"
	style="background: rgba(0, 0, 0, 0.5);"
>
	<div
		class="w-full max-w-md rounded-lg p-6 shadow"
		style="background: var(--bg-elev-1);"
		in:fly={{ y: 200, duration: 300 }}
		out:fade={{ duration: 300 }}
	>
		<h2 class="mb-4 text-xl font-bold" style="color: var(--text);">Adjust Commission Rate</h2>

		<div class="mb-4">
			<label
				for="commission-rate"
				class="mb-2 block text-sm font-medium"
				style="color: var(--text);"
			>
				Commission Rate (%)
			</label>
			<input
				id="commission-rate"
				type="number"
				min="0"
				max="100"
				step="0.1"
				bind:value={newCommissionRate}
				class="w-full rounded-lg px-4 py-2"
				style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				placeholder="Enter commission rate"
			/>
			<p class="mt-1 text-xs text-gray-500">Must be between 0 and 100</p>
		</div>

		{#if commissionError}
			<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
				{commissionError}
			</div>
		{/if}

		<div class="flex gap-3">
			<button
				{onclick}
				disabled={isUpdatingRate}
				class="flex-1 cursor-pointer rounded-full px-4 py-2 transition-all hover:scale-95 disabled:opacity-50"
				style="border: 1px solid var(--border); color: var(--text); background: transparent;"
			>
				Cancel
			</button>
			<button
				onclick={updateCommissionRate}
				disabled={isUpdatingRate}
				class="flex-1 cursor-pointer rounded-full px-4 py-2 transition-all hover:scale-95 disabled:opacity-50"
				style="background: var(--primary); color: #000;"
			>
				{isUpdatingRate ? 'Updating...' : 'Update Rate'}
			</button>
		</div>
	</div>
</div>
