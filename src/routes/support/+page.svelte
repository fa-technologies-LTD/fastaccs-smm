<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import {
		Mail,
		MessageCircle,
		Clock,
		HelpCircle,
		ExternalLink,
		ArrowRight
	} from '@lucide/svelte';

	const faqs = [
		{
			question: 'How long does delivery take?',
			answer:
				'Most orders are delivered instantly to your dashboard. In rare cases, it may take up to a few minutes.'
		},
		{
			question: 'How do I use the 2FA link in my delivery notes?',
			answer:
				'If your account includes 2FA, open the 2FA link from your delivery notes when prompted, copy the latest 6-digit code, and paste it into the login screen. Codes refresh every ~30 seconds, so if one fails, use the next code.'
		},
		{
			question: 'Do I need VPN to log in?',
			answer:
				'For most accounts, your normal connection works best. If your specific account includes different login instructions in your delivery notes, follow those first.'
		},
		{
			question: 'What if my account has login issues?',
			answer:
				'Contact support immediately via WhatsApp or email so we can help quickly.'
		},
		{
			question: 'When should I report login issues?',
			answer:
				'Please test login immediately after delivery. For fastest assistance, report login issues within 2 hours of purchase.'
		},
		{
			question: 'Why can X follower count change after delivery?',
			answer:
				'Small follower movement can happen due to routine platform cleanups. Delivery counts are checked at handoff.'
		},
		{
			question: 'How do I access my purchases?',
			answer:
				'Go to your Dashboard and click on the Purchases tab. Your delivered account details will be listed there.'
		},
		{
			question: 'What payment methods do you accept?',
			answer:
				'Payments are processed securely via Monnify. Available channels can include card, bank transfer, and USSD based on current Monnify availability.'
		},
		{
			question: 'Can I choose a specific account?',
			answer:
				'Accounts are distributed automatically from our inventory to keep delivery fair and fast.'
		},
		{
			question: 'Can I get a refund?',
			answer:
				'Refund eligibility depends on order state and policy terms. If you run into an issue, contact support quickly so we can review and assist.'
		}
	];

	const afterPurchaseGuide = [
		{
			title: 'Quick 2FA Login',
			points: [
				'Open the 2FA link in your delivery notes when prompted for a code.',
				'Copy the current 6-digit code and paste it into the login screen.',
				'If a code fails, wait for refresh and try the next code.'
			]
		},
		{
			title: 'First Steps for Instagram and X',
			points: [
				'Use the same device for the first 24-48 hours where possible.',
				'Make profile and security updates gradually.',
				'Keep early activity natural before heavy edits.'
			]
		},
		{
			title: 'Follower Fluctuation on X',
			points: [
				'Minor follower movement can happen after delivery.',
				'This is usually related to platform-side cleanup cycles.',
				'Your delivered count is checked at handoff.'
			]
		},
		{
			title: 'Security Basics',
			points: [
				'Secure your recovery email first.',
				'Keep credentials private and avoid sharing logins.',
				'Avoid rapid security changes right after first login.'
			]
		},
		{
			title: 'Support Timing',
			points: [
				'Test login as soon as your order is delivered.',
				'Report login issues quickly for the best support outcome.',
				'For fastest help, message us within 2 hours of purchase.'
			]
		},
		{
			title: 'Platform-Specific Notes',
			points: [
				'If your delivery notes include account-specific instructions, follow those first.',
				'When delivery notes differ from general tips, delivery notes take priority.',
				'If anything is unclear, contact support before making major changes.'
			]
		}
	];

	let expandedFaq = $state<number | null>(null);
</script>

<svelte:head>
	<title>Support - FastAccs</title>
	<meta
		name="description"
		content="Get help with your FastAccs account through WhatsApp support, email, and our help center FAQs."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background: var(--bg);">
	<!-- Hero Section -->
	<section class="px-4 py-16 text-white" style="background: var(--btn-primary-gradient);">
		<div class="mx-auto max-w-6xl text-center">
			<h1 class="mb-4 text-4xl font-bold md:text-5xl" style="font-family: var(--font-head);">
				We're Here to Help
			</h1>
			<p class="mx-auto max-w-2xl text-lg text-green-100 md:text-xl">
				Have a question or need assistance? Our support team can help with orders, payments, and
				account-related issues.
			</p>
		</div>
	</section>

	<!-- Contact Methods -->
	<section id="contact" class="px-4 py-16">
		<div class="mx-auto max-w-6xl">
			<h2
				class="mb-12 text-center text-3xl font-bold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Get in Touch
			</h2>

			<div class="grid gap-6 md:grid-cols-3">
				<!-- WhatsApp Support -->
				<a
					href="https://wa.link/fast_accounts"
					target="_blank"
					rel="noopener noreferrer"
					class="support-contact-card group rounded-xl p-6"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<div class="mb-4 inline-flex rounded-full p-3" style="background: var(--bg-elev-2);">
						<MessageCircle class="h-6 w-6" style="color: var(--brand-green);" />
					</div>
					<h3
						class="mb-2 text-xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						WhatsApp Support
					</h3>
					<p class="mb-4 text-sm" style="color: var(--text-muted);">
						Fastest way to reach us for account and order issues
					</p>
					<p class="font-medium" style="color: var(--brand-green);">
						Chat on WhatsApp
					</p>
					<p class="mt-2 text-xs" style="color: var(--text-muted);">
						<Clock class="mr-1 inline h-3 w-3" />
						Quick-response support channel
					</p>
					<span class="support-hover-arrow" aria-hidden="true">
						<ArrowRight class="h-4 w-4" />
					</span>
				</a>

				<!-- Email Support -->
				<a
					href="mailto:verystronethan@gmail.com"
					class="support-contact-card group rounded-xl p-6"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<div class="mb-4 inline-flex rounded-full p-3" style="background: var(--bg-elev-2);">
						<Mail class="h-6 w-6" style="color: var(--brand-blue);" />
					</div>
					<h3
						class="mb-2 text-xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Email Support
					</h3>
					<p class="mb-4 text-sm" style="color: var(--text-muted);">
						Best for detailed reports and follow-ups
					</p>
					<p class="font-medium" style="color: var(--brand-blue);">
						Support Email
					</p>
					<p class="mt-2 text-xs" style="color: var(--text-muted);">
						<Clock class="mr-1 inline h-3 w-3" />
						Response within 24 hours
					</p>
					<span class="support-hover-arrow" aria-hidden="true">
						<ArrowRight class="h-4 w-4" />
					</span>
				</a>

				<!-- Help Center -->
				<a
					href="/support#faq"
					class="support-contact-card group rounded-xl p-6"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<div class="mb-4 inline-flex rounded-full p-3" style="background: var(--bg-elev-2);">
						<HelpCircle class="h-6 w-6" style="color: var(--brand-purple);" />
					</div>
					<h3
						class="mb-2 text-xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Help Center
					</h3>
					<p class="mb-4 text-sm" style="color: var(--text-muted);">
						Check answers for payments, login, and order flow
					</p>
					<p class="font-medium" style="color: var(--brand-purple);">
						View FAQs
					</p>
					<p class="mt-2 text-xs" style="color: var(--text-muted);">
						<Clock class="mr-1 inline h-3 w-3" />
						Always available
					</p>
					<span class="support-hover-arrow" aria-hidden="true">
						<ArrowRight class="h-4 w-4" />
					</span>
				</a>
			</div>
		</div>
	</section>

	<!-- FAQ Section -->
	<section id="faq" class="px-4 py-16">
		<div class="mx-auto max-w-4xl">
			<h2
				class="mb-4 text-center text-3xl font-bold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Frequently Asked Questions
			</h2>
			<p class="mb-12 text-center" style="color: var(--text-muted);">
				Find quick answers to common questions. Can't find what you're looking for? Contact us!
			</p>
			<p class="mb-8 text-center text-sm" style="color: var(--text-muted);">
				Need post-delivery usage tips?
				<a href="/support#after-purchase-guide" class="font-medium hover:underline" style="color: var(--link);"
					>Jump to After Purchase Guide</a
				>
			</p>

			<div class="space-y-4">
				{#each faqs as faq, i}
					<div
						class="overflow-hidden rounded-xl transition-all"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<button
							onclick={() => (expandedFaq = expandedFaq === i ? null : i)}
							class="flex w-full items-center justify-between p-6 text-left transition-colors"
							style="color: var(--text);"
						>
							<span class="flex items-center font-semibold">
								<HelpCircle class="mr-3 h-5 w-5 flex-shrink-0" style="color: var(--brand-blue);" />
								{faq.question}
							</span>
							<svg
								class="h-5 w-5 flex-shrink-0 transition-transform {expandedFaq === i
									? 'rotate-180'
									: ''}"
								style="color: var(--text-muted);"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</button>
						{#if expandedFaq === i}
							<div
								class="px-6 pb-6"
								style="color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 1.5rem;"
							>
								{faq.answer}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- After Purchase Guide -->
	<section id="after-purchase-guide" class="px-4 py-16" style="background: var(--bg-elev-1);">
		<div class="mx-auto max-w-6xl">
			<h2
				class="mb-4 text-center text-3xl font-bold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				After Purchase Guide
			</h2>
			<p class="mx-auto mb-10 max-w-3xl text-center" style="color: var(--text-muted);">
				These quick tips help keep account access smooth after delivery. If your delivery notes include
				account-specific instructions, follow those first.
			</p>

			<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{#each afterPurchaseGuide as card}
					<div
						class="rounded-xl p-6"
						style="background: var(--bg-elev-2); border: 1px solid var(--border);"
					>
						<h3 class="mb-3 text-lg font-semibold" style="color: var(--text);">
							{card.title}
						</h3>
						<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
							{#each card.points as point}
								<li class="flex items-start gap-2">
									<span style="color: var(--brand-green);">•</span>
									<span>{point}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Quick Links -->
	<section class="px-4 py-16" style="background: var(--bg-elev-1);">
		<div class="mx-auto max-w-6xl">
			<h2
				class="mb-12 text-center text-3xl font-bold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Quick Links
			</h2>

			<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
				<a
					href="/dashboard?tab=orders"
					class="group rounded-xl p-6 transition-all hover:shadow-lg"
					style="background: var(--bg-elev-2); border: 1px solid var(--border);"
				>
					<h3
						class="mb-2 font-semibold group-hover:underline"
						style="color: var(--text); font-family: var(--font-head);"
					>
						View Orders
					</h3>
					<p class="text-sm" style="color: var(--text-muted);">
						Check the status of your recent orders
					</p>
					<ExternalLink class="mt-4 h-5 w-5" style="color: var(--brand-blue);" />
				</a>

				<a
					href="/dashboard?tab=purchases"
					class="group rounded-xl p-6 transition-all hover:shadow-lg"
					style="background: var(--bg-elev-2); border: 1px solid var(--border);"
				>
					<h3
						class="mb-2 font-semibold group-hover:underline"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Track Purchase
					</h3>
					<p class="text-sm" style="color: var(--text-muted);">
						Access your purchased account details
					</p>
					<ExternalLink class="mt-4 h-5 w-5" style="color: var(--brand-blue);" />
				</a>

				<a
					href="/dashboard?tab=profile"
					class="group rounded-xl p-6 transition-all hover:shadow-lg"
					style="background: var(--bg-elev-2); border: 1px solid var(--border);"
				>
					<h3
						class="mb-2 font-semibold group-hover:underline"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Manage Account
					</h3>
					<p class="text-sm" style="color: var(--text-muted);">Update your profile and settings</p>
					<ExternalLink class="mt-4 h-5 w-5" style="color: var(--brand-blue);" />
				</a>

				<a
					href="/platforms"
					class="group rounded-xl p-6 transition-all hover:shadow-lg"
					style="background: var(--bg-elev-2); border: 1px solid var(--border);"
				>
					<h3
						class="mb-2 font-semibold group-hover:underline"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Browse Accounts
					</h3>
					<p class="text-sm" style="color: var(--text-muted);">
						Explore available social media accounts
					</p>
					<ExternalLink class="mt-4 h-5 w-5" style="color: var(--brand-blue);" />
				</a>
			</div>
		</div>
	</section>

</main>

<Footer />

<style>
	.support-contact-card {
		position: relative;
		display: block;
		transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
	}

	.support-contact-card:hover {
		border-color: var(--primary) !important;
		box-shadow: var(--glow-primary);
		transform: translateY(-2px);
	}

	.support-hover-arrow {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		color: var(--text-dim);
		opacity: 0;
		transition: opacity 0.2s ease, transform 0.2s ease;
	}

	.support-contact-card:hover .support-hover-arrow {
		opacity: 1;
		transform: translateX(2px);
	}
</style>
