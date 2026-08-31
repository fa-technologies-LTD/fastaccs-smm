<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { Share2, DollarSign, CheckCircle, Wallet, Users } from '$lib/icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const isLoggedIn = $derived(Boolean(data.user));
	const isActiveAffiliate = $derived(
		Boolean((data.user as { isAffiliateEnabled?: boolean } | null)?.isAffiliateEnabled)
	);
	const payoutMinimum = $derived(`₦${Number(data.payoutMinimum || 5_000).toLocaleString()}`);
</script>

<svelte:head>
	<title>FastAccs Affiliate Program</title>
	<meta
		name="description"
		content="Give friends 5% off their first two eligible FastAccs account orders and earn 5% in withdrawable Cash, up to ₦1,000 per order."
	/>
</svelte:head>

<Navigation />

<main class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<section
		class="mb-6 rounded-[var(--r-lg)] border p-6"
		style="border-color: var(--border-2); background: linear-gradient(180deg, rgba(5,212,113,0.12), rgba(105,109,250,0.08));"
	>
		<p
			class="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
			style="background: rgba(5,212,113,0.16); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
		>
			<Share2 size={14} />
			Affiliate Program
		</p>
		<h1
			class="mb-3 text-2xl font-semibold sm:text-3xl"
			style="color: var(--text); font-family: var(--font-head);"
		>
			Earn real cash with FastAccs referrals
		</h1>
		<p class="max-w-3xl text-sm sm:text-base" style="color: var(--text-muted);">
			Give friends 5% off their first two eligible account orders and earn 5% too—up to ₦1,000 per
			order. Track everything from your dashboard, put earned Cash toward FastAccs purchases, or
			withdraw it when eligible.
		</p>
	</section>

	<section class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div
			class="rounded-[var(--r-md)] border p-4"
			style="border-color: var(--border); background: var(--surface-2);"
		>
			<div class="mb-2 inline-flex items-center gap-2" style="color: var(--primary);">
				<CheckCircle size={16} />
				<span class="text-xs font-semibold uppercase">Unlock</span>
			</div>
			<p class="text-sm" style="color: var(--text-muted);">
				Complete your first successful purchase and your referral code is created automatically.
			</p>
		</div>
		<div
			class="rounded-[var(--r-md)] border p-4"
			style="border-color: var(--border); background: var(--surface-2);"
		>
			<div class="mb-2 inline-flex items-center gap-2" style="color: var(--link);">
				<Users size={16} />
				<span class="text-xs font-semibold uppercase">Share</span>
			</div>
			<p class="text-sm" style="color: var(--text-muted);">
				Share your referral link or code so buyers can save at checkout.
			</p>
		</div>
		<div
			class="rounded-[var(--r-md)] border p-4"
			style="border-color: var(--border); background: var(--surface-2);"
		>
			<div class="mb-2 inline-flex items-center gap-2" style="color: var(--primary-strong);">
				<Wallet size={16} />
				<span class="text-xs font-semibold uppercase">Earn</span>
			</div>
			<p class="text-sm" style="color: var(--text-muted);">
				Earn on each friend's first two retained eligible account orders and track it in your
				dashboard.
			</p>
		</div>
	</section>

	<section
		class="rounded-[var(--r-lg)] border p-6"
		style="border-color: var(--border); background: var(--surface-2);"
	>
		<h2
			class="mb-4 text-lg font-semibold"
			style="color: var(--text); font-family: var(--font-head);"
		>
			Program basics
		</h2>
		<div class="space-y-3 text-sm" style="color: var(--text-muted);">
			<p>
				<DollarSign class="mr-1 inline h-4 w-4" style="color: var(--primary);" />
				Friends save 5% on their first two eligible account orders, up to ₦1,000 per order.
			</p>
			<p>
				You earn 5% on those same two orders, up to ₦1,000 per order, after refunds and the return
				window are accounted for.
			</p>
			<p>Numbers and Boosting are not part of this affiliate offer.</p>
			<p>
				No stacking: affiliate referral pricing and separate promo codes cannot be combined on the
				same checkout.
			</p>
			<p>
				Payout requests start at {payoutMinimum}, require approved bank details and a
				{data.payoutMinAccountAgeDays}-day-old account, and are processed on Saturdays.
			</p>
			<p>
				Affiliate Cash is real Naira. Once available, it can be put toward FastAccs purchases or
				withdrawn. The program is currently available only to customers in Nigeria.
			</p>
		</div>

		<div class="mt-6 flex flex-wrap gap-3">
			{#if isLoggedIn}
				<a
					href="/dashboard?tab=affiliate"
					class="rounded-full px-5 py-2 text-sm font-semibold"
					style={isActiveAffiliate
						? 'background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C;'
						: 'background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text-muted);'}
				>
					{isActiveAffiliate ? 'Open Affiliate Dashboard' : 'View Affiliate Access'}
				</a>
			{/if}
			{#if isActiveAffiliate}
				<a
					href="/affiliate/bank-details"
					class="rounded-full px-5 py-2 text-sm font-semibold"
					style="background: rgba(105,109,250,0.16); border: 1px solid rgba(105,109,250,0.35); color: var(--text);"
				>
					Add bank details
				</a>
			{/if}
			<a
				href="/platforms"
				class="rounded-full px-5 py-2 text-sm font-semibold"
				style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
			>
				Browse accounts
			</a>
		</div>
	</section>
</main>

<Footer />
