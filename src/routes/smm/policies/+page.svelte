<script>
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		window.gtag?.('event', 'page_view', { page_path: '/smm/policies' });
	});
</script>

<svelte:head>
	<title>Policies — FastAccs SMM</title>
	<meta name="theme-color" content="#07090C" />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-3xl px-6 py-16 md:py-24">
		<div class="mb-12 border-b pb-8 text-center" style="border-color: var(--border);">
			<a href="https://fastaccs.com" class="mb-6 inline-block">
				<img src="/static/fa-mark-white-transparent.png" alt="FastAccs" class="h-12 w-auto" />
			</a>
			<h1
				class="mb-3 text-5xl font-bold md:text-4xl"
				style="color: var(--primary); font-family: var(--font-head);"
			>
				Policies
			</h1>
			<p class="text-lg" style="color: var(--text-muted);">FastAccs SMM</p>
		</div>

		<div class="space-y-8">
			<!-- TERMS -->
			<section>
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Terms of Service
				</h2>
				<p class="mb-6" style="color: var(--text-muted);">
					FastAccs SMM provides digital products (social media accounts and growth services).
				</p>

				<div class="space-y-4">
					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Your responsibilities
						</h3>
						<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
							<li>Don't use products for spam, fraud, harassment, or illegal activity</li>
							<li>Follow any product-specific rules we provide</li>
							<li>Keep credentials secure</li>
						</ul>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Delivery
						</h3>
						<p style="color: var(--text-muted);">
							We test before delivery. Once you receive credentials and can access what you
							purchased, delivery is complete.
						</p>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Payment verification
						</h3>
						<p style="color: var(--text-muted);">
							We only process verified payments. Fake receipts lead to cancellation and service
							refusal.
						</p>
					</div>
				</div>
			</section>

			<!-- REFUNDS -->
			<section class="border-t pt-8" style="border-color: var(--border);">
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Refunds
				</h2>
				<div
					class="my-5 border-l-4 p-5"
					style="background: var(--status-warning-bg); border-color: var(--status-warning);"
				>
					<p class="font-semibold" style="color: var(--text);">
						Report issues within 2 hours of delivery to qualify.
					</p>
				</div>

				<div class="space-y-4">
					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Valid refund cases
						</h3>
						<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
							<li>Item delivered is materially different from what you purchased</li>
							<li>Access fails due to our error (not user misuse)</li>
							<li>
								Ban/lock happens immediately after login with hard proof and no policy violations on
								your end
							</li>
						</ul>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Refund denials
						</h3>
						<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
							<li>Spam, illicit activity, or policy violations</li>
							<li>Ignored product-specific rules</li>
							<li>Issues from your device, network, VPN, or third-party actions</li>
							<li>Reported after 2-hour window</li>
						</ul>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Proof requirements
						</h3>
						<p style="color: var(--text-muted);">
							We may request screen recordings, screenshots, timestamps, or clarifying questions.
						</p>
					</div>
				</div>
			</section>

			<!-- AFFILIATE -->
			<section class="border-t pt-8" style="border-color: var(--border);">
				<h2
					class="mb-6 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Affiliate Program
				</h2>

				<div class="space-y-4">
					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Commissions
						</h3>
						<p style="color: var(--text-muted);">
							You earn percentage-based commissions via tracked referral codes. Rates and payout
							terms are in your affiliate dashboard.
						</p>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Allowed
						</h3>
						<p style="color: var(--text-muted);">
							Share your tracked link via social media, communities, content, and direct referrals.
						</p>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Prohibited (strict)
						</h3>
						<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
							<li>Impersonating FastAccs or FA Technologies</li>
							<li>Misleading users about pricing, guarantees, or products</li>
							<li>Brand bidding (no ads on our brand name/domain)</li>
							<li>Spam tactics (mass DMs, bots, fake engagement)</li>
						</ul>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Fraud protection
						</h3>
						<p style="color: var(--text-muted);">
							We may withhold payouts or terminate affiliate status for abuse, fake referrals,
							self-referrals, or misleading promotion.
						</p>
					</div>
				</div>
			</section>

			<!-- PRIVACY -->
			<section class="border-t pt-8" style="border-color: var(--border);">
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Privacy
				</h2>
				<p class="mb-4" style="color: var(--text-muted);">
					See our <a href="/privacy" style="color: var(--primary);" class="hover:underline"
						>master privacy policy</a
					> for full details. In short:
				</p>
				<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
					<li>We collect: name, email, purchase info, support messages, usage data</li>
					<li>We don't sell your information</li>
					<li>We share only what's needed with service providers</li>
				</ul>
			</section>

			<!-- COOKIES -->
			<section class="border-t pt-8" style="border-color: var(--border);">
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Cookies
				</h2>
				<p style="color: var(--text-muted);">
					We use cookies to keep the site working and measure traffic with Google Analytics. You can
					control cookies through your browser settings.
				</p>
			</section>

			<!-- CONTACT -->
			<section class="border-t pt-8" style="border-color: var(--border);">
				<h2
					class="mb-3 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Contact
				</h2>
				<p style="color: var(--text-muted);">
					Questions or issues? Email <a
						href="mailto:support@fastaccs.com"
						style="color: var(--primary);"
						class="hover:underline">support@fastaccs.com</a
					>
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
