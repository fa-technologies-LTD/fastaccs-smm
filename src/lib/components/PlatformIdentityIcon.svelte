<script lang="ts">
	import BrandIcon, { brandKey } from '$lib/components/BrandIcon.svelte';
	import { Mail, Package, ShieldCheck } from '$lib/icons';
	import { canonicalizePlatformKey, isPlatformImageUrl } from '$lib/helpers/platformColors';

	let {
		name,
		slug = '',
		imageUrl = null,
		size = 32
	}: { name: string; slug?: string; imageUrl?: unknown; size?: number } = $props();

	let imageFailed = $state(false);
	const identity = $derived(`${name} ${slug}`.trim());
	const officialBrand = $derived(brandKey(identity));
	const platformKey = $derived(canonicalizePlatformKey(identity));
	const customImageUrl = $derived(
		isPlatformImageUrl(imageUrl) && !imageFailed ? imageUrl.trim() : null
	);
	const isMail = $derived(/mail|email/.test(platformKey));
	const isVpn = $derived(/vpn|proxy/.test(platformKey));
</script>

{#if officialBrand}
	<BrandIcon service={identity} {size} />
{:else if isMail}
	<span
		class="identity-icon"
		role="img"
		aria-label={name}
		style={`width:${size}px;height:${size}px;`}
	>
		<Mail {size} aria-hidden="true" />
	</span>
{:else if isVpn}
	<span
		class="identity-icon"
		role="img"
		aria-label={name}
		style={`width:${size}px;height:${size}px;`}
	>
		<ShieldCheck {size} aria-hidden="true" />
	</span>
{:else if customImageUrl}
	<img
		src={customImageUrl}
		alt={name}
		width={size}
		height={size}
		class="object-contain"
		onerror={() => (imageFailed = true)}
	/>
{:else}
	<span
		class="identity-icon"
		role="img"
		aria-label={name}
		style={`width:${size}px;height:${size}px;`}
	>
		<Package {size} aria-hidden="true" />
	</span>
{/if}

<style>
	.identity-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: currentColor;
	}
</style>
