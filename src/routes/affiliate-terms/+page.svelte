<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>Affiliate Terms - FastAccs</title>
	<meta
		name="description"
		content="Terms for FastAccs affiliate participation and Affiliate Cash earnings."
	/>
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1
				class="mb-3 text-4xl font-bold md:text-5xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Affiliate Terms
			</h1>
			<p style="color: var(--text-muted);">Effective date: April 8, 2026</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					These terms apply to affiliate participation whenever affiliate access is enabled for your
					account.
				</p>
			</section>

			<section>
				<h2
					class="mb-2 text-2xl font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Affiliate Cash Earnings
				</h2>
				<p>
					For regular affiliates, friends receive 5% off and you earn 5% on their first two retained
					eligible account orders, up to ₦1,000 per order. Numbers and Boosting are excluded.
					Earnings remain pending through the return window and may be adjusted for refunds. Payout
					requests start at the current minimum shown in your dashboard and are processed on
					Saturdays after eligibility and bank-detail checks.
				</p>
			</section>

			<section>
				<h2
					class="mb-2 text-2xl font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Allowed Promotion
				</h2>
				<p>
					You may promote through direct referrals, social content, and communities, provided
					promotion is truthful and does not misrepresent FastAccs.
				</p>
			</section>

			<section>
				<h2
					class="mb-2 text-2xl font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Prohibited Promotion
				</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>Impersonation, misleading claims, or fake guarantees.</li>
					<li>Spam messaging, bot promotion, or manipulative traffic schemes.</li>
					<li>Self-referrals, policy abuse patterns, or payout abuse patterns.</li>
				</ul>
			</section>

			<section>
				<h2
					class="mb-2 text-2xl font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Enforcement
				</h2>
				<p>
					We may suspend payouts, reverse affected Affiliate Cash, or restrict affiliate access for
					policy violations, suspicious activity signals, or unresolved verification issues.
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
