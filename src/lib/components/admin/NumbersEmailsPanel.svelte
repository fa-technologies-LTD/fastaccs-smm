<script lang="ts">
	import { showError, showSuccess } from '$lib/stores/toasts';
	import { askDecision } from '$lib/stores/decision.svelte';
	import type { NumbersCampaignState } from '$lib/services/numbers-campaign';

	/**
	 * Numbers customer emails, in Growth with the other emails: the three-email discovery sequence
	 * and the no-code recovery email. Uses the Numbers system's own actions, unchanged.
	 */
	let { campaign }: { campaign: NumbersCampaignState | null } = $props();
	let busy = $state(false);

	async function post(payload: Record<string, unknown>) {
		const res = await fetch('/api/admin/numbers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		return res.json();
	}

	async function run(
		action: Record<string, unknown>,
		done: (out: Record<string, unknown>) => string
	) {
		busy = true;
		try {
			const out = await post(action);
			if (!out.success) throw new Error(out.error || 'Not done');
			showSuccess(`${done(out)} Reloading…`);
			setTimeout(() => location.reload(), 1000);
		} catch (error) {
			showError(error instanceof Error ? error.message : 'Not done');
			busy = false;
		}
	}

	async function launch() {
		const confirmed = await askDecision({
			title: 'Launch the Numbers announcement?',
			message:
				'This emails and push-notifies every customer (first of 3 emails), puts the announcement banner up, and retires the old manual phone account types from the store.',
			confirmLabel: 'Launch',
			cancelLabel: 'Not now',
			tone: 'danger'
		});
		if (confirmed)
			await run(
				{ action: 'launch-campaign' },
				(out) =>
					`Launched: ${out.manualTiersRetired} manual types retired, ${out.emailSent} emails sent, ${out.pushed} push sent.`
			);
	}
	async function stop() {
		const confirmed = await askDecision({
			title: 'Stop the Numbers emails?',
			message: 'The automated emails stop and the banner comes down. Retired types stay retired.',
			confirmLabel: 'Stop emails',
			cancelLabel: 'Keep running'
		});
		if (confirmed) await run({ action: 'stop-campaign' }, () => 'Numbers emails stopped.');
	}
	async function toggleRecovery() {
		const enabling = !campaign?.recoveryEnabled;
		if (enabling) {
			const confirmed = await askDecision({
				title: 'Turn on recovery emails?',
				message:
					'Each day, buyers whose number attempt is over 24 hours old and never got a code receive one retry email. A later successful attempt cancels it.',
				confirmLabel: 'Turn on',
				cancelLabel: 'Not now'
			});
			if (!confirmed) return;
		}
		await run(
			{ action: 'set-recovery-campaign', enabled: enabling },
			() => `Recovery emails ${enabling ? 'on' : 'off'}.`
		);
	}
</script>

<section
	class="rounded-xl p-5"
	style="border: 1px solid var(--border); background: var(--surface);"
	aria-label="Numbers customer emails"
>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="font-semibold" style="color: var(--text);">Numbers customer emails</h2>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				{#if campaign?.enabled && campaign?.launchedAt}
					Running: up to 3 paced discovery emails for opted-in customers. They stop as soon as
					someone buys a number.
				{:else}
					Starts the three-email discovery sequence, announces Numbers in the app, and retires the
					old manual phone account types.
				{/if}
			</p>
		</div>
		{#if campaign?.enabled}
			<button
				onclick={stop}
				disabled={busy}
				class="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
				style="border: 1px solid var(--border); color: var(--text);"
				>{busy ? 'Working…' : 'Stop emails'}</button
			>
		{:else}
			<button
				onclick={launch}
				disabled={busy}
				class="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
				style="background: #0ea5e9; color: #ffffff;"
				>{busy ? 'Launching…' : 'Launch announcement'}</button
			>
		{/if}
	</div>
	<div
		class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg p-3"
		style="border: 1px solid var(--border); background: var(--bg);"
	>
		<div>
			<p class="text-sm font-semibold" style="color: var(--text);">No-code recovery emails</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted);">
				One retry email per number attempt that is 24+ hours old and never got a code.
			</p>
		</div>
		<button
			onclick={toggleRecovery}
			disabled={busy}
			class="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
			style={campaign?.recoveryEnabled
				? 'border: 1px solid var(--border); color: var(--text);'
				: 'background: #0ea5e9; color: #ffffff;'}
			>{busy ? 'Working…' : campaign?.recoveryEnabled ? 'Turn off' : 'Turn on'}</button
		>
	</div>
</section>
