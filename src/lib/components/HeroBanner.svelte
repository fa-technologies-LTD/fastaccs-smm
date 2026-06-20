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
				Buy aged Instagram, TikTok, X, and Facebook accounts — full login access, instant delivery,
				and support included.
			</p>
		</div>

		<!-- CTA Buttons -->
		<div class="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
			<button
				class="btn-hero-primary w-full cursor-pointer sm:w-auto"
				onclick={() => goto('/platforms')}
				data-sveltekit-preload-data="hover"
			>
				Browse Accounts
			</button>
			<button
				class="btn-hero-secondary w-full cursor-pointer sm:w-auto"
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
					Full Details
				</div>
				<div style="color: rgba(255,255,255,0.82); font-size: 0.9rem; font-family: var(--font-body);">
					Complete login handover on every account
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
					Verified Listings
				</div>
				<div style="color: rgba(255,255,255,0.82); font-size: 0.9rem; font-family: var(--font-body);">
					Accounts reviewed before going live
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
					WhatsApp Support
				</div>
				<div style="color: rgba(255,255,255,0.82); font-size: 0.9rem; font-family: var(--font-body);">
					Real support if anything goes wrong
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.btn-hero-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0.75rem 2rem;
		border-radius: var(--r-full);
		border: 1px solid rgba(202, 219, 46, 0.5);
		background: var(--fa-lime-700);
		color: #04140c;
		font-family: var(--font-head);
		font-size: 1rem;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		transition: background 180ms ease, transform 140ms ease;
	}
	.btn-hero-primary:hover {
		background: var(--fa-lime-400);
		transform: translateY(-1px);
	}
	.btn-hero-primary:active {
		transform: scale(0.985);
	}

	.btn-hero-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0.75rem 2rem;
		border-radius: var(--r-full);
		border: 1.5px solid rgba(255, 255, 255, 0.55);
		background: transparent;
		color: #ffffff;
		font-family: var(--font-head);
		font-size: 1rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		transition: background 180ms ease, border-color 180ms ease, transform 140ms ease;
	}
	.btn-hero-secondary:hover {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.85);
		transform: translateY(-1px);
	}
	.btn-hero-secondary:active {
		transform: scale(0.985);
	}
</style>
