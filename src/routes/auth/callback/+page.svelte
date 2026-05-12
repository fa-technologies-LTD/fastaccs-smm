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
	class="flex min-h-screen items-center justify-center px-4"
	style="background: linear-gradient(180deg, #07090C 0%, #050607 100%);"
>
	<div class="w-full max-w-md text-center">
		<div
			class="rounded-2xl p-8 sm:p-10"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); box-shadow: var(--shadow-1);"
		>
			<div
				class="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent"
			></div>
			<h1 class="mb-2 text-xl font-bold sm:text-2xl" style="color: var(--text);">
				Completing authentication...
			</h1>
			<p style="color: var(--text-muted);">Please wait a moment</p>
		</div>
	</div>
</main>
