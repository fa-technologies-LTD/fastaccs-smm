<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

	onMount(() => {
		if (hasAnalyticsConsent()) {
			window.gtag?.('event', 'page_view', { page_path: '/acceptable-use' });
		}
	});
</script>

<svelte:head>
	<title>Acceptable Use Rules - FastAccs</title>
	<meta name="description" content="Acceptable use rules for FastAccs services." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1 class="mb-3 text-4xl font-bold md:text-5xl" style="color: var(--text); font-family: var(--font-head);">
				Acceptable Use Rules
			</h1>
			<p style="color: var(--text-muted);">
				Effective date: April 8, 2026
			</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					We appreciate every customer and want usage to remain safe and responsible. These rules apply to all
					use of FastAccs products and services.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Not Allowed</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>Fraud, impersonation, identity theft, or deceptive conduct.</li>
					<li>Harassment, threats, extortion, blackmail, or abusive targeting.</li>
					<li>Spam, coordinated manipulation, phishing, malware distribution, or scams.</li>
					<li>Use connected to unlawful activity or rights violations.</li>
					<li>Any use that intentionally bypasses platform rules or applicable law.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Customer Responsibility</h2>
				<p>
					You are responsible for your post-delivery usage decisions, account activity, and compliance with
					platform and legal requirements in your jurisdiction.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Enforcement</h2>
				<p>
					Where misuse is suspected, we may pause support, decline service, limit account access, or report
					activity as required by law.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Related Policies</h2>
				<p>
					These rules work together with our
					<a href="/terms" class="hover:underline" style="color: var(--link);">Terms</a>,
					<a href="/refund-policy" class="hover:underline" style="color: var(--link);">Refund Policy</a>, and
					<a href="/privacy" class="hover:underline" style="color: var(--link);">Privacy Notice</a>.
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
