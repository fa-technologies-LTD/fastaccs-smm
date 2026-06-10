<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const isEnabled = $derived(form?.enabled ?? data.marketingEmailEnabled);
</script>

<svelte:head>
	<title>Email Preferences | Fast Accounts</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12">
	<section
		class="w-full rounded-2xl border p-6 sm:p-8"
		style="border-color: var(--border); background: var(--surface);"
	>
		<p class="mb-2 text-sm font-semibold tracking-wide uppercase" style="color: var(--primary);">
			Fast Accounts
		</p>
		<h1 class="mb-3 text-2xl font-bold" style="color: var(--text);">Email preferences</h1>
		<p class="mb-6 text-sm" style="color: var(--text-muted);">
			Choose whether {data.email || 'this address'} receives optional product updates, useful recommendations,
			and promotions.
		</p>

		{#if form?.message}
			<p
				class="mb-5 rounded-lg border px-4 py-3 text-sm"
				style="border-color: var(--border); color: var(--text); background: var(--bg-elev-1);"
			>
				{form.message}
			</p>
		{/if}

		<p class="mb-6 text-sm" style="color: var(--text-muted);">
			Transactional emails about security, payments, orders, support, affiliate access, and payout
			status will still be sent when needed.
		</p>

		<form method="POST">
			<input type="hidden" name="enabled" value={isEnabled ? 'false' : 'true'} />
			<button
				type="submit"
				class="w-full rounded-full px-5 py-3 text-sm font-semibold"
				style={isEnabled
					? 'border: 1px solid var(--border); color: var(--text); background: var(--bg-elev-1);'
					: 'border: 1px solid rgba(5,212,113,0.35); color: #04140C; background: var(--primary);'}
			>
				{isEnabled ? 'Unsubscribe from optional emails' : 'Enable optional emails'}
			</button>
		</form>
	</section>
</main>
