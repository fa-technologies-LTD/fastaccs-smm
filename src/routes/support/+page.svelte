<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import {
		Mail,
		MessageCircle,
		Phone,
		Clock,
		HelpCircle,
		Send,
		ExternalLink,
		CheckCircle
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';

	let formData = $state({
		name: '',
		email: '',
		subject: '',
		message: ''
	});

	let submitting = $state(false);
	let submitted = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(e: Event) {
		e.preventDefault();

		// Validate
		if (!formData.name || formData.name.length < 2) {
			error = 'Name must be at least 2 characters';
			return;
		}
		if (!formData.email || !formData.email.includes('@')) {
			error = 'Please enter a valid email';
			return;
		}
		if (!formData.subject) {
			error = 'Subject is required';
			return;
		}
		if (!formData.message || formData.message.length < 10) {
			error = 'Message must be at least 10 characters';
			return;
		}

		submitting = true;
		error = null;

		try {
			const response = await fetch('/api/support/ticket', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			if (response.ok) {
				submitted = true;
				formData = { name: '', email: '', subject: '', message: '' };
			} else {
				error = 'Failed to send message. Please try again.';
			}
		} catch (err) {
			error = 'Network error. Please check your connection.';
		} finally {
			submitting = false;
		}
	}

	const faqs = [
		{
			question: 'How long does delivery take?',
			answer:
				'Most orders are delivered instantly to your dashboard. In rare cases, it may take up to a few minutes.'
		},
		{
			question: 'What if my account has issues?',
			answer:
				'Contact our support team immediately via email or live chat. We offer replacements for accounts with technical issues.'
		},
		{
			question: 'Can I get a refund?',
			answer:
				'Refunds are available within 24 hours if the account has not been accessed. Digital products are non-refundable once delivered.'
		},
		{
			question: 'How do I access my purchases?',
			answer:
				'Go to your Dashboard and click on the Purchases tab. All your account details will be listed there.'
		},
		{
			question: 'What payment methods do you accept?',
			answer:
				'We accept wallet top-ups via card, bank transfer, and USSD. All purchases are made through your FastAccs wallet.'
		},
		{
			question: 'Is it safe to buy accounts?',
			answer:
				'Yes! We use secure encryption, verified payment processors, and guarantee account quality. Your privacy and security are our top priorities.'
		},
		{
			question: 'Can I choose a specific account?',
			answer:
				'Accounts are distributed automatically from our inventory to ensure fairness and speed. You receive a quality-checked account instantly.'
		},
		{
			question: 'What about account warranty?',
			answer:
				'All accounts come with a warranty period. If you experience issues within this time, contact support for a replacement.'
		}
	];

	let expandedFaq = $state<number | null>(null);
</script>

<svelte:head>
	<title>Support - FastAccs</title>
	<meta
		name="description"
		content="Get help with your FastAccs account. Contact our 24/7 support team via email, chat, or phone."
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
				Have a question or need assistance? Our support team is available 24/7 to help you with any
				issues or concerns.
			</p>
		</div>
	</section>

	<!-- Contact Methods -->
	<section class="px-4 py-16">
		<div class="mx-auto max-w-6xl">
			<h2
				class="mb-12 text-center text-3xl font-bold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Get in Touch
			</h2>

			<div class="grid gap-8 md:grid-cols-3">
				<!-- Email Support -->
				<div
					class="rounded-xl p-6 transition-all duration-300 hover:shadow-lg"
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
						For detailed issues and account problems
					</p>
					<a
						href="mailto:support@fastaccs.com"
						class="font-medium hover:underline"
						style="color: var(--brand-blue);"
					>
						support@fastaccs.com
					</a>
					<p class="mt-2 text-xs" style="color: var(--text-muted);">
						<Clock class="mr-1 inline h-3 w-3" />
						Response within 24 hours
					</p>
				</div>

				<!-- Live Chat -->
				<div
					class="rounded-xl p-6 transition-all duration-300 hover:shadow-lg"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<div class="mb-4 inline-flex rounded-full p-3" style="background: var(--bg-elev-2);">
						<MessageCircle class="h-6 w-6" style="color: var(--brand-green);" />
					</div>
					<h3
						class="mb-2 text-xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Live Chat
					</h3>
					<p class="mb-4 text-sm" style="color: var(--text-muted);">
						For quick questions and instant help
					</p>
					<button
						class="font-medium hover:underline"
						style="color: var(--brand-green);"
						onclick={() => {
							// TODO: Implement live chat
							alert('Live chat coming soon!');
						}}
					>
						Start Chat
					</button>
					<p class="mt-2 text-xs" style="color: var(--text-muted);">
						<Clock class="mr-1 inline h-3 w-3" />
						Available 24/7
					</p>
				</div>

				<!-- Phone Support -->
				<div
					class="rounded-xl p-6 transition-all duration-300 hover:shadow-lg"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<div class="mb-4 inline-flex rounded-full p-3" style="background: var(--bg-elev-2);">
						<Phone class="h-6 w-6" style="color: var(--brand-purple);" />
					</div>
					<h3
						class="mb-2 text-xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Phone Support
					</h3>
					<p class="mb-4 text-sm" style="color: var(--text-muted);">
						For urgent issues requiring immediate attention
					</p>
					<a
						href="tel:+234XXXXXXXXX"
						class="font-medium hover:underline"
						style="color: var(--brand-purple);"
					>
						+234 XXX XXX XXXX
					</a>
					<p class="mt-2 text-xs" style="color: var(--text-muted);">
						<Clock class="mr-1 inline h-3 w-3" />
						Mon-Fri 9AM-6PM WAT
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Contact Form -->
	<section class="px-4 py-16" style="background: var(--bg-elev-1);">
		<div class="mx-auto max-w-3xl">
			<h2
				class="mb-4 text-center text-3xl font-bold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Send Us a Message
			</h2>
			<p class="mb-12 text-center" style="color: var(--text-muted);">
				Fill out the form below and we'll get back to you as soon as possible.
			</p>

			{#if submitted}
				<div
					class="rounded-xl p-8 text-center"
					style="background: var(--bg-elev-2); border: 1px solid var(--brand-green);"
				>
					<CheckCircle class="mx-auto mb-4 h-16 w-16" style="color: var(--brand-green);" />
					<h3
						class="mb-2 text-2xl font-bold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Message Sent!
					</h3>
					<p style="color: var(--text-muted);">
						Thank you for contacting us. We'll respond to your inquiry within 24 hours.
					</p>
					<button
						onclick={() => (submitted = false)}
						class="mt-6 rounded-lg px-6 py-3 font-semibold transition-opacity hover:opacity-90"
						style="background: var(--btn-primary-gradient); color: white;"
					>
						Send Another Message
					</button>
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="space-y-6">
					<!-- Name -->
					<div>
						<label for="name" class="mb-2 block text-sm font-medium" style="color: var(--text);">
							Name *
						</label>
						<input
							type="text"
							id="name"
							bind:value={formData.name}
							required
							class="w-full rounded-lg px-4 py-3 transition-all focus:ring-2 focus:outline-none"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text); focus:ring-color: var(--brand-blue);"
							placeholder="Your full name"
						/>
					</div>

					<!-- Email -->
					<div>
						<label for="email" class="mb-2 block text-sm font-medium" style="color: var(--text);">
							Email *
						</label>
						<input
							type="email"
							id="email"
							bind:value={formData.email}
							required
							class="w-full rounded-lg px-4 py-3 transition-all focus:ring-2 focus:outline-none"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text); focus:ring-color: var(--brand-blue);"
							placeholder="your.email@example.com"
						/>
					</div>

					<!-- Subject -->
					<div>
						<label for="subject" class="mb-2 block text-sm font-medium" style="color: var(--text);">
							Subject *
						</label>
						<input
							type="text"
							id="subject"
							bind:value={formData.subject}
							required
							class="w-full rounded-lg px-4 py-3 transition-all focus:ring-2 focus:outline-none"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text); focus:ring-color: var(--brand-blue);"
							placeholder="What is this regarding?"
						/>
					</div>

					<!-- Message -->
					<div>
						<label for="message" class="mb-2 block text-sm font-medium" style="color: var(--text);">
							Message *
						</label>
						<textarea
							id="message"
							bind:value={formData.message}
							required
							rows="6"
							class="w-full rounded-lg px-4 py-3 transition-all focus:ring-2 focus:outline-none"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text); focus:ring-color: var(--brand-blue); resize: vertical;"
							placeholder="Please describe your issue or question in detail..."
						></textarea>
					</div>

					<!-- Error Message -->
					{#if error}
						<div
							class="rounded-lg p-4"
							style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgb(239, 68, 68); color: rgb(239, 68, 68);"
						>
							{error}
						</div>
					{/if}

					<!-- Submit Button -->
					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-lg px-6 py-3 font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
						style="background: var(--btn-primary-gradient); color: white;"
					>
						{#if submitting}
							<span class="inline-flex items-center">
								<svg
									class="mr-2 h-5 w-5 animate-spin"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
								Sending...
							</span>
						{:else}
							<Send class="mr-2 inline h-5 w-5" />
							Send Message
						{/if}
					</button>
				</form>
			{/if}
		</div>
	</section>

	<!-- FAQ Section -->
	<section class="px-4 py-16">
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

	<!-- Business Hours -->
	<section class="px-4 py-16">
		<div class="mx-auto max-w-4xl">
			<div
				class="rounded-xl p-8"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2
					class="mb-6 text-center text-2xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Support Hours
				</h2>
				<div class="grid gap-6 md:grid-cols-3">
					<div class="text-center">
						<Mail class="mx-auto mb-2 h-8 w-8" style="color: var(--brand-blue);" />
						<h3 class="mb-1 font-semibold" style="color: var(--text);">Email</h3>
						<p class="text-sm" style="color: var(--text-muted);">24/7 Support</p>
					</div>
					<div class="text-center">
						<MessageCircle class="mx-auto mb-2 h-8 w-8" style="color: var(--brand-green);" />
						<h3 class="mb-1 font-semibold" style="color: var(--text);">Live Chat</h3>
						<p class="text-sm" style="color: var(--text-muted);">24/7 Support</p>
					</div>
					<div class="text-center">
						<Phone class="mx-auto mb-2 h-8 w-8" style="color: var(--brand-purple);" />
						<h3 class="mb-1 font-semibold" style="color: var(--text);">Phone</h3>
						<p class="text-sm" style="color: var(--text-muted);">Mon-Fri, 9AM-6PM WAT</p>
					</div>
				</div>
			</div>
		</div>
	</section>
</main>

<Footer />
