<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';

	let loading = $state(true);
	let error = $state('');

	// Handle OAuth callback
	async function handleAuthCallback() {
		try {
			const { data, error: authError } = await supabase.auth.getSession();

			if (authError) {
				throw authError;
			}

			if (data.session?.user) {
				// User is authenticated, sync with our database
				const user = data.session.user;

				// Call our database function to handle Google login
				const { error: dbError } = await supabase.rpc('handle_google_login', {
					p_google_id: user.id,
					p_email: user.email || '',
					p_full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
					p_avatar_url: user.user_metadata?.avatar_url || ''
				});

				if (dbError) {
					console.error('Database sync error:', dbError);
					// Don't throw error here, just log it - user is still authenticated
				}

				// Get redirect URL from query params
				const redirectTo = $page.url.searchParams.get('redirect') || '/dashboard';

				// Only redirect in browser
				if (browser) {
					await goto(redirectTo);
				}
			} else {
				// No session found, redirect to login
				if (browser) {
					await goto('/auth/login');
				}
			}
		} catch (err) {
			error = (err as Error).message || 'Authentication failed';
			console.error('Auth callback error:', err);
			loading = false;
		}
	}

	// Run callback handler only in browser
	onMount(() => {
		if (browser) {
			handleAuthCallback();
		}
	});
</script>

<svelte:head>
	<title>Authenticating - FastAccs</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-50 py-12">
	<div class="text-center">
		<div
			class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-2xl font-bold text-white"
		>
			FA
		</div>

		{#if error}
			<div class="mx-auto max-w-md">
				<h2 class="mb-4 text-2xl font-bold text-gray-900">Authentication Error</h2>
				<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
					<p class="text-red-600">{error}</p>
				</div>
				<a
					href="/auth/login"
					class="inline-flex items-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:outline-none"
				>
					Try Again
				</a>
			</div>
		{:else if loading}
			<h2 class="mb-4 text-2xl font-bold text-gray-900">Signing you in...</h2>
			<div class="flex items-center justify-center">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600"
				></div>
			</div>
			<p class="mt-4 text-gray-600">Please wait while we complete your authentication</p>
		{/if}
	</div>
</div>
