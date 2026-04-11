<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

	onMount(() => {
		if (hasAnalyticsConsent()) {
			window.gtag?.('event', 'page_view', { page_path: '/privacy' });
		}
	});
</script>

<svelte:head>
	<title>Privacy Notice - FastAccs</title>
	<meta name="description" content="How FastAccs handles personal data and privacy rights." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1 class="mb-3 text-4xl font-bold md:text-5xl" style="color: var(--text); font-family: var(--font-head);">
				Privacy Notice
			</h1>
			<p style="color: var(--text-muted);">Effective date: April 8, 2026</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					FA Technologies LTD operates FastAccs. This notice explains how we collect, use, share, and protect
					personal information while delivering services and support.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Data We Collect</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>Account profile data such as name, email, and sign-in identifiers.</li>
					<li>Order and delivery records, payment references, and support conversations.</li>
					<li>Security and usage signals used to prevent abuse and improve reliability.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">How We Use Data</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>To process orders and provide customer support.</li>
					<li>To verify payments, reduce fraud, and secure platform operations.</li>
					<li>To maintain service quality and improve product experience.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Legal Basis</h2>
				<p>
					Depending on context, processing may rely on contract performance, legal obligations, legitimate
					interests, or consent where required.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Sharing and Processors</h2>
				<p>
					We do not sell personal information. We may share limited data with trusted service providers needed
					for payment processing, hosting, authentication, communications, analytics (if enabled), and support operations.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Cross-Border Handling</h2>
				<p>
					Where providers operate across jurisdictions, we apply safeguards appropriate to the service context and
					applicable law.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Retention</h2>
				<p>
					We retain data for as long as reasonably necessary for service delivery, support, security, accounting,
					and compliance obligations.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Your Rights</h2>
				<p>
					You may request access, correction, or deletion of eligible personal data, subject to lawful limitations.
					To make a request, contact us using the details below.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Cookies & Analytics</h2>
				<p>
					Necessary cookies are used for core site functions. Optional analytics runs only with your consent.
					See our <a href="/cookies" class="hover:underline" style="color: var(--link);">Cookie Policy</a>.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Contact</h2>
				<p>
					Email:
					<a href="mailto:verystronethan@gmail.com" class="hover:underline" style="color: var(--link);">verystronethan@gmail.com</a>
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
