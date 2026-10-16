<script lang="ts">
	import { goto } from '$app/navigation';
	import { Lock, ArrowLeft } from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	const MIN_PASSWORD_LENGTH = 8;

	let { data }: { data: PageData } = $props();

	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let submitting = $state(false);
	let linkInvalid = $state(false);
	const showForm = $derived(data.valid && !linkInvalid);

	async function setNewPassword(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = '';
		if (password.length < MIN_PASSWORD_LENGTH) {
			error = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
			return;
		}
		if (password !== confirmPassword) {
			error = 'The two passwords don’t match.';
			return;
		}
		submitting = true;
		try {
			const response = await fetch('/api/auth/password-reset/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok || !result.success) {
				error = result.error || 'Could not update your password. Please try again.';
				if (response.status === 400 && /link/i.test(error)) linkInvalid = true;
				return;
			}
			await goto('/auth/login?reset=1');
		} catch {
			error = 'Could not update your password. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Set New Password - FastAccs</title>
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
				<h1 class="text-2xl font-bold sm:text-3xl">
					{showForm ? 'Set a new password' : 'Link expired'}
				</h1>
			</div>

			<div class="px-6 py-6 sm:px-8 sm:py-8">
				{#if !showForm}
					<p class="text-sm" style="color: var(--text);">
						This reset link is invalid, already used or expired. Links work once and last 30
						minutes.
					</p>
					<a
						href="/auth/forgot-password"
						class="mt-5 flex w-full items-center justify-center rounded-lg px-4 py-2.5 font-semibold"
						style="background: var(--btn-primary-gradient); color: #04140C;">Send a new link</a
					>
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
					<form class="space-y-4" onsubmit={setNewPassword}>
						<div>
							<label
								for="new-password"
								class="mb-1 block text-sm font-medium"
								style="color: var(--text);">New password</label
							>
							<input
								id="new-password"
								type="password"
								bind:value={password}
								autocomplete="new-password"
								minlength={MIN_PASSWORD_LENGTH}
								class="w-full rounded-lg px-3 py-2"
								style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
								placeholder="At least 8 characters"
								required
							/>
						</div>
						<div>
							<label
								for="confirm-password"
								class="mb-1 block text-sm font-medium"
								style="color: var(--text);">Confirm new password</label
							>
							<input
								id="confirm-password"
								type="password"
								bind:value={confirmPassword}
								autocomplete="new-password"
								class="w-full rounded-lg px-3 py-2"
								style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
								placeholder="Type it again"
								required
							/>
						</div>
						<button
							type="submit"
							disabled={submitting}
							class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
							style="background: var(--btn-primary-gradient); color: #04140C;"
						>
							<Lock class="h-4 w-4" />
							{submitting ? 'Saving…' : 'Save new password'}
						</button>
					</form>
					<p class="mt-4 text-xs" style="color: var(--text-muted);">
						Saving signs you out on other devices.
					</p>
				{/if}
			</div>
		</div>
	</div>
</main>

<Footer />
