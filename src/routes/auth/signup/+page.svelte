<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { UserPlus, ArrowLeft } from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const redirectTo = data.returnUrl || page.url.searchParams.get('returnUrl') || '/dashboard';
	let fullName = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');

	function goBack() {
		goto('/');
	}

	async function submitSignup(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = '';

		if (!email.trim() || !password) {
			error = 'Email and password are required.';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		loading = true;
		try {
			const response = await fetch('/api/auth/signup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fullName,
					email,
					password,
					redirectTo
				})
			});
			const result = await response.json();
				if (!response.ok || !result.success) {
					error = result.error || 'Failed to create account.';
					return;
				}

				await invalidateAll();
				await goto(result.redirectTo || `/verify-email?next=${encodeURIComponent(redirectTo)}`);
			} catch (signupError) {
			console.error('Signup failed:', signupError);
			error = 'Unable to create account right now. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Create account - FastAccs</title>
</svelte:head>

<Navigation />

<main
	style="background: var(--bg);"
	class="flex min-h-screen items-center justify-center px-4 py-6 sm:py-12"
>
	<div class="w-full max-w-md">
		<button
			onclick={goBack}
			style="color: var(--primary);"
			class="mb-6 flex items-center gap-2 transition-colors hover:opacity-80"
		>
			<ArrowLeft size={20} />
			<span class="text-sm sm:text-base">Back to Home</span>
		</button>

		<div
			style="background: var(--bg-elev-1); border: 1px solid var(--border); box-shadow: var(--shadow-1);"
			class="overflow-hidden rounded-2xl"
		>
			<div
				style="background: var(--bg-elev-2); border-bottom: 1px solid var(--border); color: var(--text-primary); font-family: var(--font-heading);"
				class="px-6 py-6 text-center sm:px-8 sm:py-8"
			>
				<h1 class="mb-2 text-2xl font-bold sm:text-3xl">Create account</h1>
				<p class="text-sm" style="color: var(--text-muted);">
					Use any email provider, then verify your email once.
				</p>
			</div>

			<div class="px-6 py-6 sm:px-8 sm:py-8">
				{#if error}
					<div
						class="mb-5 rounded-lg p-3 text-sm"
						style="background: var(--status-error-bg); border: 1px solid var(--status-error-border); color: var(--status-error);"
					>
						{error}
					</div>
				{/if}

				<form class="space-y-4" onsubmit={submitSignup}>
					<div>
						<label for="signup-name" class="mb-1 block text-sm font-medium" style="color: var(--text);">
							Full name
						</label>
						<input
							id="signup-name"
							type="text"
							bind:value={fullName}
							autocomplete="name"
							class="w-full rounded-lg px-3 py-2"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
							placeholder="John Doe"
						/>
					</div>

					<div>
						<label for="signup-email" class="mb-1 block text-sm font-medium" style="color: var(--text);">
							Email
						</label>
						<input
							id="signup-email"
							type="email"
							bind:value={email}
							autocomplete="email"
							class="w-full rounded-lg px-3 py-2"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
							placeholder="you@example.com"
							required
						/>
					</div>

					<div>
						<label
							for="signup-password"
							class="mb-1 block text-sm font-medium"
							style="color: var(--text);"
						>
							Password
						</label>
						<input
							id="signup-password"
							type="password"
							bind:value={password}
							autocomplete="new-password"
							minlength={8}
							class="w-full rounded-lg px-3 py-2"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
							placeholder="Minimum 8 characters"
							required
						/>
					</div>

					<div>
						<label
							for="signup-password-confirm"
							class="mb-1 block text-sm font-medium"
							style="color: var(--text);"
						>
							Confirm password
						</label>
						<input
							id="signup-password-confirm"
							type="password"
							bind:value={confirmPassword}
							autocomplete="new-password"
							minlength={8}
							class="w-full rounded-lg px-3 py-2"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
							placeholder="Re-enter password"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
						style="background: var(--btn-primary-gradient); color: #04140C;"
					>
						<UserPlus class="h-4 w-4" />
						{loading ? 'Creating account...' : 'Create account'}
					</button>
				</form>

				<div class="my-5 h-px" style="background: var(--border);"></div>

				<a
					href={`/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`}
					class="block w-full rounded-lg px-4 py-2.5 text-center font-medium transition-opacity hover:opacity-90"
					style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
				>
					Continue with Google
				</a>

				<div class="mt-4 text-center text-sm" style="color: var(--text-muted);">
					Already have an account?
					<a
						href={`/auth/login?returnUrl=${encodeURIComponent(redirectTo)}`}
						class="ml-1 font-semibold underline-offset-2 hover:underline"
						style="color: var(--link);"
					>
						Sign in
					</a>
				</div>
			</div>
		</div>
	</div>
</main>

<Footer />
