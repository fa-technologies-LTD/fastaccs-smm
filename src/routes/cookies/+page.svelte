<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

	onMount(() => {
		if (hasAnalyticsConsent()) {
			window.gtag?.('event', 'page_view', { page_path: '/cookies' });
		}
	});

	function openPrivacySettings() {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(new CustomEvent('fa:privacy-open'));
	}
</script>

<svelte:head>
	<title>Cookie Policy - FastAccs</title>
	<meta name="description" content="How FastAccs uses cookies and analytics preferences." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1 class="mb-3 text-4xl font-bold md:text-5xl" style="color: var(--text); font-family: var(--font-head);">
				Cookie Policy
			</h1>
			<p style="color: var(--text-muted);">
				Effective date: April 8, 2026
			</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					We use cookies and similar storage tools to keep FastAccs secure and functional. Optional analytics
					cookies help us improve speed, reliability, and user experience.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Cookie Categories</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li><strong style="color: var(--text);">Necessary cookies:</strong> required for login, sessions, cart, and security.</li>
					<li><strong style="color: var(--text);">Analytics cookies:</strong> optional metrics used to improve product performance.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Your Choice</h2>
				<p>
					You can choose "Necessary Only" or allow analytics. You can update this choice anytime using
					Privacy Settings.
				</p>
				<button
					type="button"
					onclick={openPrivacySettings}
					class="mt-3 rounded-full px-4 py-2 text-sm font-semibold"
					style="background: var(--btn-primary-gradient); color: #04140C;"
				>
					Open Privacy Settings
				</button>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">More Information</h2>
				<p>
					For broader data handling practices, see our
					<a href="/privacy" class="hover:underline" style="color: var(--link);">Privacy Notice</a>.
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
