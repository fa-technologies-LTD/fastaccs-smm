<script>
	import Navigation from '$lib/components/Navigation.svelte';
	import Checkout from '$lib/components/Checkout.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>Checkout | FastAccs</title>
	<meta
		name="description"
		content="Complete your purchase securely. Choose delivery method and payment options for your social media accounts and services."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	<Checkout />
</main>

<Footer />
