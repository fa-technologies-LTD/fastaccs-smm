<script lang="ts">
	import { onMount } from 'svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import {
		readCookieConsent,
		saveCookieConsent,
		type CookieConsentLevel
	} from '$lib/helpers/privacyConsent';

	let choice = $state<CookieConsentLevel | null>(null);
	onMount(() => (choice = readCookieConsent()));

	function choose(level: CookieConsentLevel) {
		saveCookieConsent(level);
		choice = level;
	}

	const choiceLabel = $derived(
		choice === 'marketing'
			? 'All cookies accepted'
			: choice === 'necessary'
				? 'Necessary cookies only'
				: choice === 'analytics'
					? 'Necessary and analytics cookies'
					: 'No choice saved yet'
	);
</script>

<svelte:head>
	<title>Cookie Policy - FastAccs</title>
	<meta name="description" content="How FastAccs uses cookies and analytics preferences." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1
				class="mb-3 text-4xl font-bold md:text-5xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Cookie Policy
			</h1>
			<p style="color: var(--text-muted);">Effective date: October 10, 2026</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					We use cookies and similar storage tools to keep FastAccs secure and functional. With your
					permission we also use optional cookies to understand how visitors find and use the site,
					and which of our ads bring customers.
				</p>
			</section>

			<section>
				<h2
					class="mb-2 text-2xl font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Cookie Categories
				</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>
						<strong style="color: var(--text);">Necessary cookies:</strong> required for login, sessions,
						cart, and security.
					</li>
					<li>
						<strong style="color: var(--text);">Analytics cookies (optional):</strong> page and visit
						metrics, and where a visitor first came from (for example a search engine or one of our links),
						used to improve the site.
					</li>
					<li>
						<strong style="color: var(--text);">Advertising measurement cookies (optional):</strong>
						when you arrive from one of our ads, we remember that ad's click reference for 7 days. If
						you then buy, we tell that ad network a sale happened (the click reference and the sale value
						only, never your name, email or order details) so it can show our ads to the right people.
					</li>
				</ul>
			</section>

			<section>
				<h2
					class="mb-2 text-2xl font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Your Choice
				</h2>
				<p>
					Optional cookies are only used after you choose <strong style="color: var(--text);"
						>Accept</strong
					>. Choosing <strong style="color: var(--text);">Necessary only</strong> keeps just the cookies
					needed for login, cart and security. You can change your choice at any time here.
				</p>
				<div
					class="mt-4 flex flex-wrap items-center gap-3 rounded-xl p-4"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<span class="text-sm" style="color: var(--text);">Your choice: {choiceLabel}</span>
					<span class="flex-1"></span>
					<button
						type="button"
						onclick={() => choose('necessary')}
						class="rounded-full px-4 py-2 text-sm font-semibold"
						style="border: 1px solid var(--border); color: var(--text);"
					>
						Necessary only
					</button>
					<button
						type="button"
						onclick={() => choose('marketing')}
						class="rounded-full px-4 py-2 text-sm font-semibold"
						style="background: var(--btn-primary-gradient); color: #04140C;"
					>
						Accept all
					</button>
				</div>
			</section>

			<section>
				<h2
					class="mb-2 text-2xl font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					More Information
				</h2>
				<p>
					For broader data handling practices, see our
					<a href="/privacy" class="hover:underline" style="color: var(--link);">Privacy Notice</a>.
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
