<script lang="ts">
	interface Props {
		expiresAt: Date;
		onExpired?: () => void;
	}

	let { expiresAt, onExpired }: Props = $props();

	let timeRemaining = $state(0);
	let expired = $state(false);

	// Update countdown every second
	function updateCountdown() {
		const now = Date.now();
		const expiry = expiresAt.getTime();
		const remaining = Math.max(0, expiry - now);

		timeRemaining = remaining;

		if (remaining === 0 && !expired) {
			expired = true;
			if (onExpired) {
				onExpired();
			}
		}
	}

	// Format time remaining
	function formatTime(ms: number): string {
		if (ms <= 0) return '00:00';

		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}

	// Start countdown on component mount
	let interval: NodeJS.Timeout;

	$effect(() => {
		updateCountdown();
		interval = setInterval(updateCountdown, 1000);

		return () => {
			if (interval) {
				clearInterval(interval);
			}
		};
	});
</script>

<div class="flex items-center gap-2 text-sm">
	{#if expired}
		<span class="font-medium text-red-600">Expired</span>
	{:else}
		<span class="text-gray-600">Reserved for:</span>
		<span
			class={`font-mono font-semibold ${timeRemaining < 300000 ? 'text-red-600' : 'text-green-600'}`}
		>
			{formatTime(timeRemaining)}
		</span>
	{/if}
</div>
