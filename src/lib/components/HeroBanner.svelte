<script lang="ts">
	import { goto } from '$app/navigation';
	import { addToast } from '$lib/stores/toasts';
</script>

<section
	class="px-4 py-12 sm:py-16 lg:py-20"
	style="background: var(--btn-primary-gradient); color: var(--text);"
>
	<div class="mx-auto max-w-6xl text-center">
		<!-- Main Hero Content -->
		<div class="mb-6 sm:mb-8">
			<h1
				class="mb-4 text-2xl leading-tight font-bold sm:text-3xl md:text-4xl"
				style="font-family: var(--font-head); color: var(--text); letter-spacing: -0.03em;"
			>
				Get Premium Social Media Accounts
				<span style="color: var(--fa-lime-400);">Instantly</span>
			</h1>
			<p
				class="mx-auto mb-6 max-w-3xl text-base sm:mb-8 sm:text-lg md:text-xl lg:text-2xl"
				style="font-family: var(--font-body); color: rgba(255,255,255,0.85);"
			>
				Shop social media accounts and growth services with secure checkout and quick delivery
				after payment confirmation.
			</p>
		</div>

		<!-- CTA Buttons -->
		<div class="mb-8 flex flex-col items-center justify-center gap-3 sm:mb-12 sm:flex-row sm:gap-4">
			<button
				class="btn-cta-primary w-full cursor-pointer rounded-full px-6 py-3 text-base font-semibold shadow-lg sm:w-auto sm:px-8"
				onclick={() => goto('/platforms')}
				data-sveltekit-preload-data="hover"
			>
				Browse Accounts
			</button>
			<button
				class="btn-cta-secondary w-full cursor-pointer rounded-full border-2 px-6 py-3 text-base font-semibold sm:w-auto sm:px-8"
				onclick={() => addToast({ type: 'info', title: 'Coming Soon!' })}
			>
				View Growth Services
			</button>
		</div>

		<!-- Trust Indicators -->
		<div class="grid grid-cols-1 gap-6 text-center md:grid-cols-3">
			<div
				class="rounded-lg p-6 backdrop-blur-sm"
				style="background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06)); border: 1px solid rgba(255,255,255,0.18); border-radius: var(--r-md);"
			>
				<div
					class="mb-2 text-3xl font-bold"
					style="color: var(--fa-lime-400); font-family: var(--font-head);"
				>
					Premium
				</div>
				<div style="color: rgba(255,255,255,0.85); font-family: var(--font-body);">
					Quality Accounts
				</div>
			</div>
			<div
				class="rounded-lg p-6 backdrop-blur-sm"
				style="background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06)); border: 1px solid rgba(255,255,255,0.18); border-radius: var(--r-md);"
			>
				<div
					class="mb-2 text-3xl font-bold"
					style="color: var(--fa-lime-400); font-family: var(--font-head);"
				>
					24/7
				</div>
				<div style="color: rgba(255,255,255,0.85); font-family: var(--font-body);">
					Instant Delivery
				</div>
			</div>
			<div
				class="rounded-lg p-6 backdrop-blur-sm"
				style="background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06)); border: 1px solid rgba(255,255,255,0.18); border-radius: var(--r-md);"
			>
				<div
					class="mb-2 text-3xl font-bold"
					style="color: var(--fa-lime-400); font-family: var(--font-head);"
				>
					Secure
				</div>
				<div style="color: rgba(255,255,255,0.85); font-family: var(--font-body);">
					Safe Transactions
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.btn-cta-primary {
		background: var(--fa-lime-700);
		border: 1px solid rgba(202, 219, 46, 0.4);
		color: #04140c;
		font-family: var(--font-body);
		transition: all 180ms ease;
	}
	.btn-cta-primary:hover {
		background: var(--fa-lime-400);
		transform: scale(1.05);
	}
	.btn-cta-primary:active {
		transform: scale(1);
	}
	.btn-cta-secondary {
		border-color: rgba(255, 255, 255, 0.8);
		background: transparent;
		color: var(--text);
		font-family: var(--font-body);
		transition: all 180ms ease;
	}
	.btn-cta-secondary:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 1);
		transform: scale(1.05);
	}
	.btn-cta-secondary:active {
		transform: scale(1);
	}
</style>
