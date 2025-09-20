<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Chrome, Mail, Lock, ArrowLeft } from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let loading = $state(false);
	let error = $state('');

	// Get redirect URL from query params
	const redirectTo = page.url.searchParams.get('redirectTo') || '/dashboard';
	const errorParam = page.url.searchParams.get('error');

	onMount(() => {
		// Show error from URL params
		if (errorParam) {
			error = errorParam;
		}

		// Check if user is already logged in
		if (data.user) {
			goto(redirectTo);
		}
	});

	async function signInWithGoogle() {
		try {
			loading = true;
			error = '';

			const { error: authError } = await data.supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: `${page.url.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`
				}
			});

			if (authError) {
				console.error('OAuth initiation error:', authError);
				throw authError;
			}
		} catch (err: any) {
			console.error('Google sign in error:', err);
			error = err.message || 'Failed to start Google authentication';
			loading = false;
		}
	}

	function goBack() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Sign In - FastAccs</title>
	<meta
		name="description"
		content="Sign in to your FastAccs account to access premium social media accounts"
	/>
</svelte:head>

<Navigation />

<main class="bg-gradient-primary flex min-h-screen items-center justify-center px-4 py-6 sm:py-12">
	<div class="w-full max-w-md">
		<!-- Back Button -->
		<button
			onclick={goBack}
			class="hover:text-primary-accent active:text-primary-accent-bright mb-6 flex items-center gap-2 text-white transition-colors"
		>
			<ArrowLeft size={20} />
			<span class="text-sm sm:text-base">Back to Home</span>
		</button>

		<!-- Login Card -->
		<div class="overflow-hidden rounded-2xl bg-white shadow-xl">
			<!-- Header -->
			<div class="bg-neutral-dark px-6 py-6 text-center text-white sm:px-8 sm:py-8">
				<h1 class="mb-2 text-2xl font-bold sm:text-3xl">Welcome Back</h1>
				<p class="text-sm text-gray-300 sm:text-base">Sign in to access your FastAccs account</p>
			</div>

			<!-- Content -->
			<div class="px-6 py-6 sm:px-8 sm:py-8">
				{#if error}
					<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
						<div class="flex items-center gap-2 text-red-800">
							<Lock size={16} />
							<span class="text-sm font-medium">Sign In Error</span>
						</div>
						<p class="mt-1 text-sm text-red-700">{error}</p>
					</div>
				{/if}

				<!-- Google Sign In -->
				<button
					onclick={signInWithGoogle}
					disabled={loading}
					class="hover:border-secondary flex w-full items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-4 text-base transition-all duration-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
				>
					{#if loading}
						<div
							class="border-secondary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
						></div>
						<span class="font-semibold text-gray-700">Signing in...</span>
					{:else}
						<Chrome size={20} class="text-secondary" />
						<span class="font-semibold text-gray-700">Continue with Google</span>
					{/if}
				</button>

				<div class="mt-6 text-center sm:mt-8">
					<p class="text-sm text-gray-600">
						Don't have an account? Signing in with Google will create one automatically.
					</p>
				</div>

				<!-- Features -->
				<div class="mt-6 space-y-3 sm:mt-8">
					<div class="flex items-center gap-3 text-sm text-gray-600">
						<div class="bg-secondary h-2 w-2 rounded-full"></div>
						<span>Access your order history and account details</span>
					</div>
					<div class="flex items-center gap-3 text-sm text-gray-600">
						<div class="bg-secondary h-2 w-2 rounded-full"></div>
						<span>Faster checkout with saved information</span>
					</div>
					<div class="flex items-center gap-3 text-sm text-gray-600">
						<div class="bg-secondary h-2 w-2 rounded-full"></div>
						<span>Track your purchases and delivery status</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Security Notice -->
		<div class="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="mb-2 flex items-center gap-2 text-green-600">
				<Lock size={16} />
				<span class="text-sm font-medium">Secure Authentication</span>
			</div>
			<p class="text-xs text-gray-600">
				Your data is protected with industry-standard encryption. We never store your password or
				share your information.
			</p>
		</div>
	</div>
</main>

<Footer />
