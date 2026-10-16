<script lang="ts">
	import { Lock, ArrowLeft, Mail } from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let email = $state('');
	let error = $state('');
	let sentMessage = $state('');
	let submitting = $state(false);

	async function requestLink(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = '';
		if (!email.trim()) {
			error = 'Enter the email you signed up with.';
			return;
		}
		submitting = true;
		try {
			const response = await fetch('/api/auth/password-reset/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok || !result.success) {
				error = result.error || 'Could not send a reset link. Please try again.';
				return;
			}
			sentMessage = result.message;
		} catch {
			error = 'Could not send a reset link. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - FastAccs</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Navigation />

<main
	style="background: var(--bg);"
	class="flex min-h-screen items-center justify-center px-4 py-6 sm:py-12"
>
	<div class="w-full max-w-md">
		<a
			href="/auth/login"
			style="color: var(--primary);"
			class="mb-6 flex items-center gap-2 transition-colors hover:opacity-80"
		>
			<ArrowLeft size={20} />
			<span class="text-sm sm:text-base">Back to sign in</span>
		</a>

		<div
			style="background: var(--bg-elev-1); border: 1px solid var(--border); box-shadow: var(--shadow-1);"
			class="overflow-hidden rounded-2xl"
		>
			<div
				style="background: var(--bg-elev-2); border-bottom: 1px solid var(--border); color: var(--text-primary); font-family: var(--font-heading);"
				class="px-6 py-6 text-center sm:px-8 sm:py-8"
			>
				<h1 class="mb-2 text-2xl font-bold sm:text-3xl">Forgot your password?</h1>
				<p class="text-sm" style="color: var(--text-muted); font-family: var(--font-body);">
					Enter your email and we’ll send you a link to set a new one.
				</p>
			</div>

			<div class="px-6 py-6 sm:px-8 sm:py-8">
				{#if sentMessage}
					<div
						role="status"
						style="background: var(--status-success-bg); border: 1px solid var(--status-success-border); color: var(--status-success);"
						class="rounded-lg p-4"
					>
						<div class="flex items-center gap-2">
							<Mail size={16} />
							<span class="text-sm font-medium">Check your email</span>
						</div>
						<p class="mt-1 text-sm" style="color: var(--text);">{sentMessage}</p>
						<p class="mt-2 text-xs" style="color: var(--text-muted);">
							The link expires in 30 minutes. Didn’t get it? Wait a minute, check spam, then try
							again.
						</p>
					</div>
				{:else}
					{#if error}
						<div
							role="alert"
							style="background: var(--status-error-bg); border: 1px solid var(--status-error-border); color: var(--status-error);"
							class="mb-6 rounded-lg p-4"
						>
							<div class="flex items-center gap-2">
								<Lock size={16} />
								<span class="text-sm font-medium">Error</span>
							</div>
							<p class="mt-1 text-sm">{error}</p>
						</div>
					{/if}
					<form class="space-y-4" onsubmit={requestLink}>
						<div>
							<label
								for="email-reset"
								class="mb-1 block text-sm font-medium"
								style="color: var(--text);">Email</label
							>
							<input
								id="email-reset"
								type="email"
								bind:value={email}
								autocomplete="email"
								class="w-full rounded-lg px-3 py-2"
								style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
								placeholder="you@example.com"
								required
							/>
						</div>
						<button
							type="submit"
							disabled={submitting}
							class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
							style="background: var(--btn-primary-gradient); color: #04140C;"
						>
							<Mail class="h-4 w-4" />
							{submitting ? 'Sending…' : 'Send reset link'}
						</button>
					</form>
					<p class="mt-5 text-center text-sm" style="color: var(--text-muted);">
						Signed up with Google? Just use
						<a href="/auth/login" class="font-semibold" style="color: var(--link);"
							>Continue with Google</a
						>.
					</p>
				{/if}
			</div>
		</div>
	</div>
</main>

<Footer />
