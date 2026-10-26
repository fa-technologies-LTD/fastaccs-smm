<script lang="ts">
	import Spotlight from './notify/Spotlight.svelte';
	import { Phone } from '$lib/icons';
	import type { Component } from 'svelte';
	import type { NoticeKind } from '$lib/notify/kinds';

	// Site pop-ups (launches, offers, account news), drawn with the shared Spotlight shell.
	interface Props {
		isOpen: boolean;
		onClose: () => void;
		icon: string;
		title: string;
		body: string;
		bodyItems?: { label: string; href?: string }[];
		ctaText?: string;
		ctaHref?: string;
		secondaryHref?: string;
		secondaryText?: string;
		onItemNavigate?: (href: string) => void;
		/** Overrides the kind's colour (the Numbers blue). */
		accent?: string | null;
		iconKind?: 'emoji' | 'phone';
		kind?: Extract<NoticeKind, 'announcement' | 'promo' | 'info'>;
	}
	let {
		isOpen,
		onClose,
		icon,
		title,
		body,
		bodyItems = [],
		ctaText = 'Got it',
		ctaHref,
		secondaryHref,
		secondaryText,
		onItemNavigate,
		accent = null,
		iconKind = 'emoji',
		kind = 'announcement'
	}: Props = $props();

	// With an accent the link leads and "Got it" becomes the quiet dismiss; otherwise "Got it" leads.
	const leadWithLink = $derived(Boolean(accent && secondaryHref && secondaryText));
</script>

{#if isOpen}
	<Spotlight
		{kind}
		{title}
		{body}
		items={bodyItems}
		{accent}
		emoji={iconKind === 'emoji' ? icon : undefined}
		icon={iconKind === 'phone' ? (Phone as unknown as Component) : undefined}
		primary={leadWithLink
			? { label: secondaryText!, href: secondaryHref }
			: { label: ctaText, href: ctaHref }}
		secondary={!leadWithLink && secondaryHref && secondaryText
			? { label: secondaryText, href: secondaryHref }
			: undefined}
		dismissLabel={leadWithLink ? ctaText : undefined}
		closeLabel="Dismiss"
		{onClose}
		onNavigate={onItemNavigate}
	/>
{/if}
