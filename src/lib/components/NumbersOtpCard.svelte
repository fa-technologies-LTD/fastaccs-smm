<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores/cart.svelte';
	import { Copy, RefreshCw, ShieldCheck, Check } from '$lib/icons';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';

	interface PhoneState {
		orderItemId: string;
		serviceName: string;
		countryName: string;
		phoneNumber: string | null;
		status: string;
		otp: string | null;
		smsMessage: string | null;
		replacementWaitSeconds?: number | null;
		otpRequestedAt?: string | null;
		saleAmountNgn?: number | null;
		tierId?: string | null;
		refundMessage?: string | null;
	}

	let { phone }: { phone: PhoneState } = $props();

	const ACTIVE = ['pending', 'renting', 'preparing', 'awaiting_sms'];

	let status = $state(phone.status);
	let phoneNumber = $state(phone.phoneNumber);
	let otp = $state(phone.otp);
	let smsMessage = $state(phone.smsMessage);
	let canCancel = $state(false);
	let cancelling = $state(false);
	let cancelledByUser = $state(false);
	let showCancelModal = $state(false);
	let refundMessage = $state<string | null>(phone.refundMessage ?? null);
	let now = $state(Date.now());
	// When the customer taps "I've requested the code", we start a focused window; if the code
	// doesn't land in it, we offer "try another number". This mirrors the server's replacement wait
	// (~120s from the request), so the button never appears before the backend will allow a swap.
	const EXPECTED_CODE_MS = Math.max(30, Number(phone.replacementWaitSeconds || 120)) * 1000;
	// D1: seed from the server's authoritative request time so a refresh / return from WhatsApp
	// reconstructs the waiting state instead of re-prompting "I've requested the code".
	let requestedAt = $state<number | null>(
		phone.otpRequestedAt ? new Date(phone.otpRequestedAt).getTime() : null
	);
	let retrying = $state(false);
	let replacingNumber = $state<string | null>(null);
	let freshNumberVisible = $state(false);
	let markingRequested = $state(false);
	let copiedLabel = $state<string | null>(null);
	// The "I've requested the code" button is muted briefly after the number appears — long enough to
	// nudge the customer to actually request the SMS first, short enough not to feel blocked.
	const REQUEST_MUTE_MS = 15_000;
	let numberShownAt = $state<number | null>(null);
	let leftToRequestCode = $state(false);
	let activeNumberKey = $state<string | null>(null);
	$effect(() => {
		if (!phoneNumber) return;
		const key = `fastaccs_number_nudge:${phone.orderItemId}:${phoneNumber}`;
		if (activeNumberKey === key) return;
		activeNumberKey = key;
		const stored =
			typeof sessionStorage !== 'undefined' ? Number(sessionStorage.getItem(key)) : NaN;
		numberShownAt = Number.isFinite(stored) && stored > 0 ? stored : Date.now();
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, String(numberShownAt));
		leftToRequestCode = false;
	});
	const requestNudgeSeconds = $derived(
		numberShownAt == null
			? 0
			: Math.max(0, Math.ceil((REQUEST_MUTE_MS - (now - numberShownAt)) / 1000))
	);
	const requestMuted = $derived(requestNudgeSeconds > 0 && !leftToRequestCode);

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let clockTimer: ReturnType<typeof setInterval> | null = null;
	let freshNumberTimer: ReturnType<typeof setTimeout> | null = null;

	function revealFreshNumber(nextNumber: string | null | undefined, highlight = false): void {
		if (!nextNumber) return;
		const changed = nextNumber !== phoneNumber;
		phoneNumber = nextNumber;
		if (!highlight || !changed) return;
		freshNumberVisible = true;
		if (freshNumberTimer) clearTimeout(freshNumberTimer);
		freshNumberTimer = setTimeout(() => {
			freshNumberVisible = false;
			freshNumberTimer = null;
		}, 5_000);
	}

	// Mobile: when the live card scrolls out of view during an active state, show a compact sticky
	// status so the customer always knows where things stand. Tapping it scrolls back to the card —
	// it never duplicates the card's action buttons (avoids confusing double CTAs).
	let cardEl = $state<HTMLElement | null>(null);
	let cardVisible = $state(true);
	let observer: IntersectionObserver | null = null;

	// Preparing = paid, number being fetched. Waiting = number in hand, awaiting the code.
	const isPreparing = $derived(
		['pending', 'renting', 'preparing'].includes(status) ||
			(status === 'awaiting_sms' && !phoneNumber)
	);
	const isWaiting = $derived(status === 'awaiting_sms' && Boolean(phoneNumber));
	const isReceived = $derived(status === 'received');
	const isRefunded = $derived(
		status === 'refunded' || status === 'cancelled' || status === 'expired'
	);

	// The ~120s is a REPLACEMENT-eligibility rule, not a delivery ETA — so we never render it as a
	// filling bar/countdown (that makes a 30–60s wait feel like a 2-minute ordeal). We only use it to
	// decide when to offer another number. `keepWaiting` lets the customer dismiss that offer and stay.
	const showTryAnother = $derived(
		isWaiting && requestedAt != null && now - requestedAt >= EXPECTED_CODE_MS
	);
	let keepWaiting = $state(false);
	const offerSwitch = $derived(showTryAnother && !keepWaiting && !retrying);

	// Mobile sticky mini-status (shown only when the card is scrolled out of view during an active
	// state). Status text only — tapping scrolls back to the card, never duplicates its buttons.
	const showSticky = $derived(!cardVisible && (isPreparing || isWaiting));
	const stickyStatus = $derived(
		isPreparing
			? 'Getting your number…'
			: isWaiting && !requestedAt
				? 'Number ready · request your code'
				: offerSwitch
					? 'No code yet? · tap to switch'
					: 'Waiting for your code · checking automatically'
	);
	function scrollToCard() {
		cardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// "Try another number" after a refund → re-buy this exact service+country straight to checkout
	// (one number per order, so reset the cart first). Falls back to the storefront if we lack the tier.
	function buyAnother() {
		if (!phone.tierId) {
			goto('/numbers');
			return;
		}
		cart.clear();
		cart.addTier(phone.tierId, 1);
		goto('/checkout');
	}

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

	async function requestCode() {
		if (requestMuted || markingRequested) return;
		markingRequested = true;
		try {
			const response = await fetch(`/api/numbers/${phone.orderItemId}/requested`, {
				method: 'POST'
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok || !data?.ok || !data?.otpRequestedAt) {
				throw new Error(data?.error || 'Could not confirm your request.');
			}
			requestedAt = new Date(data.otpRequestedAt).getTime();
		} catch (error) {
			showError(
				'Could not start the code check',
				error instanceof Error ? error.message : 'Please try again.'
			);
		} finally {
			markingRequested = false;
		}
	}

	async function tryAnother() {
		if (retrying) return;
		replacingNumber = phoneNumber;
		freshNumberVisible = false;
		retrying = true;
		try {
			const res = await fetch(`/api/numbers/${phone.orderItemId}/retry`, { method: 'POST' });
			const data = await res.json();
			if (data.status === 'awaiting_sms') {
				revealFreshNumber(data.phoneNumber, true);
				status = 'awaiting_sms';
				requestedAt = null; // re-request on the fresh number
				keepWaiting = false;
				numberShownAt = null; // re-mute the request button for the fresh number
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
			replacingNumber = null;
		}
	}

	async function poll() {
		try {
			const res = await fetch(`/api/numbers/${phone.orderItemId}/sms`);
			if (!res.ok) return;
			const data = await res.json();
			if (data.phoneNumber) revealFreshNumber(data.phoneNumber, Boolean(replacingNumber));
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

	async function confirmCancel() {
		if (cancelling) return;
		cancelling = true;
		try {
			const res = await fetch(`/api/numbers/${phone.orderItemId}/cancel`, { method: 'POST' });
			const data = await res.json();
			if (data.outcome === 'refunded') {
				status = 'refunded';
				cancelledByUser = true;
				refundMessage = null; // let the refund card render its own calm copy + exact amount
				showCancelModal = false;
				stopPolling();
			} else if (data.outcome === 'received') {
				status = 'received';
				showCancelModal = false;
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
		const handleVisibility = () => {
			if (document.visibilityState === 'hidden' && isWaiting && !requestedAt) {
				leftToRequestCode = true;
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		clockTimer = setInterval(() => (now = Date.now()), 1000);
		if (ACTIVE.includes(status)) {
			poll();
			pollTimer = setInterval(poll, 3000);
		}
		if (cardEl && typeof IntersectionObserver !== 'undefined') {
			observer = new IntersectionObserver(([entry]) => (cardVisible = entry.isIntersecting), {
				threshold: 0
			});
			observer.observe(cardEl);
		}
		return () => document.removeEventListener('visibilitychange', handleVisibility);
	});
	onDestroy(() => {
		stopPolling();
		if (clockTimer) clearInterval(clockTimer);
		if (freshNumberTimer) clearTimeout(freshNumberTimer);
		observer?.disconnect();
	});
</script>

<div
	bind:this={cardEl}
	class="mb-6 rounded-2xl p-6"
	style="border: 1px solid var(--border); background: var(--surface);"
>
	<div class="mb-4 flex items-center gap-2.5">
		<span
			class="flex h-9 w-9 items-center justify-center rounded-lg"
			style="background: var(--bg-elev-1);"
		>
			<BrandIcon service={phone.serviceName} size={22} />
		</span>
		<h3 class="text-lg font-semibold" style="color: var(--text);">
			{phone.serviceName} — {phone.countryName}
		</h3>
	</div>

	{#if retrying && replacingNumber}
		<div
			class="number-panel number-panel--retired mb-4 flex items-center justify-between rounded-lg px-4 py-3"
		>
			<div>
				<div class="text-xs" style="color: var(--text-dim);">Previous number · replacing</div>
				<div
					class="font-mono text-lg font-semibold tracking-wide line-through"
					style="color: var(--text-dim);"
				>
					{replacingNumber}
				</div>
			</div>
			<span class="text-xs font-semibold" style="color: var(--status-warning);">Do not use</span>
		</div>
	{:else if phoneNumber}
		<div
			class:number-panel--fresh={freshNumberVisible}
			class="number-panel mb-4 flex items-center justify-between rounded-lg px-4 py-3"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div>
				<div
					class="text-xs"
					style="color: {freshNumberVisible ? 'var(--status-success)' : 'var(--text-muted)'};"
				>
					{freshNumberVisible ? 'New number ready' : 'Your number'}
				</div>
				<div class="font-mono text-xl font-semibold tracking-wide" style="color: var(--text);">
					{phoneNumber}
				</div>
			</div>
			<button
				onclick={() => copy(phoneNumber ?? '', 'Number')}
				class="inline-flex items-center gap-1 text-sm hover:underline"
				style="color: {copiedLabel === 'Number' ? '#34d399' : '#38bdf8'};"
			>
				{#if copiedLabel === 'Number'}
					<Check class="h-4 w-4" /> Copied
				{:else}
					<Copy class="h-4 w-4" /> Copy
				{/if}
			</button>
		</div>
	{/if}

	{#if isReceived}
		<div
			class="rounded-lg px-4 py-4 text-center"
			style="border: 1px solid #34d399; background: rgba(16,185,129,0.10);"
		>
			<div class="mb-1 flex items-center justify-center gap-1 text-xs" style="color: #34d399;">
				<ShieldCheck class="h-4 w-4" /> Your code arrived
			</div>
			{#if otp}
				<button
					onclick={() => copy(otp ?? '', 'Code')}
					class="font-mono text-3xl font-bold tracking-widest hover:opacity-80"
					style="color: #34d399;"
					title="Copy code"
				>
					{otp}
				</button>
				<div class="mt-1 text-xs" style="color: var(--text-muted);">
					{copiedLabel === 'Code' ? 'Copied' : 'Tap the code to copy'}
				</div>
				{#if smsMessage}
					<div class="mt-2 text-xs" style="color: var(--text-muted);">{smsMessage}</div>
				{/if}
			{:else if smsMessage}
				<div
					class="mt-2 rounded-lg px-3 py-2 text-sm"
					style="background: var(--surface); color: var(--text);"
				>
					{smsMessage}
				</div>
				<div class="mt-1 text-xs" style="color: var(--text-muted);">
					The service sent a message without a separate numeric code.
				</div>
			{:else}
				<div class="mt-2 text-sm" style="color: var(--text-muted);">
					Message received. Refreshing the details…
				</div>
			{/if}
		</div>
	{:else if isPreparing}
		<div
			class="rounded-lg px-4 py-4 text-center"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="mb-2 inline-flex items-center gap-1 text-xs" style="color: #34d399;">
				<ShieldCheck class="h-3.5 w-3.5" /> Payment confirmed
			</div>
			<div class="inline-flex items-center gap-2" style="color: var(--text);">
				<RefreshCw class="h-4 w-4 animate-spin" style="color: #38bdf8;" />
				Getting your number
			</div>
			<div class="mt-2 mb-3 text-xs" style="color: var(--text-dim);">
				{securingMessage}
			</div>
			<div class="soda-track"><div class="soda-fill soda-fill-indeterminate"></div></div>
		</div>
	{:else if isWaiting}
		<div
			class="rounded-lg px-4 py-4"
			style="border: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			{#if !requestedAt}
				<!-- Number in hand — a clear 3-step workflow, then request-code (muted briefly). -->
				<ol class="mb-4 space-y-2 text-sm" style="color: var(--text);">
					<li class="flex gap-2">
						<span class="font-semibold" style="color: #38bdf8;">1</span> Copy the number above.
					</li>
					<li class="flex gap-2">
						<span class="font-semibold" style="color: #38bdf8;">2</span> Enter it in {phone.serviceName}
						and request the SMS code.
					</li>
					<li class="flex gap-2">
						<span class="font-semibold" style="color: #38bdf8;">3</span> Come back here — your code appears
						automatically.
					</li>
				</ol>
				<div class="flex flex-col items-center gap-1.5">
					<button
						onclick={requestCode}
						disabled={requestMuted || markingRequested}
						class="soda-cta"
					>
						{markingRequested ? 'Starting code check…' : '✓ I’ve requested the code'}
					</button>
					{#if requestMuted}
						<span class="text-xs" style="color: var(--text-dim);">
							Open {phone.serviceName} and request the SMS first · ready here in {requestNudgeSeconds}s
						</span>
					{:else}
						<span class="text-xs" style="color: var(--text-dim);">
							Tap only after {phone.serviceName} says the code was sent
						</span>
					{/if}
				</div>
			{:else if offerSwitch}
				<!-- ≥120s, no code — a calm recovery CHOICE, not an error/countdown. -->
				<div class="mb-1 text-center text-sm" style="color: var(--text);">No code yet?</div>
				<div class="mb-4 text-center text-xs" style="color: var(--text-dim);">
					We can switch you to another number at no extra charge.
				</div>
				<div class="flex flex-col items-center gap-2">
					<button onclick={tryAnother} disabled={retrying} class="soda-cta"
						>Use another number</button
					>
					<button
						onclick={() => (keepWaiting = true)}
						class="text-xs hover:underline"
						style="color: var(--text-muted);"
					>
						Keep waiting
					</button>
					{#if canCancel}
						<button
							onclick={() => (showCancelModal = true)}
							class="text-xs hover:underline"
							style="color: var(--text-dim);"
						>
							Cancel &amp; refund instead
						</button>
					{/if}
				</div>
			{:else}
				<!-- Calm active waiting (and the "switching…" state during a replacement). A continuous
				     activity indicator — never a filling bar tied to the 120s rule. -->
				<div
					class="mb-1 flex items-center justify-center gap-2 text-sm"
					style="color: var(--text);"
				>
					<RefreshCw class="h-4 w-4 animate-spin" style="color: #38bdf8;" />
					{retrying ? 'Getting another number…' : 'Waiting for your code'}
				</div>
				<div class="mb-3 text-center text-xs" style="color: var(--text-dim);">
					{#if retrying}
						No extra charge. We’ll update this page when it’s ready.
					{:else}
						Checking automatically… · No need to refresh.
					{/if}
				</div>
				<div class="soda-track"><div class="soda-fill soda-fill-indeterminate"></div></div>
				{#if showTryAnother && keepWaiting && !retrying}
					<div class="mt-3 text-center text-xs" style="color: var(--text-dim);">
						Still no code?
						<button
							onclick={() => (keepWaiting = false)}
							class="hover:underline"
							style="color: #38bdf8;"
						>
							Use another number
						</button>
					</div>
				{:else if !retrying}
					<div class="mt-3 text-center text-xs" style="color: var(--text-dim);">
						No code? We’ll switch you to another number or refund your store credit — automatically.
					</div>
				{/if}
			{/if}
		</div>
	{:else if isRefunded}
		<div
			class="rounded-lg px-4 py-5 text-center"
			style="border: 1px solid rgba(52,211,153,0.4); background: rgba(52,211,153,0.06);"
		>
			<div class="mb-1 inline-flex items-center gap-2" style="color: #34d399;">
				<ShieldCheck class="h-5 w-5" />
				<span class="font-semibold"
					>{cancelledByUser ? 'Cancelled — refund complete' : 'Refund complete'}</span
				>
			</div>
			<div class="text-sm" style="color: var(--text-muted);">
				{refundMessage ??
					(cancelledByUser
						? 'You cancelled this number and your payment is back in your store credit.'
						: 'No code arrived, so your payment is back in your store credit.')}
			</div>
			{#if phone.saleAmountNgn}
				<div class="mt-1 text-xs" style="color: var(--text-dim);">
					₦{phone.saleAmountNgn.toLocaleString()} in your store credit — ready to use now.
				</div>
			{/if}
			<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
				<button onclick={buyAnother} class="soda-cta">Try another number</button>
				<a href="/dashboard" class="text-xs hover:underline" style="color: var(--text-muted);"
					>View balance</a
				>
			</div>
		</div>
	{/if}
</div>

<ConfirmModal
	isOpen={showCancelModal}
	onClose={() => (showCancelModal = false)}
	onConfirm={confirmCancel}
	title="Cancel this number?"
	message={`If no code has arrived, we’ll return ${phone.saleAmountNgn ? '₦' + phone.saleAmountNgn.toLocaleString() : 'your payment'} to your store credit.`}
	confirmText="Cancel & refund"
	cancelText="Keep waiting"
	isDestructive={true}
	isLoading={cancelling}
/>

<!-- Mobile sticky mini-status: only when the live card is off-screen during an active state. -->
{#if showSticky}
	<button
		onclick={scrollToCard}
		class="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium sm:hidden"
		style="background: var(--bg-elev-1); border-top: 1px solid var(--border); color: var(--text); box-shadow: 0 -4px 16px rgba(0,0,0,0.25);"
	>
		<RefreshCw class="h-4 w-4 animate-spin" style="color: #38bdf8;" />
		{stickyStatus}
	</button>
{/if}

<style>
	.number-panel {
		transition:
			border-color 180ms ease,
			background-color 180ms ease,
			box-shadow 220ms ease,
			opacity 180ms ease;
	}
	.number-panel--retired {
		border: 1px dashed var(--border-2);
		background: rgba(255, 255, 255, 0.025);
		opacity: 0.72;
	}
	.number-panel--fresh {
		border-color: var(--status-success) !important;
		background: var(--status-success-bg) !important;
		box-shadow: 0 0 0 3px rgba(5, 212, 113, 0.12);
	}

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
		transition:
			transform 0.1s ease,
			filter 0.1s ease;
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
