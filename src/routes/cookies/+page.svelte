<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
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
			<p style="color: var(--text-muted);">Effective date: June 12, 2026</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					We use cookies and similar storage tools to keep FastAccs secure and functional. Optional
					analytics cookies help us improve speed, reliability, and user experience.
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
						<strong style="color: var(--text);">Analytics cookies:</strong> optional metrics used to
						improve product performance.
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
					By continuing to browse FastAccs, you agree to our use of cookies as described in this
					policy. If you'd rather not be tracked, you can block or delete cookies at any time
					through your browser's settings — necessary cookies will still be used to keep you logged
					in and your cart working.
				</p>
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
