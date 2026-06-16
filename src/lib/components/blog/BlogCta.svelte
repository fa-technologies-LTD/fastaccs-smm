<script lang="ts">
	interface Props {
		heading: string;
		body: string;
		primaryHref: string;
		primaryLabel: string;
		secondaryHref?: string;
		secondaryLabel?: string;
	}
	let {
		heading,
		body,
		primaryHref,
		primaryLabel,
		secondaryHref,
		secondaryLabel
	}: Props = $props();
</script>

<div class="cta-card">
	<!-- Green top accent bar -->
	<div class="cta-bar"></div>

	<!-- Hex decoration (bottom-right) -->
	<div class="cta-hexes" aria-hidden="true">
		<div class="chex chex-1"></div>
		<div class="chex chex-2"></div>
		<div class="chex chex-3"></div>
	</div>

	<div class="cta-inner">
		<h3 class="cta-heading">{heading}</h3>
		<p class="cta-body">{body}</p>
		<div class="cta-actions">
			<a href={primaryHref} class="btn-fa btn-fa--primary cta-btn-primary">{primaryLabel}</a>
			{#if secondaryHref && secondaryLabel}
				<a href={secondaryHref} class="cta-ghost">{secondaryLabel}</a>
			{/if}
		</div>
	</div>
</div>

<style>
	.cta-card {
		position: relative;
		overflow: hidden;
		margin: 2.5rem 0;
		border-radius: var(--r-lg);
		background: var(--fa-blue-950);
		border: 1px solid rgba(5, 212, 113, 0.18);
		box-shadow:
			0 16px 48px rgba(0, 0, 0, 0.35),
			0 0 0 1px rgba(5, 212, 113, 0.07);
	}

	.cta-bar {
		height: 3px;
		background: linear-gradient(
			90deg,
			var(--fa-green-900) 0%,
			var(--fa-green-500) 50%,
			var(--fa-green-600) 100%
		);
	}

	.cta-inner {
		position: relative;
		z-index: 1;
		padding: 1.75rem 1.75rem 2rem;
	}

	@media (min-width: 768px) {
		.cta-inner {
			padding: 2rem 2.25rem 2.25rem;
		}
	}

	.cta-heading {
		font-family: var(--font-head);
		font-size: 1.1875rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.3;
		color: #ffffff;
		margin-bottom: 0.625rem;
	}

	.cta-body {
		font-size: 0.875rem;
		line-height: 1.65;
		color: rgba(255, 255, 255, 0.58);
		font-family: var(--font-body);
		margin-bottom: 1.5rem;
		max-width: 500px;
	}

	.cta-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}

	.cta-btn-primary {
		font-size: 0.875rem;
		padding: 0.625rem 1.375rem;
		min-height: 40px;
	}

	.cta-ghost {
		display: inline-flex;
		align-items: center;
		padding: 0.625rem 1.375rem;
		min-height: 40px;
		border-radius: var(--r-full);
		border: 1.5px solid rgba(255, 255, 255, 0.18);
		color: rgba(255, 255, 255, 0.68);
		font-family: var(--font-head);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			border-color 160ms ease,
			color 160ms ease,
			background 160ms ease;
	}

	.cta-ghost:hover {
		border-color: rgba(5, 212, 113, 0.5);
		color: var(--fa-green-500);
		background: rgba(5, 212, 113, 0.07);
	}

	/* Hex decoration */
	.cta-hexes {
		position: absolute;
		bottom: -16px;
		right: -8px;
		width: 130px;
		height: 130px;
		pointer-events: none;
		z-index: 0;
	}

	.chex {
		position: absolute;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
	}

	.chex-1 {
		width: 64px;
		height: 72px;
		bottom: 18px;
		right: 22px;
		background: rgba(5, 212, 113, 0.09);
	}
	.chex-2 {
		width: 44px;
		height: 50px;
		bottom: 62px;
		right: 2px;
		background: rgba(5, 212, 113, 0.06);
	}
	.chex-3 {
		width: 34px;
		height: 38px;
		bottom: 8px;
		right: 74px;
		background: rgba(5, 212, 113, 0.04);
	}
</style>
