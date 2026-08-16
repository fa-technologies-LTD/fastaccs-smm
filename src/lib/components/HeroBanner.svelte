<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<section class="hero-shell px-4 py-10 sm:py-14 lg:py-16">
	<div class="mx-auto max-w-6xl text-center">
		<h1
			class="mx-auto max-w-4xl text-3xl leading-tight font-bold sm:text-4xl md:text-5xl"
			style="font-family: var(--font-head); color: #ffffff; letter-spacing: -0.03em;"
		>
			Real social media accounts.
			<span style="color: var(--fa-lime-400);">Delivered fast.</span>
		</h1>
		<p
			class="mx-auto mt-4 max-w-2xl text-base sm:text-lg"
			style="font-family: var(--font-body); color: rgba(255,255,255,0.82);"
		>
			Social media accounts, instant verification numbers, and real engagement — full login access,
			instant delivery. Buy one, or in bulk for resale.
		</p>

		<div class="mx-auto mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
			<button
				class="hero-glow-btn w-full"
				style="--c: #c2db2e; --tc: #04140c;"
				onclick={() => goto('/platforms')}
				data-sveltekit-preload-data="hover"
			>
				Browse Accounts
			</button>
			<button
				class="hero-glow-btn w-full"
				style="--c: #38bdf8; --tc: #06222f;"
				onclick={() => goto('/numbers')}
				data-sveltekit-preload-data="hover"
			>
				Verification Numbers
			</button>
			<button
				class="hero-glow-btn w-full"
				style="--c: #a78bfa; --tc: #1c1044;"
				onclick={() => goto('/services')}
			>
				Boosting Services
			</button>
		</div>
	</div>
</section>

<style>
	.hero-shell {
		background:
			radial-gradient(circle at 50% -30%, rgba(238, 255, 78, 0.14), transparent 48%),
			var(--btn-primary-gradient);
	}

	.hero-glow-btn {
		display: inline-flex;
		min-height: 48px;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 2rem;
		border: 2px solid var(--c);
		border-radius: var(--r-full);
		background: transparent;
		color: #ffffff;
		box-shadow:
			0 0 14px -3px var(--c),
			inset 0 0 12px -8px var(--c);
		font-family: var(--font-head);
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		animation: hero-button-glow 2.6s ease-in-out infinite;
		transition:
			background 180ms ease,
			color 180ms ease,
			box-shadow 200ms ease,
			transform 140ms ease;
	}

	.hero-glow-btn:hover {
		background: var(--c);
		color: var(--tc);
		box-shadow:
			0 0 26px -2px var(--c),
			0 0 8px -1px var(--c);
		transform: translateY(-2px);
		animation: none;
	}

	.hero-glow-btn:active {
		background: var(--c);
		color: var(--tc);
		box-shadow:
			0 0 34px 0 var(--c),
			inset 0 0 16px -6px rgba(0, 0, 0, 0.25);
		transform: scale(0.97);
		animation: none;
	}

	.hero-glow-btn:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 3px rgba(255, 255, 255, 0.85),
			0 0 22px -1px var(--c);
	}

	@keyframes hero-button-glow {
		0%,
		100% {
			box-shadow:
				0 0 10px -4px var(--c),
				inset 0 0 10px -8px var(--c);
		}
		50% {
			box-shadow:
				0 0 20px -1px var(--c),
				inset 0 0 12px -6px var(--c);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-glow-btn {
			animation: none;
		}
	}
</style>
