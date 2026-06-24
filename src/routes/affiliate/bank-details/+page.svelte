<script lang="ts">
	import { goto } from '$app/navigation';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { ArrowLeft } from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let bankName = $state(data.submission?.bankName || '');
	let accountNumber = $state(data.submission?.accountNumber || '');
	let accountName = $state(data.submission?.accountName || '');
	let phone = $state(data.submission?.phone || '');
	let feedback = $state(data.submission?.feedback || '');
	let status = $state(data.submission?.status || null);
	let rejectionReason = $state(data.submission?.rejectionReason || null);
	let submitting = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!bankName.trim() || !accountNumber.trim() || !accountName.trim() || !phone.trim()) {
			showError('Missing details', 'Bank name, account number, account name, and phone are required.');
			return;
		}

		submitting = true;
		try {
			const response = await fetch('/api/affiliate/bank-details', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bankName: bankName.trim(),
					accountNumber: accountNumber.trim(),
					accountName: accountName.trim(),
					phone: phone.trim(),
					feedback: feedback.trim()
				})
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				showError('Submission failed', result.error || 'Please try again.');
				return;
			}

			status = 'pending';
			rejectionReason = null;
			showSuccess('Submitted', result.message || 'Your bank details have been submitted for review.');
		} catch (error) {
			console.error('Failed to submit bank details:', error);
			showError('Submission failed', 'Unable to submit right now. Please try again.');
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Add Bank Details | FastAccs Affiliate</title>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background-color: var(--bg);">
	<section class="mx-auto max-w-xl px-4 py-8 sm:py-12">
		<button
			type="button"
			onclick={() => goto('/dashboard?tab=affiliate')}
			class="mb-6 flex items-center gap-1.5 text-sm font-medium"
			style="color: var(--text-muted);"
		>
			<ArrowLeft size={16} />
			Back to affiliate dashboard
		</button>

		<h1 class="mb-2 text-2xl font-bold sm:text-3xl" style="color: var(--text); font-family: var(--font-head);">
			Add Bank Details
		</h1>
		<p class="mb-6 text-sm" style="color: var(--text-muted);">
			We use these details to send your affiliate Cash payouts. This is reviewed by our team
			before it's used.
		</p>

		{#if status === 'pending'}
			<div
				class="mb-6 rounded-[var(--r-md)] border p-4 text-sm"
				style="border-color: rgba(234,179,8,0.35); background: rgba(234,179,8,0.08); color: var(--text);"
			>
				Your submission is under review. We'll let you know once it's approved.
			</div>
		{:else if status === 'approved'}
			<div
				class="mb-6 rounded-[var(--r-md)] border p-4 text-sm"
				style="border-color: rgba(5,212,113,0.35); background: rgba(5,212,113,0.08); color: var(--text);"
			>
				Your bank details are approved. You can update them anytime — updates go back through
				review.
			</div>
		{:else if status === 'rejected'}
			<div
				class="mb-6 rounded-[var(--r-md)] border p-4 text-sm"
				style="border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); color: var(--text);"
			>
				Your last submission was rejected{rejectionReason ? `: ${rejectionReason}` : '.'} Please
				update the details below and resubmit.
			</div>
		{/if}

		<form
			onsubmit={handleSubmit}
			class="space-y-4 rounded-[var(--r-md)] border p-5"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<div>
				<label for="bankName" class="mb-1 block text-xs font-medium" style="color: var(--text);">
					Bank name
				</label>
				<input
					id="bankName"
					type="text"
					bind:value={bankName}
					required
					placeholder="e.g. GTBank"
					class="block w-full rounded-md px-3 py-2 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				/>
			</div>

			<div>
				<label for="accountNumber" class="mb-1 block text-xs font-medium" style="color: var(--text);">
					Account number
				</label>
				<input
					id="accountNumber"
					type="text"
					inputmode="numeric"
					bind:value={accountNumber}
					required
					placeholder="0123456789"
					class="block w-full rounded-md px-3 py-2 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				/>
			</div>

			<div>
				<label for="accountName" class="mb-1 block text-xs font-medium" style="color: var(--text);">
					Account name
				</label>
				<input
					id="accountName"
					type="text"
					bind:value={accountName}
					required
					placeholder="Name on the account"
					class="block w-full rounded-md px-3 py-2 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				/>
			</div>

			<div>
				<label for="phone" class="mb-1 block text-xs font-medium" style="color: var(--text);">
					Phone number
				</label>
				<input
					id="phone"
					type="tel"
					bind:value={phone}
					required
					placeholder="e.g. 08012345678"
					class="block w-full rounded-md px-3 py-2 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				/>
			</div>

			<div>
				<label for="feedback" class="mb-1 block text-xs font-medium" style="color: var(--text);">
					How has your experience with FastAccs been so far? (optional)
				</label>
				<textarea
					id="feedback"
					bind:value={feedback}
					rows="3"
					placeholder="Anything you'd like us to know..."
					class="block w-full rounded-md px-3 py-2 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				></textarea>
			</div>

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
				style="background: var(--btn-primary-gradient); color: #04140C;"
			>
				{submitting ? 'Submitting...' : status ? 'Update & resubmit' : 'Submit for review'}
			</button>
		</form>
	</section>
</main>

<Footer />
