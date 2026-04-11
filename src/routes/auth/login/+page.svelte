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

	// Get redirect URL from server data or query params
	const redirectTo = data.returnUrl || page.url.searchParams.get('returnUrl') || '/dashboard';
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

<main
	style="background: var(--bg);"
	class="flex min-h-screen items-center justify-center px-4 py-6 sm:py-12"
>
	<div class="w-full max-w-md">
		<!-- Back Button -->
		<button
			onclick={goBack}
			style="color: var(--primary);"
			class="mb-6 flex items-center gap-2 transition-colors hover:opacity-80"
		>
			<ArrowLeft size={20} />
			<span class="text-sm sm:text-base">Back to Home</span>
		</button>

		<!-- Login Card -->
		<div
			style="background: var(--bg-elev-1); border: 1px solid var(--border); box-shadow: var(--shadow-1);"
			class="overflow-hidden rounded-2xl"
		>
			<!-- Header -->
			<div
				style="background: var(--bg-elev-2); border-bottom: 1px solid var(--border); color: var(--text-primary); font-family: var(--font-heading);"
				class="px-6 py-6 text-center sm:px-8 sm:py-8"
			>
				<h1 class="mb-2 text-2xl font-bold sm:text-3xl">Account Required</h1>
			</div>

			<!-- Content -->
			<div class="px-6 py-6 sm:px-8 sm:py-8">
				{#if error}
					<div
						style="background: var(--status-error-bg); border: 1px solid var(--status-error-border); color: var(--status-error);"
						class="mb-6 rounded-lg p-4"
					>
						<div class="flex items-center gap-2">
							<Lock size={16} />
							<span style="font-family: var(--font-body);" class="text-sm font-medium">Error</span>
						</div>
						<p style="font-family: var(--font-body);" class="mt-1 text-sm">{error}</p>
					</div>
				{/if}

				<!-- Google OAuth Login -->
				<div class="space-y-4">
					<a
						href={`/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`}
						style="background: var(--btn-primary-gradient); color: var(--text-primary); border: 1px solid var(--border); font-family: var(--font-body);"
						class="flex w-full items-center justify-center gap-3 rounded-lg px-6 py-3 transition-all hover:opacity-90 focus:ring-2 focus:ring-offset-2 focus:outline-none"
					>
						<svg class="h-5 w-5" viewBox="0 0 24 24">
							<path
								fill="#4285F4"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							/>
							<path
								fill="#34A853"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							/>
							<path
								fill="#FBBC05"
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							/>
							<path
								fill="#EA4335"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							/>
						</svg>
						<span class="font-medium">Continue with Google</span>
					</a>

					<div class="text-center">
						<button
							onclick={goBack}
							style="color: var(--text-muted); font-family: var(--font-body);"
							class="text-sm transition-colors hover:opacity-80 active:scale-95"
						>
							← Back to browsing
						</button>
					</div>
				</div>

				<!-- Features -->
				<div class="mt-6 space-y-3 sm:mt-8">
					<div
						style="color: var(--text-muted); font-family: var(--font-body);"
						class="flex items-center gap-3 text-sm"
					>
						<div style="background: var(--primary);" class="h-2 w-2 rounded-full"></div>
						<span>Browse all available products</span>
					</div>
					<div
						style="color: var(--text-muted); font-family: var(--font-body);"
						class="flex items-center gap-3 text-sm"
					>
						<div style="background: var(--primary);" class="h-2 w-2 rounded-full"></div>
						<span>View detailed product information</span>
					</div>
					<div
						style="color: var(--text-muted); font-family: var(--font-body);"
						class="flex items-center gap-3 text-sm"
					>
						<div style="background: var(--primary);" class="h-2 w-2 rounded-full"></div>
						<span>Contact support for purchases</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Security Notice -->
		<div
			style="background: var(--status-success-bg); border: 1px solid var(--status-success-border); box-shadow: var(--shadow-1);"
			class="mt-6 rounded-xl p-4"
		>
			<div style="color: var(--status-success);" class="mb-2 flex items-center gap-2">
				<Lock size={16} />
				<span style="font-family: var(--font-body);" class="text-sm font-medium"
					>Secure Authentication</span
				>
			</div>
			<p style="color: var(--text-muted); font-family: var(--font-body);" class="text-xs">
				Your data is protected with industry-standard encryption. We never store your password or
				share your information.
			</p>
		</div>
	</div>
</main>

<Footer />
