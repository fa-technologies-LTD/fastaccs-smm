<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { MessageCircle } from '$lib/icons';
</script>

<svelte:head>
	<title>Boosting Services | FastAccs</title>
	<meta
		name="description"
		content="FastAccs Boosting Services are launching soon. Order followers, likes, views, and custom engagement packages through WhatsApp."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background-color: var(--bg);">
	<section class="mx-auto flex min-h-[72vh] max-w-4xl items-center px-4 py-12 sm:py-16">
		<div
			class="w-full overflow-hidden rounded-[var(--r-md)] border text-center shadow-xl"
			style="border-color: var(--border); background: linear-gradient(180deg, var(--surface-2), var(--surface));"
		>
			<div class="px-5 py-10 sm:px-10 sm:py-14">
				<p class="text-xs font-semibold tracking-[0.18em] uppercase" style="color: var(--primary);">
					Launching Soon
				</p>
				<h1
					class="mx-auto mt-3 max-w-2xl text-3xl font-bold sm:text-4xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Boosting Services are coming to FastAccs
				</h1>
				<p
					class="mx-auto mt-4 max-w-2xl text-sm leading-6 sm:text-base"
					style="color: var(--text-muted);"
				>
					The self-service dashboard is still under construction. You can already order followers,
					likes, views, and custom engagement packages directly through WhatsApp.
				</p>
				<a
					href="https://wa.link/fast_accounts"
					target="_blank"
					rel="noopener noreferrer"
					class="mt-7 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 active:scale-95"
					style="background: var(--btn-primary-gradient); color: #04140C; box-shadow: var(--glow-primary);"
				>
					<MessageCircle size={18} />
					Order on WhatsApp
				</a>
			</div>
		</div>
	</section>
</main>

<Footer />
