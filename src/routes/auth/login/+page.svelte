<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { Chrome, Mail, ArrowRight, Shield, Zap, Users } from '@lucide/svelte';

	let loading = $state(false);
	let error = $state('');

	// Get redirect URL from query params (e.g., /auth/login?redirect=/checkout)
	const redirectTo = $derived($page.url.searchParams.get('redirect') || '/dashboard');

	async function signInWithGoogle() {
		try {
			loading = true;
			error = '';

			const { data, error: authError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
				}
			});

			if (authError) {
				throw authError;
			}
		} catch (err) {
			error = (err as Error).message || 'Failed to sign in with Google';
			console.error('Google sign in error:', err);
		} finally {
			loading = false;
		}
	}

	async function continueAsGuest() {
		// For guest checkout, redirect to intended page
		goto(redirectTo);
	}
</script>

<svelte:head>
	<title>Sign In - FastAccs</title>
	<meta name="description" content="Sign in to your FastAccs account or continue as guest" />
</svelte:head>

<Navigation />

<main class="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
	<div class="sm:mx-auto sm:w-full sm:max-w-md">
		<div class="text-center">
			<div
				class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-2xl font-bold text-white"
			>
				FA
			</div>
			<h2 class="text-3xl font-bold text-gray-900">Welcome to FastAccs</h2>
			<p class="mt-2 text-gray-600">Sign in to your account or continue as guest</p>
		</div>
	</div>

	<div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
		<div class="rounded-lg bg-white px-4 py-8 shadow-lg sm:px-10">
			{#if error}
				<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
					<p class="text-sm text-red-600">{error}</p>
				</div>
			{/if}

			<!-- Google Sign In -->
			<button
				onclick={signInWithGoogle}
				disabled={loading}
				class="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:border-transparent focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if loading}
					<div
						class="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-purple-600"
					></div>
					<span>Signing in...</span>
				{:else}
					<Chrome size={20} />
					<span>Continue with Google</span>
				{/if}
			</button>

			<div class="mt-6">
				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-gray-300"></div>
					</div>
					<div class="relative flex justify-center text-sm">
						<span class="bg-white px-2 text-gray-500">Or</span>
					</div>
				</div>
			</div>

			<!-- Continue as Guest -->
			<button
				onclick={continueAsGuest}
				class="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 font-medium text-gray-600 transition-all hover:border-purple-400 hover:text-purple-600 focus:border-transparent focus:ring-2 focus:ring-purple-500 focus:outline-none"
			>
				<Mail size={20} />
				<span>Continue as Guest</span>
				<ArrowRight size={16} />
			</button>

			<div class="mt-8 text-center">
				<p class="text-xs text-gray-500">
					By continuing, you agree to our
					<a href="/terms" class="text-purple-600 hover:text-purple-700">Terms of Service</a>
					and
					<a href="/privacy" class="text-purple-600 hover:text-purple-700">Privacy Policy</a>
				</p>
			</div>
		</div>

		<!-- Benefits Section -->
		<div class="mt-8 rounded-lg bg-white p-6 shadow-sm">
			<h3 class="mb-4 text-center text-lg font-semibold text-gray-900">Why create an account?</h3>
			<div class="space-y-3">
				<div class="flex items-center gap-3">
					<div class="flex-shrink-0">
						<Shield size={20} class="text-green-600" />
					</div>
					<div>
						<p class="text-sm font-medium text-gray-900">Secure Order History</p>
						<p class="text-xs text-gray-600">Access your purchases anytime</p>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<div class="flex-shrink-0">
						<Zap size={20} class="text-blue-600" />
					</div>
					<div>
						<p class="text-sm font-medium text-gray-900">Faster Checkout</p>
						<p class="text-xs text-gray-600">Skip forms on future orders</p>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<div class="flex-shrink-0">
						<Users size={20} class="text-purple-600" />
					</div>
					<div>
						<p class="text-sm font-medium text-gray-900">Affiliate Program</p>
						<p class="text-xs text-gray-600">Earn commissions on referrals</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</main>

<Footer />

<style>
	main {
		background-image:
			radial-gradient(circle at 25px 25px, rgba(147, 51, 234, 0.1) 2px, transparent 0),
			radial-gradient(circle at 75px 75px, rgba(59, 130, 246, 0.1) 2px, transparent 0);
		background-size: 100px 100px;
	}
</style>
