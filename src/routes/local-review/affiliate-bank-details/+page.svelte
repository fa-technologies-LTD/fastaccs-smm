<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BankDetails from '../../affiliate/bank-details/+page.svelte';
	const example = { submission: null, submissionError: null } as ComponentProps<
		typeof BankDetails
	>['data'];
	let submitted = $state(false);
	function previewSubmit(event: SubmitEvent) {
		event.preventDefault();
		event.stopPropagation();
		submitted = true;
	}
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>
<aside class="border-b p-4 text-sm" style="border-color: var(--border); color: var(--text);">
	Local bank-form preview. Use fictional details only. Submission is intercepted; no bank details or
	payout will be saved.
	{#if submitted}<p role="status" class="mt-2">Valid format — preview only, nothing saved.</p>{/if}
</aside>
<div onsubmitcapture={previewSubmit}><BankDetails data={example} /></div>
