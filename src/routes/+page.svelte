<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import ActivityTicker from '$lib/components/ActivityTicker.svelte';
	import HeroBanner from '$lib/components/HeroBanner.svelte';
	import HowItWorksStrip from '$lib/components/HowItWorksStrip.svelte';
	import FeaturedCategories from '$lib/components/FeaturedCategories.svelte';
	import SocialProof from '$lib/components/SocialProof.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data?: PageData } = $props();
</script>

<svelte:head>
	<title>Buy Social Media Accounts, Verification Numbers & Boosting | FastAccs</title>
	<meta
		name="description"
		content="Get Instagram, TikTok, X, Facebook accounts, instant verification numbers (WhatsApp, Telegram, Google & more), and boosting services — secure checkout, instant delivery, buyer support."
	/>
</svelte:head>

<Navigation />
<ActivityTicker />

<main>
	<HeroBanner />
	<HowItWorksStrip />
	<FeaturedCategories platforms={data?.platforms ?? []} />
	<SocialProof />
</main>
<Footer />
