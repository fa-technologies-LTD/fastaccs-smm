<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	// Get the error from URL params if any
	const error = page.url.searchParams.get('error');

	onMount(() => {
		if (error) {
			// If there's an error in URL params, redirect to login immediately
			goto(`/auth/login?error=${encodeURIComponent(error)}`);
		} else {
			// Give more time for server-side auth processing (increased from 2s to 5s)
			setTimeout(() => {
				goto('/auth/login?error=Authentication timeout - please try again');
			}, 5000);
		}
	});
</script>

<svelte:head>
	<title>Authenticating - FastAccs</title>
</svelte:head>

<main
	class="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50"
>
	<div class="text-center">
		<div class="rounded-2xl bg-white p-12 shadow-xl">
			<div
				class="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"
			></div>
			<h1 class="mb-2 text-2xl font-bold text-gray-900">Completing authentication...</h1>
			<p class="text-gray-600">Please wait a moment</p>
		</div>
	</div>
</main>
