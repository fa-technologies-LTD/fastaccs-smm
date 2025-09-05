<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>Support - FastAccs</title>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50 py-12">
	<div class="mx-auto max-w-4xl px-4">
		<div class="mb-8 text-center">
			<h1 class="mb-4 text-4xl font-bold text-gray-900">Support Center</h1>
			<p class="text-xl text-gray-600">Get help with your FastAccs experience</p>
		</div>

		<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
			<div class="rounded-lg bg-white p-6 shadow-sm">
				<h3 class="mb-4 text-xl font-semibold">Contact Us</h3>
				<div class="space-y-3">
					<p><strong>WhatsApp:</strong> +234 XXX XXX XXXX</p>
					<p><strong>Email:</strong> support@fastaccs.com</p>
					<p><strong>Telegram:</strong> @FastAccsSupport</p>
				</div>
			</div>

			<div class="rounded-lg bg-white p-6 shadow-sm">
				<h3 class="mb-4 text-xl font-semibold">FAQ</h3>
				<div class="space-y-4">
					<div>
						<h4 class="font-medium">How long does delivery take?</h4>
						<p class="text-gray-600">
							Most accounts are delivered within 30 minutes of payment confirmation.
						</p>
					</div>
					<div>
						<h4 class="font-medium">Are the accounts safe to use?</h4>
						<p class="text-gray-600">
							Yes, all our accounts are created organically and are safe to use.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</main>

<Footer />
