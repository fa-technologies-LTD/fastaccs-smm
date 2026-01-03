<script>
	import { fly, fade } from 'svelte/transition';
	import { X } from '@lucide/svelte';
	import { formatPrice } from '$lib/helpers/utils';

	let {
		isProcessingPayout,
		recordPayout,
		payoutError,
		payoutAmount = $bindable(),
		payoutMethod = $bindable(),
		payoutReference = $bindable(),
		payoutDate = $bindable(),
		payoutNotes = $bindable(),
		unpaidCommission,
    onclick
	} = $props();
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
	<div
		class="w-full max-w-md rounded-lg bg-white p-6"
		in:fly={{ y: 200, duration: 300 }}
		out:fade={{ duration: 300 }}
	>
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-lg font-semibold text-gray-900">Record Commission Payout</h3>
			<button
				{onclick}
				class="text-gray-400 hover:text-gray-600"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="mb-4 rounded-lg bg-blue-50 p-4">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-gray-700">Unpaid Balance:</span>
				<span class="text-lg font-bold text-blue-600">{formatPrice(unpaidCommission)}</span>
			</div>
		</div>

		<div class="mb-4">
			<label for="amount" class="mb-2 block text-sm font-medium text-gray-700">Amount</label>
			<input
				type="number"
				step="0.01"
				min="0.01"
				max={unpaidCommission}
				bind:value={payoutAmount}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500"
				placeholder="Enter payout amount"
			/>
			<p class="mt-1 text-xs text-gray-500">Maximum: {formatPrice(unpaidCommission)}</p>
		</div>

		<div class="mb-4">
			<label for="payment method" class="mb-2 block text-sm font-medium text-gray-700"
				>Payment Method</label
			>
			<select
				bind:value={payoutMethod}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500"
			>
				<option value="Bank Transfer">Bank Transfer</option>
				<option value="PayPal">PayPal</option>
				<option value="Payoneer">Payoneer</option>
				<option value="Crypto">Crypto</option>
				<option value="Check">Check</option>
				<option value="Other">Other</option>
			</select>
		</div>

		<div class="mb-4">
			<label for="payment reference" class="mb-2 block text-sm font-medium text-gray-700">
				Payment Reference (Optional)
			</label>
			<input
				type="text"
				bind:value={payoutReference}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500"
				placeholder="Transaction ID, check number, etc."
			/>
		</div>

		<div class="mb-4">
			<label for="payment date" class="mb-2 block text-sm font-medium text-gray-700"
				>Payment Date</label
			>
			<input
				type="date"
				bind:value={payoutDate}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500"
			/>
		</div>

		<div class="mb-4">
			<label for="notes" class="mb-2 block text-sm font-medium text-gray-700"
				>Notes (Optional)</label
			>
			<textarea
				bind:value={payoutNotes}
				rows="3"
				class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500"
				placeholder="Additional notes about this payout..."
			></textarea>
		</div>

		{#if payoutError}
			<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
				{payoutError}
			</div>
		{/if}

		<div class="flex gap-3">
			<button
				{onclick}
				disabled={isProcessingPayout}
				class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
			>
				Cancel
			</button>
			<button
				onclick={recordPayout}
				disabled={isProcessingPayout}
				class="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white transition-all hover:bg-green-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
			>
				{isProcessingPayout ? 'Recording...' : 'Record Payout'}
			</button>
		</div>
	</div>
</div>
