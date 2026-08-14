<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Copy, RefreshCw, ShieldCheck, X, Check } from '$lib/icons';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import BrandIcon from '$lib/components/BrandIcon.svelte';

	interface PhoneState {
		orderItemId: string;
		serviceName: string;
		countryName: string;
		phoneNumber: string | null;
		status: string;
		otp: string | null;
		smsMessage: string | null;
		expiresAt: string | null;
		otpRequestedAt?: string | null;
		saleAmountNgn?: number | null;
		refundMessage?: string | null;
	}

	let { phone }: { phone: PhoneState } = $props();

	const ACTIVE = ['pending', 'renting', 'preparing', 'awaiting_sms'];

	let status = $state(phone.status);
	let phoneNumber = $state(phone.phoneNumber);
	let otp = $state(phone.otp);
	let smsMessage = $state(phone.smsMessage);
	let expiresAt = $state(phone.expiresAt);
	let canCancel = $state(false);
	let cancelling = $state(false);
	let cancelledByUser = $state(false);
	let refundMessage = $state<string | null>(phone.refundMessage ?? null);
	let now = $state(Date.now());
	// When the customer taps "I've requested the code", we start a focused window; if the code
	// doesn't land in it, we offer "try another number". This mirrors the server's replacement wait
	// (~120s from the request), so the button never appears before the backend will allow a swap.
	const EXPECTED_CODE_MS = 120_000;
	// D1: seed from the server's authoritative request time so a refresh / return from WhatsApp
	// reconstructs the waiting state instead of re-prompting "I've requested the code".
	let requestedAt = $state<number | null>(
		phone.otpRequestedAt ? new Date(phone.otpRequestedAt).getTime() : null
	);
	let retrying = $state(false);
	let copiedLabel = $state<string | null>(null);
	// The "I've requested the code" button is muted briefly after the number appears — long enough to
	// nudge the customer to actually request the SMS first, short enough not to feel blocked.
	const REQUEST_MUTE_MS = 15_000;
	let numberShownAt = $state<number | null>(null);
	$effect(() => {
		if (phoneNumber && numberShownAt == null) numberShownAt = Date.now();
	});
	const requestMuted = $derived(numberShownAt != null && now - numberShownAt < REQUEST_MUTE_MS);

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let clockTimer: ReturnType<typeof setInterval> | null = null;

	// Preparing = paid, number being fetched. Waiting = number in hand, awaiting the code.
	const isPreparing = $derived(
		['pending', 'renting', 'preparing'].includes(status) || (status === 'awaiting_sms' && !phoneNumber)
	);
	const isWaiting = $derived(status === 'awaiting_sms' && Boolean(phoneNumber));
	const isReceived = $derived(status === 'received');
	const isRefunded = $derived(status === 'refunded' || status === 'cancelled' || status === 'expired');

	const secondsLeft = $derived(
		expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : null
	);
	const countdown = $derived(
		secondsLeft == null ? '' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
	);

	// "Soda bar" progress toward the expected code arrival, once the customer says they requested it.
	const requestProgress = $derived(
		requestedAt == null ? 0 : Math.min(100, ((now - requestedAt) / EXPECTED_CODE_MS) * 100)
	);
	const showTryAnother = $derived(
		isWaiting && requestedAt != null && now - requestedAt >= EXPECTED_CODE_MS
	);

	// Securing reassurance evolves with elapsed UI time (never a fake %), so a longer wait reads as
	// "still working" rather than "stuck". Payment is already confirmed by the time this card renders.
	const startedAt = Date.now();
	const securingElapsed = $derived((now - startedAt) / 1000);
	const securingMessage = $derived(
		securingElapsed < 15
			? `We’re finding an available ${phone.serviceName} number for ${phone.countryName}.`
			: securingElapsed < 40
				? 'Still working — some numbers take a little longer to secure.'
				: 'We’re still on it. You don’t need to refresh or pay again.'
	);

	function requestCode() {
		requestedAt = Date.now();
		// Stamp the authoritative server-side request time (the replacement wait runs from it).
		fetch(`/api/numbers/${phone.orderItemId}/requested`, { method: 'POST' }).catch(() => {});
	}

	async function tryAnother() {
		if (retrying) return;
		retrying = true;
		try {
			const res = await fetch(`/api/numbers/${phone.orderItemId}/retry`, { method: 'POST' });
			const data = await res.json();
			if (data.status === 'awaiting_sms') {
				phoneNumber = data.phoneNumber ?? phoneNumber;
				status = 'awaiting_sms';
				requestedAt = null; // re-request on the fresh number
				expiresAt = null;
				showSuccess('Fresh number ready', data.message);
				if (!pollTimer) pollTimer = setInterval(poll, 3000);
				poll();
			} else if (data.status === 'received') {
				status = 'received';
				await poll();
				showWarning('Code arrived', data.message);
			} else if (data.status === 'refunded') {
				status = 'refunded';
				refundMessage = data.message;
				stopPolling();
				showSuccess('Refunded', data.message);
			} else {
				showWarning('One moment', data.message);
			}
		} catch {
			showError('Could not try another', 'Please try again in a moment.');
		} finally {
			retrying = false;
		}
	}

	async function poll() {
		try {
			const res = await fetch(`/api/numbers/${phone.orderItemId}/sms`);
			if (!res.ok) return;
			const data = await res.json();
			if (data.phoneNumber) phoneNumber = data.phoneNumber;
			canCancel = data.canCancel === true;
			if (data.status === 'received') {
				status = 'received';
				otp = data.otp ?? otp;
				smsMessage = data.message ?? smsMessage;
				stopPolling();
			} else if (data.status === 'refunded' || data.status === 'expired') {
				status = data.status;
				if (data.message) refundMessage = data.message;
				stopPolling();
			} else if (data.status === 'awaiting_sms') {
				status = 'awaiting_sms';
				if (data.expiresAt) expiresAt = data.expiresAt;
			} else if (data.status === 'preparing') {
				status = 'preparing';
			}
		} catch {
			/* transient — keep polling */
		}
	}

	function stopPolling() {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
	}

	async function cancelNumber() {
		if (cancelling) return;
		if (!confirm('Cancel this number and refund to your store credit?')) return;
		cancelling = true;
		try {
			const res = await fetch(`/api/numbers/${phone.orderItemId}/cancel`, { method: 'POST' });
			const data = await res.json();
			if (data.outcome === 'refunded') {
				status = 'refunded';
				cancelledByUser = true;
				refundMessage = 'Cancelled — refunded to your store credit.';
				stopPolling();
				showSuccess('Cancelled', data.message);
			} else if (data.outcome === 'received') {
				status = 'received';
				await poll();
				showWarning('Code arrived', data.message);
			} else {
				showWarning('Not cancelled yet', data.message);
			}
		} catch {
			showError('Could not cancel', 'Please try again in a moment.');
		} finally {
			cancelling = false;
		}
	}

	async function copy(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedLabel = label;
			setTimeout(() => {
				if (copiedLabel === label) copiedLabel = null;
			}, 1600);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		clockTimer = setInterval(() => (now = Date.now()), 1000);
		if (ACTIVE.includes(status)) {
			poll();
			pollTimer = setInterval(poll, 3000);
		}
	});
	onDestroy(() => {
		stopPolling();
		if (clockTimer) clearInterval(clockTimer);
	});
</script>

<div class="rounded-2xl p-6 mb-6" style="border: 1px solid var(--border); background: var(--surface);">
	<div class="flex items-center gap-2.5 mb-4">
		<span class="flex items-center justify-center w-9 h-9 rounded-lg" style="background: var(--bg-elev-1);">
			<BrandIcon service={phone.serviceName} size={22} />
		</span>
		<h3 class="font-semibold text-lg" style="color: var(--text);">{phone.serviceName} — {phone.countryName}</h3>
	</div>

	{#if phoneNumber}
		<div
			class="flex items-center justify-between rounded-lg px-4 py-3 mb-4"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div>
				<div class="text-xs" style="color: var(--text-muted);">Your number</div>
				<div class="text-xl font-mono font-semibold tracking-wide" style="color: var(--text);">{phoneNumber}</div>
			</div>
			<button
				onclick={() => copy(phoneNumber ?? '', 'Number')}
				class="inline-flex items-center gap-1 text-sm hover:underline"
				style="color: {copiedLabel === 'Number' ? '#34d399' : '#38bdf8'};"
			>
				{#if copiedLabel === 'Number'}
					<Check class="w-4 h-4" /> Copied
				{:else}
					<Copy class="w-4 h-4" /> Copy
				{/if}
			</button>
		</div>
	{/if}

	{#if isReceived && otp}
		<div class="rounded-lg px-4 py-4 text-center" style="border: 1px solid #34d399; background: rgba(16,185,129,0.10);">
			<div class="text-xs mb-1 flex items-center justify-center gap-1" style="color: #34d399;">
				<ShieldCheck class="w-4 h-4" /> Your code arrived
			</div>
			<button
				onclick={() => copy(otp ?? '', 'Code')}
				class="text-3xl font-bold font-mono tracking-widest hover:opacity-80"
				style="color: #34d399;"
				title="Click to copy"
			>
				{otp}
			</button>
			{#if smsMessage}
				<div class="text-xs mt-2" style="color: var(--text-muted);">{smsMessage}</div>
			{/if}
		</div>
	{:else if isPreparing}
		<div class="rounded-lg px-4 py-4 text-center" style="border: 1px solid var(--border); background: var(--bg-elev-1);">
			<div class="text-xs mb-2 inline-flex items-center gap-1" style="color: #34d399;">
				<ShieldCheck class="w-3.5 h-3.5" /> Payment confirmed
			</div>
			<div class="inline-flex items-center gap-2" style="color: var(--text);">
				<RefreshCw class="w-4 h-4 animate-spin" style="color: #38bdf8;" />
				Getting your number
			</div>
			<div class="text-xs mt-2 mb-3" style="color: var(--text-dim);">
				{securingMessage}
			</div>
			<div class="soda-track"><div class="soda-fill soda-fill-indeterminate"></div></div>
		</div>
	{:else if isWaiting}
		<div class="rounded-lg px-4 py-4" style="border: 1px solid var(--border); background: var(--bg-elev-1);">
			{#if !requestedAt}
				<!-- Number in hand — a clear 3-step workflow, then request-code (muted briefly). -->
				<ol class="text-sm space-y-2 mb-4" style="color: var(--text);">
					<li class="flex gap-2">
						<span class="font-semibold" style="color: #38bdf8;">1</span> Copy the number above.
					</li>
					<li class="flex gap-2">
						<span class="font-semibold" style="color: #38bdf8;">2</span> Enter it in {phone.serviceName}
						and request the SMS code.
					</li>
					<li class="flex gap-2">
						<span class="font-semibold" style="color: #38bdf8;">3</span> Come back here — your code
						appears automatically.
					</li>
				</ol>
				<div class="flex flex-col items-center gap-1.5">
					<button onclick={requestCode} disabled={requestMuted} class="soda-cta">
						✓ I’ve requested the code
					</button>
					{#if requestMuted}
						<span class="text-xs" style="color: var(--text-dim);">
							Request the SMS in {phone.serviceName} first
						</span>
					{/if}
				</div>
			{:else}
				<!-- Requested — waiting calmly; FastAccs checks automatically (no fake countdown). -->
				<div class="flex items-center justify-center gap-2 text-sm mb-1" style="color: var(--text);">
					{#if showTryAnother}
						No code yet?
					{:else}
						<RefreshCw class="w-4 h-4 animate-spin" style="color: #38bdf8;" />
						Waiting for your code
					{/if}
				</div>
				<div class="text-xs text-center mb-3" style="color: var(--text-dim);">
					{#if showTryAnother}
						We can switch you to another number at no extra charge.
					{:else}
						Checking automatically… · No need to refresh.
					{/if}
				</div>
				<div class="soda-track">
					<div
						class="soda-fill"
						class:soda-fill-done={showTryAnother}
						style="width: {requestProgress}%;"
					></div>
				</div>
				{#if showTryAnother}
					<div class="flex flex-wrap items-center justify-center gap-2 mt-4">
						<button onclick={tryAnother} disabled={retrying} class="soda-cta">
							{retrying ? 'Getting another number…' : 'Try another number'}
						</button>
						{#if canCancel}
							<button
								onclick={cancelNumber}
								disabled={cancelling}
								class="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
								style="border: 1px solid var(--border); color: var(--text-muted);"
							>
								<X class="w-3.5 h-3.5" />
								{cancelling ? 'Cancelling…' : 'Cancel & refund'}
							</button>
						{/if}
					</div>
				{:else}
					<div class="text-xs mt-3 text-center" style="color: var(--text-dim);">
						No code? We’ll switch you to another number or refund your store credit — automatically.
					</div>
				{/if}
			{/if}
		</div>
	{:else if isRefunded}
		<div class="rounded-lg px-4 py-4 text-center" style="border: 1px solid rgba(52,211,153,0.4); background: rgba(52,211,153,0.08); color: #34d399;">
			<div class="inline-flex items-center gap-2">
				<ShieldCheck class="w-4 h-4" />
				{refundMessage ??
					(cancelledByUser
						? 'Cancelled — your payment is back in your store credit, ready to use.'
						: 'No code arrived — your payment is back in your store credit, ready to use.')}
			</div>
		</div>
	{/if}
</div>

<style>
	/* "Soda bar": a calm, filling progress bar to reduce waiting anxiety (vs a stark countdown). */
	.soda-track {
		height: 8px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.14);
		overflow: hidden;
		border: 1px solid var(--border);
	}
	.soda-fill {
		height: 100%;
		border-radius: 999px;
		background: linear-gradient(90deg, #38bdf8, #34d399);
		transition: width 0.9s linear;
		box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
	}
	.soda-fill-done {
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
		box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
	}
	.soda-fill-indeterminate {
		width: 40%;
		animation: soda-slide 1.4s ease-in-out infinite;
	}
	@keyframes soda-slide {
		0% {
			margin-left: -40%;
		}
		100% {
			margin-left: 100%;
		}
	}
	.soda-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 9px 20px;
		border-radius: 999px;
		font-size: 0.875rem;
		font-weight: 600;
		color: #0b1220;
		background: linear-gradient(90deg, #38bdf8, #34d399);
		box-shadow: 0 0 14px rgba(56, 189, 248, 0.45);
		border: none;
		cursor: pointer;
		transition: transform 0.1s ease, filter 0.1s ease;
	}
	.soda-cta:hover {
		filter: brightness(1.08);
	}
	.soda-cta:active {
		transform: scale(0.97);
	}
	.soda-cta:disabled {
		opacity: 0.6;
		cursor: default;
	}
	@media (prefers-reduced-motion: reduce) {
		.soda-fill {
			transition: none;
		}
		.soda-fill-indeterminate {
			animation: none;
			margin-left: 30%;
		}
	}
</style>
