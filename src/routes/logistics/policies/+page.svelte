<script>
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		window.gtag?.('event', 'page_view', { page_path: '/logistics/policies' });
	});
</script>

<svelte:head>
	<title>Policies — FA Logistics</title>
	<meta name="theme-color" content="#07090C" />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-3xl px-6 py-16 md:py-24">
		<div class="mb-12 border-b pb-8 text-center" style="border-color: var(--border);">
			<a href="https://fastaccs.com/logistics/" class="mb-6 inline-block">
				<img src="/static/fa-mark-white-transparent.png" alt="FA Logistics" class="h-12 w-auto" />
			</a>
			<h1
				class="mb-3 text-5xl font-bold md:text-4xl"
				style="color: var(--primary); font-family: var(--font-head);"
			>
				Policies
			</h1>
			<p class="text-lg" style="color: var(--text-muted);">FA Logistics</p>
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
					FA Logistics coordinates delivery of flowers, food, and gifts worldwide. We don't handle
					parcels.
				</p>

				<div class="space-y-4">
					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							How it works
						</h3>
						<p style="color: var(--text-muted);">
							Orders are fulfilled through third-party vendors and delivery partners. Availability
							depends on destination and stock.
						</p>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Substitutions
						</h3>
						<p style="color: var(--text-muted);">
							If the exact item is unavailable, we may propose a similar option of equal value.
							We'll confirm with you where possible.
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

			<!-- DELIVERY -->
			<section class="border-t pt-8" style="border-color: var(--border);">
				<h2
					class="mb-6 text-2xl font-bold md:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Delivery
				</h2>

				<div class="space-y-4">
					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Coverage
						</h3>
						<p style="color: var(--text-muted);">
							We deliver worldwide through partner vendors. Coverage depends on destination city and
							product type.
						</p>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Timelines
						</h3>
						<p style="color: var(--text-muted);">
							Timelines vary by destination and vendor capacity. Express delivery claims apply only
							where confirmed in writing before payment.
						</p>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Confirmation
						</h3>
						<p style="color: var(--text-muted);">
							Depending on destination and vendor, we provide photo proof, tracking, or delivery
							confirmation.
						</p>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Recipient availability
						</h3>
						<p style="color: var(--text-muted);">
							If the recipient is unreachable or refuses delivery, we'll attempt coordination.
							Re-delivery may involve extra fees.
						</p>
					</div>
				</div>

				<div
					class="my-6 border-l-4 p-5"
					style="background: var(--status-warning-bg); border-color: var(--status-warning);"
				>
					<p class="font-semibold" style="color: var(--text);">
						You must provide correct recipient details. Failed delivery due to wrong address/phone
						is not eligible for refund.
					</p>
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
				<p class="mb-6" style="color: var(--text-muted);">
					Refunds are limited and assessed case by case.
				</p>

				<div class="space-y-4">
					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							When approved
						</h3>
						<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
							<li>We delivered the wrong item due to our error</li>
							<li>
								Confirmed non-delivery caused by our process (not recipient issues) and vendor
								resolution fails
							</li>
						</ul>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							When denied
						</h3>
						<ul class="ml-6 space-y-1.5" style="color: var(--text-muted);">
							<li>Recipient unreachable or refuses delivery</li>
							<li>Wrong address or phone number provided</li>
							<li>Perishable items already prepared or dispatched</li>
							<li>
								Third-party conditions outside our control (weather, restrictions, vendor shutdowns)
								— we'll still support resolution
							</li>
						</ul>
					</div>

					<div>
						<h3
							class="mb-2 font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Evidence
						</h3>
						<p style="color: var(--text-muted);">
							We may request screenshots, delivery notes, vendor confirmation, or other proof to
							resolve disputes fairly.
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
					<li>
						We collect: name, email, order details, recipient delivery info, support messages, usage
						data
					</li>
					<li>We share only what's needed with vendors and delivery partners to complete orders</li>
					<li>We don't sell your information</li>
				</ul>
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
