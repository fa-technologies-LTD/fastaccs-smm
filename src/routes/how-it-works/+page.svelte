<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>How It Works - FastAccs</title>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-white py-12">
	<div class="mx-auto max-w-4xl px-4">
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-4xl font-bold text-gray-900">How It Works</h1>
			<p class="text-xl text-gray-600">Get your social media accounts in 3 simple steps</p>
		</div>

		<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-2xl font-bold text-purple-600"
				>
					1
				</div>
				<h3 class="mb-2 text-xl font-semibold">Browse & Select</h3>
				<p class="text-gray-600">
					Choose from our premium collection of verified social media accounts
				</p>
			</div>

			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-2xl font-bold text-purple-600"
				>
					2
				</div>
				<h3 class="mb-2 text-xl font-semibold">Secure Payment</h3>
				<p class="text-gray-600">Complete your purchase with our secure payment system</p>
			</div>

			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-2xl font-bold text-purple-600"
				>
					3
				</div>
				<h3 class="mb-2 text-xl font-semibold">Instant Delivery</h3>
				<p class="text-gray-600">Receive your account details via WhatsApp, Telegram, or email</p>
			</div>
		</div>
	</div>
</main>

<Footer />
