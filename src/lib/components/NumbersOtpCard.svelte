<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Phone, Copy, RefreshCw, ShieldCheck, AlertTriangle } from '$lib/icons';
	import { showSuccess } from '$lib/stores/toasts';

	interface PhoneState {
		orderItemId: string;
		serviceName: string;
		countryName: string;
		phoneNumber: string | null;
		status: string;
		otp: string | null;
		smsMessage: string | null;
		expiresAt: string | null;
	}

	let { phone }: { phone: PhoneState } = $props();

	let status = $state(phone.status);
	let phoneNumber = $state(phone.phoneNumber);
	let otp = $state(phone.otp);
	let smsMessage = $state(phone.smsMessage);
	let expiresAt = $state(phone.expiresAt);
	let now = $state(Date.now());

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let clockTimer: ReturnType<typeof setInterval> | null = null;

	const isWaiting = $derived(['pending', 'renting', 'awaiting_sms'].includes(status));
	const isReceived = $derived(status === 'received');
	const isRefunded = $derived(status === 'refunded' || status === 'cancelled' || status === 'expired');

	const secondsLeft = $derived(
		expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : null
	);
	const countdown = $derived(
		secondsLeft == null ? '' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
	);

	async function poll() {
		try {
			const res = await fetch(`/api/numbers/${phone.orderItemId}/sms`);
			if (!res.ok) return;
			const data = await res.json();
			if (data.phoneNumber) phoneNumber = data.phoneNumber;
			if (data.status === 'received') {
				status = 'received';
				otp = data.otp ?? otp;
				smsMessage = data.message ?? smsMessage;
				stopPolling();
			} else if (data.status === 'refunded' || data.status === 'expired') {
				status = data.status;
				stopPolling();
			} else if (data.status === 'awaiting_sms') {
				status = 'awaiting_sms';
				if (data.expiresAt) expiresAt = data.expiresAt;
			}
		} catch {
			/* transient — keep polling */
		}
	}

	function stopPolling() {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
	}

	async function copy(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			showSuccess('Copied', `${label} copied to clipboard.`);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		clockTimer = setInterval(() => (now = Date.now()), 1000);
		if (['pending', 'renting', 'awaiting_sms'].includes(status)) {
			poll();
			pollTimer = setInterval(poll, 3000);
		}
	});
	onDestroy(() => {
		stopPolling();
		if (clockTimer) clearInterval(clockTimer);
	});
</script>

<div class="rounded-2xl border border-sky-200 bg-sky-50/40 p-6 mb-6">
	<div class="flex items-center gap-2 mb-4">
		<Phone class="w-5 h-5 text-sky-600" />
		<h3 class="font-semibold text-lg">{phone.serviceName} — {phone.countryName}</h3>
	</div>

	{#if phoneNumber}
		<div class="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3 mb-4">
			<div>
				<div class="text-xs text-gray-500">Your number</div>
				<div class="text-xl font-mono font-semibold tracking-wide">{phoneNumber}</div>
			</div>
			<button
				onclick={() => copy(phoneNumber ?? '', 'Number')}
				class="inline-flex items-center gap-1 text-sm text-sky-600 hover:underline"
			>
				<Copy class="w-4 h-4" /> Copy
			</button>
		</div>
	{/if}

	{#if isReceived && otp}
		<div class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-4 text-center">
			<div class="text-xs text-emerald-700 mb-1 flex items-center justify-center gap-1">
				<ShieldCheck class="w-4 h-4" /> Your code arrived
			</div>
			<button
				onclick={() => copy(otp ?? '', 'Code')}
				class="text-3xl font-bold font-mono tracking-widest text-emerald-800 hover:opacity-80"
				title="Click to copy"
			>
				{otp}
			</button>
			{#if smsMessage}
				<div class="text-xs text-gray-500 mt-2">{smsMessage}</div>
			{/if}
		</div>
	{:else if isWaiting}
		<div class="rounded-lg bg-white border border-gray-200 px-4 py-4 text-center">
			<div class="inline-flex items-center gap-2 text-gray-600">
				<RefreshCw class="w-4 h-4 animate-spin text-sky-500" />
				Waiting for your code…
			</div>
			{#if countdown}
				<div class="text-xs text-gray-400 mt-1">Expires in {countdown}</div>
			{/if}
			<div class="text-xs text-gray-400 mt-2">
				Use this number now on {phone.serviceName}. Your code appears here automatically.
			</div>
		</div>
	{:else if isRefunded}
		<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-4 text-center text-amber-800">
			<div class="inline-flex items-center gap-2">
				<AlertTriangle class="w-4 h-4" />
				No code arrived — you've been refunded to store credit.
			</div>
		</div>
	{/if}
</div>
