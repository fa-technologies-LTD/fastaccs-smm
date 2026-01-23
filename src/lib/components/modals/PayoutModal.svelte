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

<div
	class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
	style="background: rgba(0, 0, 0, 0.5);"
>
	<div
		class="w-full max-w-md rounded-lg p-6"
		style="background: var(--bg-elev-1);"
		in:fly={{ y: 200, duration: 300 }}
		out:fade={{ duration: 300 }}
	>
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-lg font-semibold" style="color: var(--text);">Record Commission Payout</h3>
			<button {onclick} style="color: var(--text-dim);">
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="mb-4 rounded-lg p-4" style="background: var(--surface);">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium" style="color: var(--text);">Unpaid Balance:</span>
				<span class="text-lg font-bold text-blue-600">{formatPrice(unpaidCommission)}</span>
			</div>
		</div>

		<div class="mb-4">
			<label for="amount" class="mb-2 block text-sm font-medium" style="color: var(--text);"
				>Amount</label
			>
			<input
				type="number"
				step="0.01"
				min="0.01"
				max={unpaidCommission}
				bind:value={payoutAmount}
				class="w-full rounded-lg px-4 py-2"
				style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				placeholder="Enter payout amount"
			/>
			<p class="mt-1 text-xs text-gray-500">Maximum: {formatPrice(unpaidCommission)}</p>
		</div>

		<div class="mb-4">
			<label
				for="payment method"
				class="mb-2 block text-sm font-medium"
				style="color: var(--text);"
			>
				Payment Method
			</label>
			<select
				bind:value={payoutMethod}
				class="w-full rounded-lg px-4 py-2"
				style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
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
			<label
				for="payment reference"
				class="mb-2 block text-sm font-medium"
				style="color: var(--text);"
			>
				Payment Reference (Optional)
			</label>
			<input
				type="text"
				bind:value={payoutReference}
				class="w-full rounded-lg px-4 py-2"
				style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				placeholder="Transaction ID, check number, etc."
			/>
		</div>

		<div class="mb-4">
			<label for="payment date" class="mb-2 block text-sm font-medium" style="color: var(--text);">
				Payment Date
			</label>
			<input
				type="date"
				bind:value={payoutDate}
				class="w-full rounded-lg px-4 py-2"
				style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
			/>
		</div>

		<div class="mb-4">
			<label for="notes" class="mb-2 block text-sm font-medium" style="color: var(--text);">
				Notes (Optional)
			</label>
			<textarea
				bind:value={payoutNotes}
				rows="3"
				class="w-full rounded-lg px-4 py-2"
				style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
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
				class="flex-1 rounded-full px-4 py-2 transition-colors disabled:opacity-50"
				style="border: 1px solid var(--border); color: var(--text); background: transparent;"
			>
				Cancel
			</button>
			<button
				onclick={recordPayout}
				disabled={isProcessingPayout}
				class="flex-1 rounded-full px-4 py-2 text-white transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
				style="background: #16a34a;"
			>
				{isProcessingPayout ? 'Recording...' : 'Record Payout'}
			</button>
		</div>
	</div>
</div>
