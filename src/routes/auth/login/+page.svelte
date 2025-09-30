<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Lock, ArrowLeft } from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let error = $state('');

	// Get redirect URL from query params
	const redirectTo = page.url.searchParams.get('redirectTo') || '/';
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
				<h1 class="mb-2 text-2xl font-bold sm:text-3xl">Account Required</h1>
				<p class="text-sm text-gray-300 sm:text-base">
					Authentication system temporarily unavailable
				</p>
			</div>

			<!-- Content -->
			<div class="px-6 py-6 sm:px-8 sm:py-8">
				{#if error}
					<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
						<div class="flex items-center gap-2 text-red-800">
							<Lock size={16} />
							<span class="text-sm font-medium">Error</span>
						</div>
						<p class="mt-1 text-sm text-red-700">{error}</p>
					</div>
				{/if}

				<!-- Notice -->
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
					<Lock size={48} class="mx-auto mb-4 text-gray-400" />
					<h3 class="mb-2 text-lg font-semibold text-gray-800">Login Currently Unavailable</h3>
					<p class="mb-4 text-sm text-gray-600">
						User authentication is temporarily disabled. You can continue browsing products as a
						guest.
					</p>
					<button
						onclick={goBack}
						class="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
					>
						Continue as Guest
					</button>
				</div>

				<!-- Features -->
				<div class="mt-6 space-y-3 sm:mt-8">
					<div class="flex items-center gap-3 text-sm text-gray-600">
						<div class="bg-secondary h-2 w-2 rounded-full"></div>
						<span>Browse all available products</span>
					</div>
					<div class="flex items-center gap-3 text-sm text-gray-600">
						<div class="bg-secondary h-2 w-2 rounded-full"></div>
						<span>View detailed product information</span>
					</div>
					<div class="flex items-center gap-3 text-sm text-gray-600">
						<div class="bg-secondary h-2 w-2 rounded-full"></div>
						<span>Contact support for purchases</span>
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
