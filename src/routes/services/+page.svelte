<script>
	import Navigation from '$lib/components/Navigation.svelte';
	import BoostingServices from '$lib/components/BoostingServices.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>Social Media Boosting Services | FastAccs</title>
	<meta
		name="description"
		content="Grow your social media presence with our premium boosting services. Instagram followers, TikTok views, YouTube subscribers and more."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background-color: var(--bg);">
	<BoostingServices />
</main>

<Footer />
