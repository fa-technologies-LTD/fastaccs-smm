<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import HeroBanner from '$lib/components/HeroBanner.svelte';
	import FeaturedCategories from '$lib/components/FeaturedCategories.svelte';
	import SocialProof from '$lib/components/SocialProof.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>


<svelte:head>
	<title>FastAccs - Premium Social Media Accounts & Boosting Services</title>
	<meta
		name="description"
		content="Nigeria's most trusted marketplace for verified social media accounts and boosting services. Fast, secure, and reliable delivery guaranteed."
	/>
</svelte:head>

<Navigation />

<main>
	<HeroBanner />
	<FeaturedCategories />
	<SocialProof />
</main>
<Footer />

