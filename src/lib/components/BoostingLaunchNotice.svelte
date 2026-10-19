<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowRight, Zap, X } from '$lib/icons';
	import { lockScroll, unlockScroll } from '$lib/helpers/scroll-lock';

	let { onClose, onShown = () => {} }: { onClose: () => void; onShown?: () => void } = $props();
	let dialog: HTMLDialogElement;

	onMount(() => {
		const previousFocus = document.activeElement;
		dialog.showModal();
		lockScroll();
		onShown();
		return () => {
			dialog.close();
			unlockScroll();
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
		};
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="boosting-back-title"
	aria-describedby="boosting-back-description"
	onclose={onClose}
	onclick={(event) => {
		if (event.target === dialog) onClose();
	}}
	class="launch-notice"
>
	<div class="notice-content">
		<button type="button" class="notice-close" aria-label="Close announcement" onclick={onClose}>
			<X size={20} />
		</button>
		<div class="notice-icon" aria-hidden="true"><Zap size={32} /></div>
		<p class="notice-eyebrow">BACK ON FASTACCS</p>
		<h2 id="boosting-back-title">Boosting is back.</h2>
		<p id="boosting-back-description">
			Explore the available services, choose your quantity, and follow your order in one place.
		</p>
		<a href="/services" class="notice-action" onclick={onClose}>
			Explore Boosting <ArrowRight size={18} aria-hidden="true" />
		</a>
		<button type="button" class="notice-later" onclick={onClose}>Maybe later</button>
	</div>
</dialog>

<style>
	.launch-notice {
		margin: auto;
		padding: 0;
		width: min(440px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		overflow-y: auto;
		border: 1px solid #1ca56666;
		border-radius: 24px;
		background: #0b1210;
		color: #f3f7f5;
		box-shadow: 0 24px 100px #0008;
	}
	.launch-notice::backdrop {
		background: #020806b8;
		backdrop-filter: blur(5px);
	}
	.notice-content {
		position: relative;
		padding: 42px 28px 24px;
		text-align: center;
		background: radial-gradient(ellipse at 50% 0%, #0cd57a24, transparent 65%);
	}
	.notice-close {
		position: absolute;
		top: 12px;
		right: 12px;
		padding: 8px;
		border-radius: 50%;
		color: #afc0b7;
		cursor: pointer;
	}
	.notice-icon {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		margin: 0 auto 24px;
		border: 1px solid #38e49866;
		border-radius: 22px;
		color: #52efa4;
		background: #13bc6920;
		transform: rotate(-6deg);
	}
	.notice-eyebrow {
		margin: 0 0 10px;
		color: #6de6a9;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.17em;
	}
	h2 {
		margin: 0 0 12px;
		font-size: clamp(28px, 6vw, 36px);
		font-weight: 750;
		line-height: 1.15;
		letter-spacing: -0.04em;
	}
	#boosting-back-description {
		margin: 0 auto 28px;
		max-width: 330px;
		color: #b5c1bb;
		font-size: 14px;
		line-height: 1.65;
	}
	.notice-action {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 48px;
		padding: 12px 20px;
		border-radius: 14px;
		background: #21cf7b;
		color: #042313;
		font-size: 14px;
		font-weight: 750;
		text-decoration: none;
	}
	.notice-action:hover {
		background: #4be49a;
	}
	.notice-later {
		min-height: 44px;
		margin-top: 8px;
		padding: 10px 20px;
		color: #b5c1bb;
		font-size: 13px;
		cursor: pointer;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 2px solid #8df9c3;
		outline-offset: 3px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.launch-notice[open] {
			animation: notice-in 0.2s ease-out;
		}
		@keyframes notice-in {
			from {
				opacity: 0;
				transform: translateY(10px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}
	}
</style>
