<script lang="ts">
	import type { BoostingProgress } from '$lib/helpers/boosting-progress';

	// One boost's delivery at a glance: the supplier's reported count, a filling bar and the step it is on.
	// The numbers are what the supplier reports, so the card says so rather than claiming a verified count.
	let { progress, quantityLabel }: { progress: BoostingProgress; quantityLabel?: string | null } =
		$props();

	const done = $derived(progress.status === 'completed');
	const delivered = $derived(done ? progress.quantity : progress.reportedDelivered);
	const percent = $derived(
		delivered === null || progress.quantity <= 0
			? null
			: Math.round((Math.min(delivered, progress.quantity) / progress.quantity) * 100)
	);
	const started = $derived(
		done ||
			(delivered ?? 0) > 0 ||
			['in_progress', 'partial', 'under_review'].includes(progress.status)
	);
	const steps = ['Paid', 'Started', 'Delivering', 'Done'];
	// Steps before this index are finished; this one is happening now.
	const current = $derived(done ? steps.length : started ? 2 : 1);
	const total = $derived(quantityLabel || progress.quantity.toLocaleString('en-NG'));

	// The bar fills from empty when the card first appears, then follows each new report.
	let filled = $state(0);
	$effect(() => {
		const target = done ? 100 : (percent ?? 0);
		const frame = requestAnimationFrame(() => (filled = target));
		return () => cancelAnimationFrame(frame);
	});

	const watTime = (value: string) =>
		new Date(value).toLocaleTimeString('en-NG', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'Africa/Lagos'
		});
	const meta = $derived(
		[
			progress.lastCheckedAt && `Updated ${watTime(progress.lastCheckedAt)} WAT`,
			!done &&
				progress.nextCheckAt &&
				new Date(progress.nextCheckAt).getTime() > Date.now() &&
				`Next check around ${watTime(progress.nextCheckAt)} WAT`
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="delivery" class:delivery--done={done}>
	<div class="delivery__count">
		{#if delivered !== null}
			<p>
				<strong>{delivered.toLocaleString('en-NG')}</strong>
				<span>of {total}</span>
			</p>
			<span class="delivery__percent">{percent}%</span>
		{:else}
			<p><span>{started ? 'Started. Numbers appear here soon.' : 'Waiting to start.'}</span></p>
		{/if}
	</div>

	{#if percent !== null || done}
		<div
			class="delivery__track"
			role="progressbar"
			aria-label="Delivered so far"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={done ? 100 : percent}
		>
			<span class="delivery__fill" class:delivery__fill--moving={!done} style="width: {filled}%"
			></span>
		</div>
	{:else}
		<div class="delivery__track" role="progressbar" aria-label="Waiting for delivery numbers">
			<span class="delivery__waiting"></span>
		</div>
	{/if}

	<ol class="delivery__steps" aria-label="Delivery steps">
		{#each steps as step, index (step)}
			<li
				class:is-done={index < current}
				class:is-now={index === current}
				aria-current={index === current ? 'step' : undefined}
			>
				<span class="dot" aria-hidden="true"></span>{step}
			</li>
		{/each}
	</ol>

	{#if meta}
		<p class="delivery__meta">{meta}</p>
	{/if}
	{#if delivered !== null}
		<p class="delivery__meta delivery__note">
			{done ? '' : 'Counts reported by our supplier. '}Real-time counts on the app may differ.
		</p>
	{/if}
</div>

<style>
	.delivery {
		--fill: var(--stage-progress);
		display: grid;
		gap: 0.6rem;
	}
	.delivery--done {
		--fill: var(--status-success);
	}
	.delivery__count {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.delivery__count p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.delivery__count strong {
		color: var(--text);
		font-family: var(--font-head);
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1;
	}
	.delivery__percent {
		color: var(--fill);
		font-family: var(--font-head);
		font-size: 1rem;
		font-weight: 700;
	}
	.delivery__track {
		position: relative;
		height: 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fill) 16%, transparent);
		overflow: hidden;
	}
	.delivery__fill {
		position: relative;
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--fill);
		transition: width 900ms cubic-bezier(0.22, 1, 0.36, 1);
		overflow: hidden;
	}
	/* A soft light passing along the filled part while delivery is still running. */
	.delivery__fill--moving::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.45) 50%,
			transparent 100%
		);
		transform: translateX(-100%);
		animation: sheen 2.2s ease-in-out infinite;
	}
	.delivery__waiting {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 35%;
		border-radius: inherit;
		background: var(--fill);
		opacity: 0.55;
		animation: waiting 1.6s ease-in-out infinite;
	}
	.delivery__steps {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-dim);
		font-size: 0.75rem;
	}
	.delivery__steps li {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}
	.delivery__steps .dot {
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		border: 1.5px solid currentColor;
	}
	.delivery__steps .is-done {
		color: var(--text-muted);
	}
	.delivery__steps .is-done .dot {
		border-color: var(--fill);
		background: var(--fill);
	}
	/* The step happening now glows, so the eye lands on it first. */
	.delivery__steps .is-now {
		color: var(--fill);
		font-weight: 600;
		text-shadow: 0 0 10px color-mix(in srgb, var(--fill) 55%, transparent);
	}
	.delivery__steps .is-now .dot {
		border-color: var(--fill);
		background: var(--fill);
		box-shadow: 0 0 8px 1px color-mix(in srgb, var(--fill) 75%, transparent);
		animation: glow 1.8s ease-in-out infinite;
	}
	.delivery__meta {
		margin: 0;
		color: var(--text-dim);
		font-size: 0.75rem;
	}
	.delivery__note {
		font-size: 0.6875rem;
	}
	@keyframes sheen {
		to {
			transform: translateX(100%);
		}
	}
	@keyframes waiting {
		from {
			left: -35%;
		}
		to {
			left: 100%;
		}
	}
	@keyframes glow {
		0%,
		100% {
			box-shadow:
				0 0 4px 0 color-mix(in srgb, var(--fill) 55%, transparent),
				0 0 0 0 color-mix(in srgb, var(--fill) 45%, transparent);
		}
		50% {
			box-shadow:
				0 0 12px 3px color-mix(in srgb, var(--fill) 90%, transparent),
				0 0 0 5px transparent;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.delivery__fill {
			transition: none;
		}
		.delivery__fill--moving::after,
		.delivery__waiting,
		.delivery__steps .is-now .dot {
			animation: none;
		}
	}
</style>
