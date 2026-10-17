<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import NumbersOtpDetails from './NumbersOtpDetails.svelte';
	let { phone }: ComponentProps<typeof NumbersOtpDetails> = $props();
</script>

<!-- Each order owns its code, timers, request state and cancel dialog. -->
{#key phone.orderItemId}
	<NumbersOtpDetails {phone} />
{/key}
