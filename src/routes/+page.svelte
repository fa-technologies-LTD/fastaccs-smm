<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import HeroBanner from '$lib/components/HeroBanner.svelte';
	import FeaturedCategories from '$lib/components/FeaturedCategories.svelte';
	import SocialProof from '$lib/components/SocialProof.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>


<svelte:head>
	<title>FastAccs - Premium Social Media Accounts & Growth Services</title>
	<meta
		name="description"
		content="Nigeria's marketplace for social media accounts and growth services with secure checkout and fast order processing."
	/>
</svelte:head>

<Navigation />

<main>
	<HeroBanner />
	<FeaturedCategories platforms={data.platforms} />
	<SocialProof />
</main>
<Footer />
