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

<main
	class="flex min-h-screen items-center justify-center px-4 py-16"
	style="background: var(--bg);"
>
	<div class="w-full max-w-lg text-center">
		<div class="mb-6 flex justify-center">
			<div class="rounded-full p-6" style="background: rgba(239, 68, 68, 0.1);">
				<AlertCircle class="h-16 w-16 text-red-600" />
			</div>
		</div>

		{#if status === 404}
			<h1 class="mb-4 text-6xl font-bold" style="color: var(--text);">404</h1>
			<h2 class="mb-4 text-2xl font-semibold" style="color: var(--text);">Page Not Found</h2>
			<p class="mb-8" style="color: var(--text-muted);">
				Sorry, we couldn't find the page you're looking for. The platform or page may no longer be
				available.
			</p>
		{:else}
			<h1 class="mb-4 text-6xl font-bold" style="color: var(--text);">{status}</h1>
			<h2 class="mb-4 text-2xl font-semibold" style="color: var(--text);">Something Went Wrong</h2>
			<p class="mb-8" style="color: var(--text-muted);">{message}</p>
		{/if}

		<div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
			<button
				onclick={() => goto('/')}
				class="cursor-pointer rounded-full px-6 py-3 font-semibold transition-all hover:opacity-90 active:scale-[.95]"
				style="background: var(--primary); color: #000;"
			>
				Go Home
			</button>
			<button
				onclick={() => goto('/platforms')}
				class="cursor-pointer rounded-full px-6 py-3 font-semibold transition-all hover:opacity-90 active:scale-[.95]"
				style="border: 1px solid var(--border); color: var(--text);"
			>
				Browse Accounts
			</button>
		</div>

		<div
			class="mt-12 rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h3 class="mb-2 font-semibold" style="color: var(--text);">Need Help?</h3>
			<p class="mb-4 text-sm" style="color: var(--text-muted);">
				If you believe this is an error, please contact our support team.
			</p>
			<button
				onclick={() => goto('/support')}
				class="text-sm font-medium hover:underline"
				style="color: var(--primary);"
			>
				Contact Support →
			</button>
		</div>
	</div>
</main>

<Footer />
