<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<section
	class="px-4 py-12 sm:py-16 lg:py-20"
	style="background: var(--btn-primary-gradient); color: var(--text);"
>
	<div class="mx-auto max-w-6xl text-center">
		<!-- Main Hero Content -->
		<div class="mb-6 sm:mb-8">
			<h1
				class="mb-4 text-3xl leading-tight font-bold sm:text-4xl md:text-5xl"
				style="font-family: var(--font-head); color: #ffffff; letter-spacing: -0.03em;"
			>
				Real social media accounts.
				<span style="color: var(--fa-lime-400);">Delivered fast.</span>
			</h1>
			<p
				class="mx-auto mb-6 max-w-2xl text-base sm:mb-8 sm:text-lg"
				style="font-family: var(--font-body); color: rgba(255,255,255,0.82);"
			>
				Social media accounts, instant verification numbers, and real engagement — full login
				access, instant delivery. Buy one, or in bulk for resale.
			</p>
		</div>

		<!-- CTA Buttons — each glows in its service colour and fills solid on click -->
		<div class="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
			<button
				class="btn-glow w-full cursor-pointer sm:w-auto"
				style="--c: #c2db2e; --tc: #04140c;"
				onclick={() => goto('/platforms')}
				data-sveltekit-preload-data="hover"
			>
				Browse Accounts
			</button>
			<button
				class="btn-glow w-full cursor-pointer sm:w-auto"
				style="--c: #38bdf8; --tc: #06222f;"
				onclick={() => goto('/numbers')}
				data-sveltekit-preload-data="hover"
			>
				Verification Numbers
			</button>
			<button
				class="btn-glow w-full cursor-pointer sm:w-auto"
				style="--c: #a78bfa; --tc: #1c1044;"
				onclick={() => goto('/services')}
			>
				Boosting Services
			</button>
		</div>

		<!-- Trust Bullets -->
		<div class="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
			<div
				class="rounded-xl p-5 backdrop-blur-sm"
				style="background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.16); border-radius: var(--r-md);"
			>
				<div
					class="mb-1 text-2xl font-bold"
					style="color: var(--fa-lime-400); font-family: var(--font-head);"
				>
					Full access
				</div>
				<div style="color: rgba(255,255,255,0.82); font-size: 0.9rem; font-family: var(--font-body);">
					Complete login details on every account
				</div>
			</div>
			<div
				class="rounded-xl p-5 backdrop-blur-sm"
				style="background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.16); border-radius: var(--r-md);"
			>
				<div
					class="mb-1 text-2xl font-bold"
					style="color: var(--fa-lime-400); font-family: var(--font-head);"
				>
					Checked first
				</div>
				<div style="color: rgba(255,255,255,0.82); font-size: 0.9rem; font-family: var(--font-body);">
					Every account reviewed before it's listed
				</div>
			</div>
			<div
				class="rounded-xl p-5 backdrop-blur-sm"
				style="background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.16); border-radius: var(--r-md);"
			>
				<div
					class="mb-1 text-2xl font-bold"
					style="color: var(--fa-lime-400); font-family: var(--font-head);"
				>
					Real support
				</div>
				<div style="color: rgba(255,255,255,0.82); font-size: 0.9rem; font-family: var(--font-body);">
					Message us on WhatsApp if anything's off
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	/* Glowing service buttons. --c = accent colour, --tc = text colour when filled. */
	.btn-glow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0.75rem 2rem;
		border-radius: var(--r-full);
		border: 2px solid var(--c);
		background: transparent;
		color: #ffffff;
		font-family: var(--font-head);
		font-size: 1rem;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		box-shadow:
			0 0 14px -3px var(--c),
			inset 0 0 12px -8px var(--c);
		animation: btn-glow-pulse 2.6s ease-in-out infinite;
		transition:
			background 180ms ease,
			color 180ms ease,
			box-shadow 200ms ease,
			transform 140ms ease;
	}
	.btn-glow:hover {
		background: var(--c);
		color: var(--tc);
		transform: translateY(-2px);
		box-shadow:
			0 0 26px -2px var(--c),
			0 0 8px -1px var(--c);
		animation: none;
	}
	/* On click, snap fully to the colour. */
	.btn-glow:active {
		background: var(--c);
		color: var(--tc);
		transform: scale(0.97);
		box-shadow:
			0 0 34px 0 var(--c),
			inset 0 0 16px -6px rgba(0, 0, 0, 0.25);
		animation: none;
	}
	.btn-glow:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 3px rgba(255, 255, 255, 0.85),
			0 0 22px -1px var(--c);
	}

	@keyframes btn-glow-pulse {
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
		.btn-glow {
			animation: none;
		}
	}
</style>
