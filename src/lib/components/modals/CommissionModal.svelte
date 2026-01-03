<script>
  import { fly, fade } from 'svelte/transition';

  let  { newCommissionRate = $bindable(), commissionError, updateCommissionRate,isUpdatingRate, onclick } = $props()

</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div
			class="w-full max-w-md rounded-lg bg-white p-6 shadow"
			in:fly={{ y: 200, duration: 300 }}
			out:fade={{ duration: 300 }}
		>
			<h2 class="mb-4 text-xl font-bold text-gray-900">Adjust Commission Rate</h2>

			<div class="mb-4">
				<label for="commission-rate" class="mb-2 block text-sm font-medium text-gray-700">
					Commission Rate (%)
				</label>
				<input
					id="commission-rate"
					type="number"
					min="0"
					max="100"
					step="0.1"
					bind:value={newCommissionRate}
					class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
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
					class="flex-1 cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-all hover:scale-95 hover:bg-gray-50 disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={updateCommissionRate}
					disabled={isUpdatingRate}
					class="flex-1 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-white transition-all hover:scale-95 hover:bg-blue-700 disabled:opacity-50"
				>
					{isUpdatingRate ? 'Updating...' : 'Update Rate'}
				</button>
			</div>
		</div>
	</div>