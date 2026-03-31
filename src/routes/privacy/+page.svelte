<script>
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		window.gtag?.('event', 'page_view', { page_path: '/privacy' });
	});
</script>

<svelte:head>
	<title>Privacy — FA Technologies</title>
	<meta name="theme-color" content="#07090C" />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-3xl px-6 py-16 md:py-24">
		<div class="mb-12 border-b pb-8 text-center" style="border-color: var(--border);">
			<a href="https://fastaccs.com" class="mb-6 inline-block">
				<img
					src="/static/fa-mark-white-transparent.png"
					alt="FA Technologies"
					class="h-12 w-auto"
				/>
			</a>
			<h1
				class="mb-3 text-5xl font-bold md:text-4xl"
				style="color: var(--primary); font-family: var(--font-head);"
			>
				Privacy
			</h1>
		</div>

		<div class="space-y-6">
			<p style="color: var(--text-muted);">
				FA Technologies LTD operates FastAccs and FA Logistics. Here's how we handle your
				information.
			</p>

			<div>
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					What we collect
				</h2>
				<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
					<li>Name and email (if you sign in with Google)</li>
					<li>Order and delivery details</li>
					<li>Support messages</li>
					<li>Usage data via Google Analytics</li>
				</ul>
			</div>

			<div>
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					How we use it
				</h2>
				<p style="color: var(--text-muted);">
					We use your data to deliver your orders, provide support, prevent fraud, and improve our
					services.
				</p>
			</div>

			<div>
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Sharing
				</h2>
				<p style="color: var(--text-muted);">
					We don't sell your information. We share only what's needed with delivery partners and
					service providers to fulfill orders.
				</p>
			</div>

			<div>
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Your rights
				</h2>
				<p style="color: var(--text-muted);">
					You can request access, correction, or deletion of your data. Some information must be
					kept for operational and legal reasons.
				</p>
			</div>

			<div>
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Security
				</h2>
				<p style="color: var(--text-muted);">
					We apply reasonable safeguards, though no system is 100% secure.
				</p>
			</div>

			<div>
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Contact
				</h2>
				<p style="color: var(--text-muted);">
					Questions? Email <a
						href="mailto:support@fastaccs.com"
						style="color: var(--primary);"
						class="hover:underline">support@fastaccs.com</a
					>
				</p>
			</div>
		</div>
	</div>
</main>

<Footer />
