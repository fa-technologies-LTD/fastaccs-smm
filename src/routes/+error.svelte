<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { AlertCircle } from '@lucide/svelte';

	const status = $derived($page.status);
	const message = $derived($page.error?.message || 'Something went wrong');
</script>

<svelte:head>
	<title>{status === 404 ? 'Page Not Found' : 'Error'} - FastAccs</title>
</svelte:head>

<Navigation />

<main class="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
	<div class="w-full max-w-lg text-center">
		<div class="mb-6 flex justify-center">
			<div class="rounded-full bg-red-100 p-6">
				<AlertCircle class="h-16 w-16 text-red-600" />
			</div>
		</div>

		{#if status === 404}
			<h1 class="mb-4 text-6xl font-bold text-gray-900">404</h1>
			<h2 class="mb-4 text-2xl font-semibold text-gray-800">Page Not Found</h2>
			<p class="mb-8 text-gray-600">
				Sorry, we couldn't find the page you're looking for. The platform or page may no longer be
				available.
			</p>
		{:else}
			<h1 class="mb-4 text-6xl font-bold text-gray-900">{status}</h1>
			<h2 class="mb-4 text-2xl font-semibold text-gray-800">Something Went Wrong</h2>
			<p class="mb-8 text-gray-600">{message}</p>
		{/if}

		<div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
			<button
				onclick={() => goto('/')}
				class="cursor-pointer rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition-all hover:bg-purple-700 active:scale-[.95]"
			>
				Go Home
			</button>
			<button
				onclick={() => goto('/platforms')}
				class="cursor-pointer rounded-lg border-2 border-purple-600 px-6 py-3 font-semibold text-purple-600 transition-all hover:bg-purple-50 active:scale-[.95]"
			>
				Browse Accounts
			</button>
		</div>

		<div class="mt-12 rounded-lg bg-blue-50 p-6">
			<h3 class="mb-2 font-semibold text-blue-900">Need Help?</h3>
			<p class="mb-4 text-sm text-blue-700">
				If you believe this is an error, please contact our support team.
			</p>
			<button
				onclick={() => goto('/support')}
				class="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
			>
				Contact Support →
			</button>
		</div>
	</div>
</main>

<Footer />
