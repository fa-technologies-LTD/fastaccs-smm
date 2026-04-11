<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

	const policyLinks = [
		{
			title: 'Terms of Use',
			href: '/terms',
			description: 'General rules for using FastAccs and placing orders.'
		},
		{
			title: 'Refund Policy',
			href: '/refund-policy',
			description: 'How issue review, replacement, and refund decisions are handled.'
		},
		{
			title: 'Privacy Notice',
			href: '/privacy',
			description: 'How we handle personal information and customer rights.'
		},
		{
			title: 'Acceptable Use Rules',
			href: '/acceptable-use',
			description: 'Conduct standards and prohibited misuse scenarios.'
		},
		{
			title: 'Cookie Policy',
			href: '/cookies',
			description: 'Cookie categories and your analytics preferences.'
		},
		{
			title: 'Affiliate Terms',
			href: '/affiliate-terms',
			description: 'Affiliate program rules and commission safeguards.'
		}
	];

	onMount(() => {
		if (hasAnalyticsConsent()) {
			window.gtag?.('event', 'page_view', { page_path: '/smm/policies' });
		}
	});
</script>

<svelte:head>
	<title>Policy Center - FastAccs</title>
	<meta name="description" content="Policy center for FastAccs terms, refunds, privacy, and usage rules." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-5xl px-6 py-16 md:py-24">
		<div class="mb-12 border-b pb-8" style="border-color: var(--border);">
			<h1
				class="mb-3 text-4xl font-bold md:text-5xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Policy Center
			</h1>
			<p style="color: var(--text-muted);" class="max-w-3xl">
				This page helps you find all FastAccs legal and policy documents in one place. By using
				the site and making purchases, you agree to the policies linked below.
			</p>
		</div>

		<div class="grid gap-5 md:grid-cols-2">
			{#each policyLinks as policy}
				<a
					href={policy.href}
					class="rounded-xl p-5 transition-all hover:shadow-lg"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<h2 class="mb-2 text-lg font-semibold" style="color: var(--text); font-family: var(--font-head);">
						{policy.title}
					</h2>
					<p class="text-sm" style="color: var(--text-muted);">{policy.description}</p>
				</a>
			{/each}
		</div>
	</div>
</main>

<Footer />
