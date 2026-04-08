<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

	onMount(() => {
		if (hasAnalyticsConsent()) {
			window.gtag?.('event', 'page_view', { page_path: '/terms' });
		}
	});
</script>

<svelte:head>
	<title>Terms of Use - FastAccs</title>
	<meta name="description" content="FastAccs terms for using the website and placing orders." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1 class="mb-3 text-4xl font-bold md:text-5xl" style="color: var(--text); font-family: var(--font-head);">
				Terms of Use
			</h1>
			<p style="color: var(--text-muted);">
				Effective date: April 8, 2026
			</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					By accessing FastAccs, creating an account, or completing a purchase, you agree to these Terms,
					our <a href="/refund-policy" class="hover:underline" style="color: var(--link);">Refund Policy</a>,
					<a href="/privacy" class="hover:underline" style="color: var(--link);">Privacy Notice</a>, and
					<a href="/acceptable-use" class="hover:underline" style="color: var(--link);">Acceptable Use Rules</a>.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Service Scope</h2>
				<p>
					FastAccs provides digital products and related growth services. Product availability, delivery windows,
					and support responses may vary based on inventory status, verification checks, and platform conditions.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Account & Purchase Responsibilities</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>Provide accurate order details and keep your account credentials secure.</li>
					<li>Review delivery notes and follow account-specific guidance where provided.</li>
					<li>Report login or delivery issues promptly so support can investigate while records are fresh.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Payments & Verification</h2>
				<p>
					Orders are processed after successful payment verification. We may delay, reject, or cancel an order
					where payment integrity checks fail or fraud risk is detected.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Platform Risk Disclosure</h2>
				<p>
					Third-party platforms may apply independent enforcement actions, security checks, or policy updates.
					Those external decisions are outside FastAccs operational control after successful delivery and access.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Unacceptable Conduct</h2>
				<p>
					Use of the service for fraud, impersonation, harassment, unlawful activity, scams, spam, or other
					unethical conduct is prohibited. Additional details are in our
					<a href="/acceptable-use" class="hover:underline" style="color: var(--link);">Acceptable Use Rules</a>.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Liability & Service Limits</h2>
				<p>
					To the extent permitted by applicable law, FastAccs is not liable for indirect, incidental, or consequential
					losses, and total liability is limited to the amount paid for the affected order.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Updates to Terms</h2>
				<p>
					We may update these Terms periodically. Continued use of FastAccs after updates means acceptance of
					the revised version.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Contact</h2>
				<p>
					Questions about these Terms:
					<a href="mailto:verystronethan@gmail.com" class="hover:underline" style="color: var(--link);">verystronethan@gmail.com</a>
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
