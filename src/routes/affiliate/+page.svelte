<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { page } from '$app/state';
	import { Share2, DollarSign, CheckCircle, Wallet, Users } from '$lib/icons';

	const resellerFormUrl =
		'https://docs.google.com/forms/d/e/1FAIpQLSfCmv6ADTG51ooEjm9-UBz2GzsxFDqxxSep6Lo_Gb-OMQv8UA/viewform?usp=dialog';
	const isLoggedIn = $derived(Boolean(page.data.user));
	const isActiveAffiliate = $derived(
		Boolean((page.data.user as { isAffiliateEnabled?: boolean } | null)?.isAffiliateEnabled)
	);
</script>

<svelte:head>
	<title>FastAccs Affiliate Program</title>
	<meta
		name="description"
		content="Unlock affiliate access, share your FastAccs code, and earn real withdrawable naira from successful referrals."
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
			Store Credit
		</p>
		<h1
			class="mb-3 text-2xl font-semibold sm:text-3xl"
			style="color: var(--text); font-family: var(--font-head);"
		>
			Earn real cash with FastAccs referrals
		</h1>
		<p class="max-w-3xl text-sm sm:text-base" style="color: var(--text-muted);">
			Earn real cash with FastAccs on every successful referral. Real. Withdrawable. Naira.
			Qualified buyers can unlock affiliate access, activate a unique code, and track earnings from
			their dashboard.
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
				Reach the lifetime completed-spend threshold in your account.
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
				Share your referral link/code so buyers can use it on eligible orders.
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
				Earn real, withdrawable naira on successful referred orders and track it from your dashboard.
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
				Buyer discounts are applied by fixed order-stage rules, up to 10 successful referred purchases
				per buyer.
			</p>
			<p>
				Affiliate earnings are credited as Store Credit from successful referred orders using safe
				SKU-level logic.
			</p>
			<p>
				No stacking: affiliate referral pricing and separate promo codes cannot be combined on the
				same checkout.
			</p>
			<p>
				Store Credit can be withdrawn once payout requirements are met in your affiliate dashboard.
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
					{isActiveAffiliate ? 'Open Affiliate Dashboard' : 'View Affiliate Progress'}
				</a>
			{/if}
			<a
				href={resellerFormUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="rounded-full px-5 py-2 text-sm font-semibold"
				style="background: rgba(105,109,250,0.16); border: 1px solid rgba(105,109,250,0.35); color: var(--text);"
			>
				Confirm status here
			</a>
			<a
				href="/platforms"
				class="rounded-full px-5 py-2 text-sm font-semibold"
				style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
			>
				See available accounts
			</a>
			<a
				href="/services"
				class="rounded-full px-5 py-2 text-sm font-semibold"
				style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text-muted);"
			>
				View boosting services
			</a>
		</div>
	</section>
</main>

<Footer />
