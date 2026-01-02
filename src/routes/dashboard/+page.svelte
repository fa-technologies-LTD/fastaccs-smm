<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import UserDashboard from '$lib/components/UserDashboard.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>My Dashboard | FastAccs</title>
	<meta
		name="description"
		content="Manage your orders, view purchase history, and track deliveries from your personal dashboard."
	/>
</svelte:head>

<Navigation />

<UserDashboard
	user={data.user}
	name={data.user.fullName}
	orders={data.orders}
	joinDate={data.user.createdAt}
	affiliateData={data.affiliateData}
	walletBalance={data.walletBalance}
	walletTransactions={data.walletTransactions}
	purchases={data.purchases}
/>

<Footer />
