<script>
	import Navigation from '$lib/components/Navigation.svelte';
	import UserDashboard from '$lib/components/UserDashboard.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>My Dashboard | FastAccs</title>
	<meta
		name="description"
		content="Manage your orders, view purchase history, and track deliveries from your personal dashboard."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	<UserDashboard />
</main>

<Footer />
