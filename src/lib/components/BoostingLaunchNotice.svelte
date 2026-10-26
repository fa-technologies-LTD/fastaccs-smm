<script lang="ts">
	import Spotlight from './notify/Spotlight.svelte';

	let { onClose, onShown = () => {} }: { onClose: () => void; onShown?: () => void } = $props();
</script>

<Spotlight
	kind="announcement"
	title="Boosting is back."
	body="Pick a service. Place your order. Track it here."
	primary={{ label: 'View services', href: '/services' }}
	dismissLabel="Maybe later"
	closeLabel="Close announcement"
	{onClose}
	{onShown}
/>
