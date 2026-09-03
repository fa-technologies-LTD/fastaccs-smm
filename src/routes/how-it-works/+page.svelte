<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { Phone, Share2, ShoppingBag, Zap } from '$lib/icons';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';

	type TabId = 'buyer' | 'numbers' | 'boosting' | 'affiliate';
	type Step = {
		title: string;
		description: string;
		details: string[];
		panelTitle: string;
		panelItems: string[];
	};
	type Faq = { question: string; answer: string };
	type Flow = {
		label: string;
		intro: string;
		heading: string;
		subheading: string;
		accent: string;
		tint: string;
		steps: Step[];
		ctaLabel: string;
		ctaHref: string;
		faqs: Faq[];
	};

	const tabs: Array<{ id: TabId; label: string }> = [
		{ id: 'buyer', label: 'Buying Accounts' },
		{ id: 'numbers', label: 'Verification Numbers' },
		{ id: 'boosting', label: 'Boosting Services' },
		{ id: 'affiliate', label: 'Affiliate Programme' }
	];

	const flows: Record<TabId, Flow> = {
		buyer: {
			label: 'Buying accounts',
			intro:
				'See how to choose an account, pay securely, and find the login details in your dashboard.',
			heading: 'Get the account you need in 3 steps',
			subheading: '',
			accent: '#6366f1',
			tint: 'rgba(99, 102, 241, 0.14)',
			steps: [
				{
					title: 'Choose an account',
					description:
						'Browse by platform, then choose the account type and exact profile that fit your need.',
					details: ['Review the listing details', 'Choose one item or buy in bulk'],
					panelTitle: 'Before you buy',
					panelItems: [
						'Platform and account type',
						'Price and available quantity',
						'Included account features'
					]
				},
				{
					title: 'Pay securely',
					description:
						'Add the account to your cart and complete checkout using the payment options shown.',
					details: ['Your order is saved to your account', 'Payment is confirmed before delivery'],
					panelTitle: 'At checkout',
					panelItems: [
						'Review your order',
						'Apply eligible store credit',
						'Complete payment securely'
					]
				},
				{
					title: 'Receive it in your dashboard',
					description:
						'Once payment is confirmed, open the order to see the allocated login details.',
					details: [
						'Your purchase stays in order history',
						'Support is available if something is wrong'
					],
					panelTitle: 'Your order page',
					panelItems: [
						'Account credentials',
						'Order and delivery status',
						'Relevant support guidance'
					]
				}
			],
			ctaLabel: 'Browse accounts',
			ctaHref: '/platforms',
			faqs: [
				{
					question: 'How long does account delivery take?',
					answer:
						'After payment is confirmed, available accounts are allocated and delivered to your order page automatically.'
				},
				{
					question: 'What should I check before buying?',
					answer:
						'Review the platform, account type, included features, price and quantity on the listing before adding it to your cart.'
				},
				{
					question: 'What should I do after delivery?',
					answer:
						'Test the login promptly, keep early activity natural, and make profile or security changes gradually. Contact support quickly if anything looks wrong.'
				},
				{
					question: 'What if an account has a problem?',
					answer:
						'Open the order and contact support with the issue. The team will review it against the listing and refund policy.'
				}
			]
		},
		numbers: {
			label: 'Verification numbers',
			intro:
				'See how to choose a service and country, receive a number, and collect the verification code.',
			heading: 'Receive your verification code in 3 steps',
			subheading:
				'The supplier work stays in the background while your order page shows what to do next.',
			accent: '#0ea5e9',
			tint: 'rgba(14, 165, 233, 0.14)',
			steps: [
				{
					title: 'Choose a service and country',
					description:
						'Open the service you need, such as WhatsApp or Signal, then choose a supported country.',
					details: [
						'Each service stays collapsed until you open it',
						'The current price is shown before checkout'
					],
					panelTitle: 'Your selection',
					panelItems: ['App or website', 'Country', 'Current price']
				},
				{
					title: 'Pay and receive a number',
					description:
						'Complete checkout, then stay on the order page while FastAccs secures a suitable number.',
					details: [
						'The page updates as fulfillment progresses',
						'Copy the newest active number shown'
					],
					panelTitle: 'Getting your number',
					panelItems: [
						'Payment confirmation',
						'Clear progress status',
						'The active number when ready'
					]
				},
				{
					title: 'Request and receive the code',
					description:
						'Enter the number in the selected app, request the code there, and return to the order page.',
					details: [
						'FastAccs checks for the code automatically',
						'Follow any replacement instruction shown'
					],
					panelTitle: 'Code check',
					panelItems: [
						'Request the code in the app',
						'Keep the order page open',
						'Use the code when it appears'
					]
				}
			],
			ctaLabel: 'Get a verification number',
			ctaHref: '/numbers',
			faqs: [
				{
					question: 'What exactly am I buying?',
					answer:
						'You receive temporary access to one number for the selected service and country so you can request one verification code.'
				},
				{
					question: 'Where will my code appear?',
					answer:
						'The order page checks automatically and displays the code when the supplier receives it.'
				},
				{
					question: 'What if the first number does not work?',
					answer:
						'Follow the status and controls on the order page. When a replacement is available, the newest active number is clearly shown there.'
				}
			]
		},
		boosting: {
			label: 'Boosting services',
			intro:
				'See how to choose an engagement service, submit the right public link, and follow delivery.',
			heading: 'Grow an existing account in 3 steps',
			subheading:
				'Choose the result you want, provide the correct link, and track the order from your dashboard.',
			accent: '#8b5cf6',
			tint: 'rgba(139, 92, 246, 0.14)',
			steps: [
				{
					title: 'Choose a service',
					description:
						'Pick the platform, engagement type, and quantity that match the account or post you want to grow.',
					details: ['Pricing updates with your selection', 'Read any service-specific notes'],
					panelTitle: 'Build your order',
					panelItems: [
						'Platform',
						'Followers, likes, views or another service',
						'Quantity and price'
					]
				},
				{
					title: 'Add the link and pay',
					description:
						'Paste the public profile or post link requested, check it carefully, then complete payment.',
					details: [
						'Private or incorrect links can delay delivery',
						'Your order is saved before fulfillment'
					],
					panelTitle: 'Quick link check',
					panelItems: [
						'The profile or post is public',
						'The link opens correctly',
						'The service matches the link'
					]
				},
				{
					title: 'Track delivery',
					description:
						'Open the order from your dashboard to follow its progress until the service is completed.',
					details: [
						'Delivery timing depends on the selected service',
						'Support can review a stalled order'
					],
					panelTitle: 'Order progress',
					panelItems: ['Payment status', 'Fulfillment status', 'Completion update']
				}
			],
			ctaLabel: 'Browse boosting services',
			ctaHref: '/boosting',
			faqs: [
				{
					question: 'Which link should I submit?',
					answer:
						'Use the public profile or post link requested by that service. Open it in a private browser window first to confirm that it works.'
				},
				{
					question: 'How long does delivery take?',
					answer:
						'Timing varies by service and quantity. Your order page shows the current fulfillment status while delivery is in progress.'
				},
				{
					question: 'What if delivery appears to stop?',
					answer:
						'Check the order status first. If it remains stalled beyond the expected window, contact support from the order or help page.'
				}
			]
		},
		affiliate: {
			label: 'Affiliate programme',
			intro:
				'See how to unlock your referral link, help new buyers save, and track eligible Affiliate Cash.',
			heading: 'Share FastAccs. Both of you earn.',
			subheading:
				'Friends save 5% and you earn 5% on each of their first two eligible account orders, up to ₦1,000 per order.',
			accent: '#05d471',
			tint: 'rgba(5, 212, 113, 0.14)',
			steps: [
				{
					title: 'Unlock access',
					description:
						'Complete your first successful purchase. Your referral code and link then appear automatically.',
					details: [
						'No application form for the regular programme',
						'Your link stays in your dashboard'
					],
					panelTitle: 'Your affiliate tools',
					panelItems: ['Personal promo code', 'Referral link', 'Ready-to-share message']
				},
				{
					title: 'Share your link',
					description:
						'Send the link directly or share it on WhatsApp. Eligible new buyers receive the discount automatically.',
					details: [
						'Accounts only; Numbers and Boosting are excluded',
						'The first-touch referral is protected'
					],
					panelTitle: 'The regular offer',
					panelItems: [
						'5% buyer discount',
						'5% affiliate reward',
						'First two eligible account orders'
					]
				},
				{
					title: 'Track and withdraw',
					description:
						'Your dashboard separates pending and available Affiliate Cash and explains what is needed for payout.',
					details: [
						'Rewards become available after the return window',
						'Payout requests are processed on Saturdays'
					],
					panelTitle: 'Your dashboard',
					panelItems: ['Pending and available Cash', 'Referral activity', 'Payout status']
				}
			],
			ctaLabel: 'Open affiliate dashboard',
			ctaHref: '/dashboard?tab=affiliate',
			faqs: [
				{
					question: 'How do affiliate earnings work?',
					answer:
						'Friends save 5% and you earn 5% on their first two retained eligible account orders, up to ₦1,000 per order. Numbers and Boosting are excluded.'
				},
				{
					question: 'When does pending Cash become available?',
					answer:
						'A reward remains pending during the return window. It becomes available after the order remains eligible and retained.'
				},
				{
					question: 'How do I request a payout?',
					answer:
						'Your dashboard shows the current minimum, account-age requirement and bank-detail status. Eligible payout requests are processed on Saturdays.'
				},
				{
					question: 'What happens when an order is refunded?',
					answer:
						'Affiliate Cash is based on retained eligible value. A refund can reduce or reverse the related pending or available reward.'
				}
			]
		}
	};

	const requestedTab = page.url.searchParams.get('tab');
	let selectedTab = $state<TabId>(
		requestedTab === 'numbers' || requestedTab === 'boosting' || requestedTab === 'affiliate'
			? requestedTab
			: 'buyer'
	);
	let flow = $derived(flows[selectedTab]);

	async function selectTab(tab: TabId, smooth = true): Promise<void> {
		selectedTab = tab;
		const url = new URL(page.url);
		url.searchParams.set('tab', tab);
		void goto(`${url.pathname}?${url.searchParams.toString()}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});

		await tick();
		document.querySelector(`[data-how-tab="${tab}"]`)?.scrollIntoView({
			behavior: smooth ? 'smooth' : 'auto',
			block: 'nearest',
			inline: 'center'
		});
	}

	onMount(() => {
		void selectTab(selectedTab, false);
	});
</script>

<svelte:head>
	<title>How FastAccs Works</title>
	<meta
		name="description"
		content="Learn how to buy accounts, receive verification numbers, order boosting services, and earn as a FastAccs affiliate."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background: var(--bg);">
	<section class="hero px-4 py-12 text-white md:py-16">
		<div class="mx-auto max-w-4xl text-center">
			<p class="eyebrow">HOW IT WORKS</p>
			<h1 class="mt-3 text-4xl font-bold md:text-5xl">How FastAccs Works</h1>
			<p class="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-green-50 md:text-lg">
				{flow.intro}
			</p>
		</div>
	</section>

	<nav class="tab-shell sticky top-16 z-10" aria-label="How FastAccs works sections">
		<div class="tab-scroll mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4">
			{#each tabs as tab}
				<button
					type="button"
					data-how-tab={tab.id}
					onclick={() => selectTab(tab.id)}
					class:active-tab={selectedTab === tab.id}
					class="tab-button"
					aria-current={selectedTab === tab.id ? 'page' : undefined}
				>
					{#if tab.id === 'buyer'}
						<ShoppingBag size={18} />
					{:else if tab.id === 'numbers'}
						<Phone size={18} />
					{:else if tab.id === 'boosting'}
						<Zap size={18} />
					{:else}
						<Share2 size={18} />
					{/if}
					<span>{tab.label}</span>
				</button>
			{/each}
		</div>
	</nav>

	<section
		class="flow-section px-4 py-12 md:py-16"
		style:--flow-accent={flow.accent}
		style:--flow-tint={flow.tint}
	>
		<div class="mx-auto max-w-5xl">
			<header class="mx-auto mb-9 max-w-3xl text-center md:mb-12">
				<p class="flow-label">{flow.label}</p>
				<h2 class="mt-2 text-3xl font-bold md:text-4xl">{flow.heading}</h2>
				{#if flow.subheading}
					<p class="mx-auto mt-3 max-w-2xl leading-relaxed">{flow.subheading}</p>
				{/if}
			</header>

			<div class="step-list">
				{#each flow.steps as step, index}
					<article class:reverse={index % 2 === 1} class="step-row">
						<div class="step-copy">
							<div class="step-number">{index + 1}</div>
							<div>
								<p class="step-kicker">Step {index + 1}</p>
								<h3>{step.title}</h3>
								<p class="step-description">{step.description}</p>
							</div>
						</div>

						<div class="outcome-card">
							<p class="outcome-label">{step.panelTitle}</p>
							<div class="outcome-list">
								{#each step.panelItems as item, itemIndex}
									<div>
										<span>{itemIndex + 1}</span>
										<p>{item}</p>
									</div>
								{/each}
							</div>
						</div>
					</article>
				{/each}
			</div>

			<div class="flow-actions">
				<a class="btn-fa btn-fa--primary" href={flow.ctaHref}>{flow.ctaLabel}</a>
				<a class="support-link" href="/support">Need help first?</a>
			</div>
		</div>
	</section>

	<section class="faq-section px-4 py-12 md:py-16">
		<div class="mx-auto max-w-3xl">
			<header class="mb-8 text-center">
				<p class="faq-label">{flow.label}</p>
				<h2 class="mt-2 text-3xl font-bold">Common questions</h2>
			</header>

			<div class="faq-list">
				{#each flow.faqs as faq}
					<details>
						<summary>
							<span>{faq.question}</span>
							<span class="plus" aria-hidden="true">+</span>
						</summary>
						<p>{faq.answer}</p>
					</details>
				{/each}
			</div>
		</div>
	</section>
</main>

<Footer />

<style>
	.hero {
		background: var(--btn-primary-gradient);
	}
	.eyebrow,
	.flow-label,
	.faq-label,
	.step-kicker,
	.outcome-label {
		font-family: var(--font-head);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.eyebrow {
		color: rgba(255, 255, 255, 0.76);
	}
	.tab-shell {
		background: rgba(8, 13, 16, 0.96);
		border-bottom: 1px solid var(--border);
		backdrop-filter: blur(12px);
	}
	.tab-scroll {
		scrollbar-width: none;
	}
	.tab-scroll::-webkit-scrollbar {
		display: none;
	}
	.tab-button {
		display: inline-flex;
		min-height: 56px;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.55rem;
		border-bottom: 2px solid transparent;
		padding: 0 1rem;
		color: var(--text-muted);
		font-family: var(--font-head);
		font-size: 0.92rem;
		font-weight: 650;
		transition:
			color 160ms ease,
			border-color 160ms ease;
	}
	.tab-button:hover,
	.tab-button.active-tab {
		border-color: var(--primary);
		color: var(--text);
	}
	.flow-section {
		color: var(--text);
	}
	.flow-section header > p:last-child,
	.faq-section {
		color: var(--text-muted);
	}
	.flow-label,
	.faq-label,
	.step-kicker,
	.outcome-label {
		color: var(--flow-accent, var(--primary));
	}
	.step-list {
		display: grid;
		gap: 1rem;
	}
	.step-row {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
		align-items: center;
		gap: 2rem;
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: clamp(1.25rem, 3vw, 2.25rem);
		background: var(--bg-elev-1);
	}
	.step-row.reverse .step-copy {
		order: 2;
	}
	.step-row.reverse .outcome-card {
		order: 1;
	}
	.step-copy {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 1rem;
	}
	.step-number {
		display: grid;
		height: 42px;
		place-items: center;
		border: 1px solid var(--flow-accent);
		border-radius: 13px;
		background: var(--flow-tint);
		color: var(--flow-accent);
		font-family: var(--font-head);
		font-weight: 800;
	}
	.step-copy h3 {
		margin-top: 0.3rem;
		font-family: var(--font-head);
		font-size: clamp(1.35rem, 3vw, 1.75rem);
		font-weight: 750;
	}
	.step-description {
		margin-top: 0.7rem;
		color: var(--text-muted);
		line-height: 1.65;
	}
	.outcome-card {
		border: 1px solid color-mix(in srgb, var(--flow-accent) 32%, var(--border));
		border-radius: 16px;
		padding: 1.2rem;
		background: linear-gradient(145deg, var(--flow-tint), rgba(255, 255, 255, 0.018));
	}
	.outcome-list {
		display: grid;
		gap: 0.65rem;
		margin-top: 0.9rem;
	}
	.outcome-list > div {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 11px;
		padding: 0.7rem 0.8rem;
		background: rgba(4, 9, 12, 0.48);
	}
	.outcome-list span {
		display: grid;
		height: 25px;
		width: 25px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 8px;
		background: var(--flow-tint);
		color: var(--flow-accent);
		font-size: 0.72rem;
		font-weight: 750;
	}
	.outcome-list p {
		color: var(--text);
		font-size: 0.88rem;
		font-weight: 550;
	}
	.flow-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 2rem;
	}
	.flow-actions :global(.btn-fa) {
		min-width: 220px;
	}
	.support-link {
		padding: 0.8rem 0.4rem;
		color: var(--text-muted);
		font-weight: 650;
	}
	.support-link:hover {
		color: var(--text);
	}
	.faq-section {
		border-top: 1px solid var(--border);
		background: var(--bg-elev-2);
	}
	.faq-list {
		display: grid;
		gap: 0.75rem;
	}
	details {
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--bg-elev-1);
	}
	summary {
		display: flex;
		cursor: pointer;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.1rem;
		color: var(--text);
		font-family: var(--font-head);
		font-weight: 650;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	details > p {
		padding: 0 1.1rem 1.1rem;
		line-height: 1.65;
	}
	.plus {
		color: var(--text-dim);
		font-size: 1.25rem;
		transition: transform 160ms ease;
	}
	details[open] .plus {
		transform: rotate(45deg);
	}
	@media (min-width: 640px) {
		.tab-scroll {
			justify-content: center;
		}
	}
	@media (max-width: 700px) {
		.step-row {
			grid-template-columns: 1fr;
			gap: 1.2rem;
			border-radius: 16px;
		}
		.step-row.reverse .step-copy,
		.step-row.reverse .outcome-card {
			order: initial;
		}
		.step-copy {
			grid-template-columns: 36px minmax(0, 1fr);
			gap: 0.8rem;
		}
		.step-number {
			height: 36px;
			border-radius: 11px;
		}
		.flow-actions {
			align-items: stretch;
			flex-direction: column;
			text-align: center;
		}
		.flow-actions :global(.btn-fa) {
			width: 100%;
		}
	}
</style>
