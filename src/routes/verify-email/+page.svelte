<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ArrowLeft, RefreshCcw, ShieldCheck, LogOut } from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';

	interface Props {
		data: {
			next: string;
			maskedEmail: string;
			email: string;
		};
	}

	let { data }: Props = $props();

	let digits = $state<string[]>(['', '', '', '', '', '']);
	let verifyLoading = $state(false);
	let resendLoading = $state(false);
	let resendCooldown = $state(0);
	let verifyError = $state('');
	let codeEnsured = $state(false);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	const canVerify = $derived(digits.every((digit) => /^\d$/.test(digit)));
	const composedCode = $derived(digits.join(''));

	function setCooldown(seconds: number): void {
		resendCooldown = Math.max(seconds, 0);
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}

		if (resendCooldown > 0) {
			countdownInterval = setInterval(() => {
				if (resendCooldown <= 1) {
					resendCooldown = 0;
					if (countdownInterval) {
						clearInterval(countdownInterval);
						countdownInterval = null;
					}
					return;
				}
				resendCooldown -= 1;
			}, 1000);
		}
	}

	async function fetchVerificationStatus(): Promise<void> {
		const response = await fetch('/api/auth/verification/status');
		if (!response.ok) return;
		const result = await response.json();
		if (!result?.success) return;

		const retry = Number(result.data?.retryAfterSeconds || 0);
		if (retry > 0) {
			setCooldown(retry);
		}

		if (!result.data?.hasActiveCode && !codeEnsured) {
			await ensureCode(false);
		}
	}

	async function ensureCode(resend: boolean): Promise<void> {
		if (resend) {
			resendLoading = true;
		}

		try {
			const response = await fetch('/api/auth/verification/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ resend })
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				const message = result.error || 'Failed to send verification code.';
				if (result.rateLimited) {
					setCooldown(Number(result.retryAfterSeconds || 0));
				}
				showWarning('Verification code', message);
				return;
			}

			codeEnsured = true;
			setCooldown(Number(result.retryAfterSeconds || 0));
			if (resend) {
				showSuccess('Code sent', 'A new verification code has been sent to your email.');
			}
		} catch (error) {
			console.error('Failed to request verification code:', error);
			showError('Verification code', 'Failed to request a code right now. Please try again.');
		} finally {
			resendLoading = false;
		}
	}

	function focusDigit(index: number): void {
		const el = document.getElementById(`verify-digit-${index}`) as HTMLInputElement | null;
		el?.focus();
		el?.select();
	}

	function handleDigitInput(index: number, value: string): void {
		verifyError = '';
		const cleaned = value.replace(/\D/g, '');

		if (!cleaned) {
			digits[index] = '';
			return;
		}

		const nextDigit = cleaned[cleaned.length - 1];
		digits[index] = nextDigit;

		if (index < digits.length - 1) {
			focusDigit(index + 1);
		}
	}

	function handleKeyDown(index: number, event: KeyboardEvent): void {
		if (event.key === 'Backspace' && !digits[index] && index > 0) {
			digits[index - 1] = '';
			focusDigit(index - 1);
			return;
		}

		if (event.key === 'ArrowLeft' && index > 0) {
			focusDigit(index - 1);
			return;
		}

		if (event.key === 'ArrowRight' && index < digits.length - 1) {
			focusDigit(index + 1);
		}
	}

	function handlePaste(event: ClipboardEvent): void {
		event.preventDefault();
		const pasted = event.clipboardData?.getData('text') || '';
		const sanitized = pasted.replace(/\D/g, '').slice(0, 6);

		if (!sanitized) return;

		const nextDigits = ['','','','','',''];
		for (let i = 0; i < sanitized.length; i++) {
			nextDigits[i] = sanitized[i];
		}
		digits = nextDigits;

		const focusIndex = Math.min(sanitized.length, 5);
		focusDigit(focusIndex);
	}

	async function verifyCode(): Promise<void> {
		if (!canVerify || verifyLoading) return;
		verifyLoading = true;
		verifyError = '';

		try {
			const response = await fetch('/api/auth/verification/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: composedCode })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				verifyError = result.error || 'Verification failed.';
				showWarning('Verification failed', verifyError);
				return;
			}

			showSuccess('Email verified', 'Your email has been verified successfully.');
			await goto(data.next || '/dashboard');
		} catch (error) {
			console.error('Verification failed:', error);
			verifyError = 'Something went wrong while verifying your code.';
			showError('Verification failed', verifyError);
		} finally {
			verifyLoading = false;
		}
	}

	async function signOutToSwitchEmail(): Promise<void> {
		try {
			await fetch('/auth/logout', { method: 'POST' });
		} finally {
			goto('/auth/login');
		}
	}

	onMount(() => {
		void fetchVerificationStatus();
		focusDigit(0);

		return () => {
			if (countdownInterval) {
				clearInterval(countdownInterval);
			}
		};
	});
</script>

<svelte:head>
	<title>Verify your email - FastAccs</title>
</svelte:head>

<Navigation />

<main class="flex min-h-screen items-center justify-center px-4 py-8" style="background: var(--bg);">
	<div class="w-full max-w-md">
		<button
			onclick={() => goto('/dashboard')}
			class="mb-5 inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
			style="color: var(--text-muted);"
		>
			<ArrowLeft class="h-4 w-4" />
			Back
		</button>

		<div
			class="rounded-2xl p-6 shadow-sm sm:p-8"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<div class="mb-6 text-center">
				<div class="mx-auto mb-3 inline-flex rounded-full p-2" style="background: rgba(37,181,112,0.14);">
					<ShieldCheck class="h-5 w-5" style="color: var(--primary);" />
				</div>
				<h1 class="text-2xl font-bold" style="color: var(--text);">Verify your email</h1>
				<p class="mt-2 text-sm" style="color: var(--text-muted);">
					We sent a 6-digit code to <span class="font-medium" style="color: var(--text);"
						>{data.maskedEmail}</span
					>
				</p>
			</div>

			<form
				class="space-y-5"
				onsubmit={(event) => {
					event.preventDefault();
					void verifyCode();
				}}
			>
				<div class="flex items-center justify-between gap-2 sm:gap-3" onpaste={handlePaste}>
					{#each digits as digit, index}
						<input
							id={`verify-digit-${index}`}
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							maxlength={1}
							value={digit}
							oninput={(event) =>
								handleDigitInput(index, (event.currentTarget as HTMLInputElement).value)}
							onkeydown={(event) => handleKeyDown(index, event)}
							class="h-12 w-11 rounded-lg text-center text-xl font-semibold sm:h-14 sm:w-12"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
							aria-label={`Verification digit ${index + 1}`}
						/>
					{/each}
				</div>

				{#if verifyError}
					<p class="text-sm" style="color: var(--status-error);">{verifyError}</p>
				{/if}

				<button
					type="submit"
					disabled={!canVerify || verifyLoading}
					class="w-full rounded-full px-5 py-3 font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
					style="background: var(--btn-primary-gradient); color: #04140C;"
				>
					{#if verifyLoading}
						Verifying...
					{:else}
						Verify
					{/if}
				</button>
			</form>

				<div class="mt-5 text-center text-sm">
					<span style="color: var(--text-muted);">Didn't receive it?</span>
					<button
					type="button"
					disabled={resendCooldown > 0 || resendLoading}
					onclick={() => ensureCode(true)}
					class="ml-2 font-semibold underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline"
					style="color: var(--link);"
				>
					{#if resendLoading}
						Sending...
					{:else if resendCooldown > 0}
						Resend in {resendCooldown}s
					{:else}
						Resend code
						{/if}
					</button>
				</div>
				<p class="mt-2 text-center text-xs" style="color: var(--text-dim);">
					Check Spam or Promotions if the code is not in your inbox.
				</p>

				<div class="mt-4 text-center">
				<button
					type="button"
					onclick={signOutToSwitchEmail}
					class="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
					style="color: var(--text-muted);"
				>
					<LogOut class="h-4 w-4" />
					Wrong email? Sign out
				</button>
			</div>
		</div>
	</div>
</main>

<Footer />
