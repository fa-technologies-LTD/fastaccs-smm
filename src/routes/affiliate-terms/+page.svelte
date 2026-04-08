<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

	onMount(() => {
		if (hasAnalyticsConsent()) {
			window.gtag?.('event', 'page_view', { page_path: '/affiliate-terms' });
		}
	});
</script>

<svelte:head>
	<title>Affiliate Terms - FastAccs</title>
	<meta name="description" content="Terms for FastAccs affiliate participation and commissions." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1 class="mb-3 text-4xl font-bold md:text-5xl" style="color: var(--text); font-family: var(--font-head);">
				Affiliate Terms
			</h1>
			<p style="color: var(--text-muted);">
				Effective date: April 8, 2026
			</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					These terms apply to affiliate participation whenever affiliate access is enabled for your account.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Commissions</h2>
				<p>
					Commission rates, qualification rules, and payout timing are shown in your affiliate dashboard and may
					be updated from time to time.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Allowed Promotion</h2>
				<p>
					You may promote through direct referrals, social content, and communities, provided promotion is truthful
					and does not misrepresent FastAccs.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Prohibited Promotion</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>Impersonation, misleading claims, or fake guarantees.</li>
					<li>Spam messaging, bot promotion, or manipulative traffic schemes.</li>
					<li>Self-referrals, fraudulent orders, or payout abuse patterns.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Enforcement</h2>
				<p>
					We may suspend payouts, reverse commissions, or terminate affiliate access for policy violations,
					fraud signals, or unresolved verification issues.
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
