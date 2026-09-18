import { deriveEmailPreheader, renderEmailBody, renderEmailTemplate } from '$lib/services/email';
import { RESTOCK_VARIANTS, WINBACK_VARIANTS } from '$lib/services/email-variants';
import emailHeaderUrl from '$lib/assets/fa-email-header.png';

export type EmailReviewAudience = 'Customer' | 'Admin';
export type EmailReviewClassification = 'Transactional' | 'Marketing' | 'Operational';
export type EmailReviewState = 'Live' | 'Paused' | 'Manual';

export interface EmailReviewEntry {
	id: string;
	name: string;
	audience: EmailReviewAudience;
	classification: EmailReviewClassification;
	state: EmailReviewState;
	trigger: string;
	timing: string;
	frequency: string;
	protections: string;
	subject: string;
	preheader: string;
	body: string;
	ctaText: string | null;
	ctaUrl: string | null;
	notes: string;
	source: string;
	html: string;
}

type EmailReviewDraft = Omit<EmailReviewEntry, 'preheader' | 'html'> & { preheader?: string };

const BASE_URL = 'https://smm.fastaccs.com';

function getReviewEyebrow(draft: EmailReviewDraft): string {
	if (draft.classification === 'Operational') return 'OPERATIONS';
	if (draft.id === 'verification-code') return 'SECURITY';
	if (
		draft.id === 'welcome' ||
		draft.id.startsWith('onboarding-') ||
		draft.id.startsWith('nurture-')
	) {
		return 'GET STARTED';
	}
	if (draft.id.startsWith('affiliate-') || draft.id.startsWith('payout-')) return 'AFFILIATE';
	if (draft.id.startsWith('account-restock-') || draft.id === 'numbers-restock')
		return 'BACK IN STOCK';
	if (draft.id === 'boosting-live') return 'BOOSTING';
	if (draft.id.startsWith('numbers-launch-')) return 'NUMBERS';
	if (draft.id === 'promo-reminder') return 'YOUR REWARD';
	if (draft.classification === 'Marketing') return 'FAST ACCOUNTS';
	return 'ORDER UPDATE';
}

function entry(draft: EmailReviewDraft): EmailReviewEntry {
	const preheader = draft.preheader || deriveEmailPreheader(draft.body, draft.subject);
	const marketingPreferenceUrl =
		draft.classification === 'Marketing' ? `${BASE_URL}/email/preferences/sample-token` : null;
	const html = renderEmailTemplate({
		body: renderEmailBody(draft.body),
		title: draft.subject,
		eyebrow: getReviewEyebrow(draft),
		preheader,
		ctaText: draft.ctaText,
		ctaUrl: draft.ctaUrl,
		showCta: Boolean(draft.ctaText && draft.ctaUrl),
		marketingPreferenceUrl
	}).replace('cid:fastaccounts-email-header', emailHeaderUrl);

	return { ...draft, preheader, html };
}

const orderSummary = `Your payment was successful and your order has been confirmed.

Order: FA-24091501
Amount paid: ₦12,500

Items:
- Instagram account x1 (₦12,500)`;

const customerEntries: EmailReviewDraft[] = [
	{
		id: 'verification-code',
		name: 'Email verification code',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'A customer requests or resends an email-verification code.',
		timing: 'Immediately after the request.',
		frequency: 'Rate-limited; one valid code at a time.',
		protections:
			'The code expires, incorrect attempts are capped, and the code is never placed in a link.',
		subject: 'Confirm your email',
		preheader: 'Your verification code expires in 10 minutes.',
		body: `Enter this code on Fast Accounts. It expires in 10 minutes.

Do not share this code with anyone.`,
		ctaText: null,
		ctaUrl: null,
		notes: 'The real email displays the six-digit code in a highlighted box.',
		source: 'src/lib/services/email-verification.ts'
	},
	{
		id: 'welcome',
		name: 'Welcome',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'A customer verifies their email for the first time.',
		timing: 'Immediately after successful verification.',
		frequency: 'Once per customer.',
		protections: 'Database reservation prevents duplicate welcome emails.',
		subject: 'Welcome — your account is ready',
		body: `Hi Tobi,

Welcome to Fast Accounts.

- Buy ready-to-use social accounts
- Get verification numbers for multiple sites, apps, and countries
- Grow your followers, likes, views, and more

Everything in one place.`,
		ctaText: 'Explore FastAccs',
		ctaUrl: BASE_URL,
		notes: 'Required account email; it is not affected by marketing preferences.',
		source: 'src/lib/services/email.ts'
	},
	{
		id: 'onboarding-24h',
		name: 'First-order help · day 1',
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger: 'A verified customer has not placed a successful order.',
		timing: 'About 24 hours after registration.',
		frequency: 'Once; stops when the customer buys.',
		protections: 'Requires marketing consent and shares the global marketing cooldown.',
		subject: 'Ready for your first order?',
		body: `Hi Tobi,

Your account's ready. Browse what's in stock, pick what fits, and check out in a couple of taps — delivery is instant.

Everything shows on your dashboard.`,
		ctaText: 'See available accounts',
		ctaUrl: `${BASE_URL}/platforms`,
		notes: 'Optional onboarding email.',
		source: 'src/lib/services/lifecycle-email.ts'
	},
	{
		id: 'onboarding-48h',
		name: 'First-order help · day 2',
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger: 'The customer still has no successful order after the first onboarding email.',
		timing: 'About 48 hours after registration.',
		frequency: 'Once; stops when the customer buys.',
		protections: 'Requires marketing consent and the first onboarding step.',
		subject: 'Need help choosing?',
		body: `Hi Tobi,

Not sure where to start? Choose accounts, verification numbers, or boosting from the homepage.

Every page shows the price and what you receive. Message us if you need help.`,
		ctaText: 'Get help',
		ctaUrl: `${BASE_URL}/support`,
		notes: 'Optional onboarding email.',
		source: 'src/lib/services/lifecycle-email.ts'
	},
	...[
		{
			id: 'nurture-3d',
			name: 'First-order offer · day 3',
			timing: 'About day 3.',
			subject: '10% off your first account order 🎁',
			body: `Hi Tobi,

You signed up but haven't ordered yet — here's 10% off your first account order. Use code WELCOME10 at checkout.

Verified accounts, instant delivery, from small tiers to bulk. See what's available.`
		},
		{
			id: 'nurture-10d',
			name: 'First-order offer · day 10',
			timing: 'About day 10, at least seven days after the previous email.',
			subject: 'What do you need today?',
			body: `Hi Tobi,

Still deciding? Start with what you need:

- Ready social accounts
- Verification numbers
- Followers, likes, and views

See live prices on the site. If you choose an account, code WELCOME10 gives you 10% off.`
		},
		{
			id: 'nurture-21d',
			name: 'First-order offer · day 21',
			timing: 'About day 21, at least seven days after the previous email.',
			subject: 'Last nudge 👋',
			body: `Hi Tobi,

We won't crowd your inbox — this is the last one.

Code WELCOME10 still gives you 10% off your first account order. Instant delivery, verified accounts, real support — whenever you're ready.`
		}
	].map<EmailReviewDraft>((item) => ({
		...item,
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger: 'A verified customer has never completed a purchase.',
		frequency:
			'One email at each step; the sequence ends after step three or immediately after purchase.',
		protections:
			'Requires marketing consent, deduplication and seven-day spacing; stops immediately after purchase.',
		ctaText: 'Shop now',
		ctaUrl: `${BASE_URL}/platforms`,
		notes:
			'Enabled by default. WELCOME10 is live for account checkout as 10% off, once per customer, with no global cap or platform restriction.',
		source: 'src/lib/services/lifecycle-email.ts'
	})),
	...[
		{
			id: 'abandoned-15m',
			name: 'Unpaid order · reminder 1',
			timing: 'About 15 minutes after an unpaid order is created.',
			subject: 'Complete your Fast Accounts order (FA-24091501)',
			body: `Hi Tobi,

You started an order, but payment has not gone through yet.

Order: FA-24091501
Amount: ₦ 12,500

Your items are still held for you. Tap below to finish payment.`,
			ctaText: 'Resume payment'
		},
		{
			id: 'abandoned-4h',
			name: 'Unpaid order · reminder 2',
			timing: 'About four hours after the order.',
			subject: 'Still want these? Your order is held (FA-24091501)',
			body: `Hi Tobi,

Payment has not come through yet.

Order: FA-24091501
Amount: ₦ 12,500

Your items are still held, but stock moves fast. Complete payment when you are ready.`,
			ctaText: 'Complete my order'
		},
		{
			id: 'abandoned-24h',
			name: 'Unpaid order · final reminder',
			timing: 'About 24 hours after the order.',
			subject: 'Last call — your held order is about to be released (FA-24091501)',
			body: `Hi Tobi,

We can only hold your items a little longer.

Order: FA-24091501
Amount: ₦ 12,500

Complete payment now if you still want them.`,
			ctaText: 'Finish before it expires'
		}
	].map<EmailReviewDraft>((item) => ({
		...item,
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'An order exists but Monnify has not confirmed payment.',
		frequency: 'Maximum three reminders for that order.',
		protections:
			'Each step is deduplicated; paid, cancelled and released orders stop the sequence.',
		ctaUrl: `${BASE_URL}/order/FA-24091501`,
		notes: 'Required order-recovery email.',
		source: 'src/lib/services/lifecycle-email.ts'
	})),
	...[
		{
			id: 'order-account',
			name: 'Account details ready · automatic',
			body: `Your account details are ready.

Order: FA-24091501
Amount paid: ₦12,500

**Account details**

**Instagram account** (1 account)
- Username: sample_user
- Email: sample@example.com
- Password: View securely in your dashboard

**Keep it secure**
- Change the password after your first login
- Do not share your login details`,
			ctaText: 'View account details',
			ctaUrl: `${BASE_URL}/dashboard?tab=purchases`
		},
		{
			id: 'order-number',
			name: 'Order confirmed · number',
			body: `${orderSummary.replace('Instagram account', 'WhatsApp Nigeria number')}

Open your order page to see your number and get your one-time code — it appears automatically once it arrives. If no code comes through within the activation window, you're automatically refunded.`,
			ctaText: 'View your number',
			ctaUrl: `${BASE_URL}/order/sample-order`
		},
		{
			id: 'order-boosting',
			name: 'Order confirmed · boosting',
			body: `${orderSummary.replace('Instagram account', 'Instagram Followers')}

Your boost is queued and will begin shortly. Most orders start within a few hours. Track its status from your order page.`,
			ctaText: 'View order status',
			ctaUrl: `${BASE_URL}/order/sample-order`
		},
		{
			id: 'order-handover',
			name: 'Order confirmed · manual handover',
			body: `${orderSummary}

Send your payment receipt on WhatsApp to receive the complete login details. Your order number is already included.`,
			ctaText: 'Send receipt on WhatsApp',
			ctaUrl: 'https://wa.link/fast_accounts'
		}
	].map<EmailReviewDraft>((item) => ({
		...item,
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger:
			item.id === 'order-account'
				? 'An instant-delivery account order is paid and its account allocation finishes.'
				: 'A payment is verified and the order is safely settled.',
		timing: 'Immediately after settlement.',
		frequency: 'Once per order.',
		protections:
			'A database reservation prevents duplicate confirmations during webhook or recovery retries.',
		subject:
			item.id === 'order-account'
				? 'Your Fast Accounts order FA-24091501 is ready'
				: 'Order confirmed — FA-24091501',
		preheader:
			item.id === 'order-account'
				? 'Your account details are ready in your dashboard.'
				: 'Payment received · ₦12,500 · Order FA-24091501',
		notes:
			item.id === 'order-account'
				? 'Automatic and deduplicated after allocation. Sample credentials are placeholders.'
				: 'The final paragraph and button change with the fulfilment type.',
		source: 'src/lib/services/email.ts'
	})),
	{
		id: 'account-delivery',
		name: 'Account details ready',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Manual',
		trigger: 'An admin explicitly resends an already fulfilled account order by email.',
		timing: 'Immediately after the admin action.',
		frequency: 'On each explicit admin delivery action.',
		protections:
			'Passwords stay in the authenticated dashboard; the email contains only supporting details.',
		subject: 'Your Fast Accounts order FA-24091501 is ready',
		body: `**Order details**
- Order Number: FA-24091501
- Order Date: 15/09/2026
- Total Amount: ₦12,500

**Instagram account**
- Username: sample_user
- Email: sample@example.com
- Password: Available in your dashboard

**Keep your account secure**
- Passwords are available only in your dashboard
- Change each password after your first login
- Do not share your credentials`,
		ctaText: 'Open your dashboard',
		ctaUrl: `${BASE_URL}/dashboard?tab=purchases`,
		notes:
			'Sample credentials are placeholders; no live customer data appears on this review page.',
		source: 'src/routes/api/orders/[id]/deliver/+server.ts'
	},
	{
		id: 'boosting-live',
		name: 'Boosting waitlist release',
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger:
			'A customer joined that service’s waitlist, then its admin price changed from unavailable (₦0) to a valid selling price.',
		timing: 'Immediately after activation.',
		frequency: 'Once for each waitlist subscription.',
		protections:
			'Only subscribed customers; respects marketing preferences and deduplication, but requested alerts do not wait behind unrelated marketing.',
		subject: 'TikTok Followers is now live',
		preheader: 'Paste your link, pay, and track delivery from your dashboard.',
		body: 'TikTok Followers is now available. Paste your link, pay, we deliver.',
		ctaText: 'View boosting services',
		ctaUrl: `${BASE_URL}/services`,
		notes: 'A matching push notification is sent when available.',
		source: 'src/lib/services/boosting-service-notifications.ts'
	},
	{
		id: 'numbers-restock',
		name: 'Verification numbers restocked',
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger: 'A requested service-and-country number becomes available again.',
		timing: 'After the Numbers catalogue confirms availability.',
		frequency: 'Once for each restock subscription.',
		protections:
			'Only subscribed customers; respects marketing preferences and deduplication, but requested alerts do not wait behind unrelated marketing.',
		subject: 'WhatsApp · United States numbers are back in stock',
		preheader: 'Available now for ₦1,500',
		body: 'Good news — WhatsApp · United States verification numbers are available again — now ₦1,500. Grab one before they sell out.',
		ctaText: 'Get your number',
		ctaUrl: `${BASE_URL}/numbers`,
		notes:
			'The real email uses the exact service and country requested. This USA WhatsApp sample replaces the low-demand Nigeria example; USA/UK WhatsApp and Telegram are featured in the Numbers discovery sequence.',
		source: 'src/lib/services/restock-notifications.ts'
	},
	...RESTOCK_VARIANTS.map<EmailReviewDraft>((variant, index) => {
		const vars = {
			tier: 'Instagram · 1K Followers',
			platform: 'Instagram',
			urgency: 'Only 4 left — these go fast.'
		};
		return {
			id: `account-restock-${index + 1}`,
			name: `Account restock · wording ${index + 1}`,
			audience: 'Customer',
			classification: 'Marketing',
			state: 'Live',
			trigger: 'An account tier requested by the customer returns to stock.',
			timing: 'Immediately after stock becomes available.',
			frequency: 'Once per restock subscription; wording rotates for repeat customers.',
			protections:
				'Only subscribed customers; respects marketing preferences and deduplication, but requested alerts do not wait behind unrelated marketing.',
			subject: variant.subject(vars),
			preheader: vars.urgency,
			body: variant.body(vars),
			ctaText: variant.ctaText,
			ctaUrl: `${BASE_URL}/platforms/instagram/tiers/1k-followers`,
			notes:
				'One of three alternate wordings—not three emails for one restock. The exact requested tier and current live count are inserted.',
			source: 'src/lib/services/email-variants.ts'
		};
	}),
	...WINBACK_VARIANTS.map<EmailReviewDraft>((variant, index) => ({
		id: `winback-${index + 1}`,
		name: `Inactive-customer return · wording ${index + 1}`,
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger: 'A verified customer has been inactive for the configured period.',
		timing: 'After 20 inactive days, during the scheduled morning run.',
		frequency: 'At most once every 60 days; wording rotates.',
		protections:
			'Requires marketing consent and deduplication. It does not wait behind unrelated marketing campaigns.',
		subject: variant.subject,
		body: variant.body({
			firstName: 'Tobi',
			platformLine: 'Currently in stock: Instagram, X, TikTok.'
		}),
		ctaText: variant.ctaText,
		ctaUrl: `${BASE_URL}/platforms`,
		notes:
			'One of three rotating versions. The “currently in stock” line is queried from live available inventory when the email is built; the names shown here are placeholders.',
		source: 'src/lib/services/email-variants.ts'
	})),
	{
		id: 'affiliate-unlock',
		name: 'Affiliate access unlocked',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'The customer completes their first eligible retained account purchase.',
		timing: 'When affiliate access is created, with recovery if the first send fails.',
		frequency: 'Once per customer.',
		protections: 'Database reservation prevents duplicates.',
		subject: 'Your Fast Accounts affiliate code is ready',
		body: `Hi Tobi,

Your affiliate code is ready: **TOBI5**

Friends save 5% on their first two eligible account orders, and you earn 5% too — up to ₦1,000 per order.

Cleared earnings can be spent on Fast Accounts or withdrawn from ₦10,000. Payouts are processed on Saturdays.`,
		ctaText: 'View and share my code',
		ctaUrl: `${BASE_URL}/dashboard?tab=affiliate`,
		notes: 'Transactional access notice, separate from the optional announcement campaign.',
		source: 'src/lib/services/affiliate-notification-email.ts'
	},
	{
		id: 'affiliate-announcement',
		name: 'Affiliate programme announcement',
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Manual',
		trigger: 'An admin launches the one-time affiliate announcement.',
		timing: 'Only when manually launched.',
		frequency: 'Once per eligible active affiliate.',
		protections: 'Requires marketing consent, uses a one-time campaign key and deduplication.',
		subject: 'Your Fast Accounts affiliate code is ready',
		body: `Hi Tobi,

Your affiliate code: **TOBI5**

Friends save 5% on their first two eligible account orders, and you earn 5% too — up to ₦1,000 per order. Cleared earnings can be spent or withdrawn from ₦10,000; payouts run on Saturdays.

Your link: ${BASE_URL}/ref/TOBI5`,
		ctaText: 'View and share my code',
		ctaUrl: `${BASE_URL}/dashboard?tab=affiliate`,
		notes: 'Optional announcement; not sent automatically with every affiliate event.',
		source: 'src/lib/services/affiliate-lifecycle-email.ts'
	},
	{
		id: 'affiliate-first-credit',
		name: 'First referral reward pending',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'The customer earns their first referral reward.',
		timing: 'When the referred order creates the pending reward.',
		frequency: 'Once per affiliate.',
		protections: 'Database reservation and recovery prevent duplicate or missed notices.',
		subject: 'Your first referral reward is pending 🎉',
		body: `Hi Tobi,

**₦450** is pending and will be available in 7 days if the order isn't refunded.

Keep sharing your link. You earn 5% on each friend's first two eligible account orders, up to ₦1,000 per order.`,
		ctaText: 'View affiliate dashboard',
		ctaUrl: `${BASE_URL}/dashboard?tab=affiliate`,
		notes: 'The amount and return window are filled from the real reward policy.',
		source: 'src/lib/services/affiliate-notification-email.ts'
	},
	{
		id: 'affiliate-bank-ready',
		name: 'First referral earning available',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'The affiliate’s first reward clears and no bank details are stored.',
		timing: 'When the reward becomes available, with scheduled recovery.',
		frequency: 'Once per affiliate.',
		protections: 'Only active affiliates without payout details; deduplicated.',
		subject: 'Your first referral earning is now available',
		body: `Hi Tobi,

Your first referral earning is now available.

Spend it on Fast Accounts, or add bank details and request a payout when your balance reaches ₦10,000. Payouts run on Saturdays.`,
		ctaText: 'Add bank details',
		ctaUrl: `${BASE_URL}/affiliate/bank-details`,
		notes: 'Required account notice because it concerns available customer funds.',
		source: 'src/lib/services/affiliate-notification-email.ts'
	},
	...[
		{
			id: 'payout-requested',
			name: 'Affiliate payout received',
			subject: 'Your affiliate cash payout request was received',
			body: `Hi Tobi,

Requested amount: ₦12,000
Request reference: PAY-24091501

We will review it for the next Saturday payout cycle. You can follow its status from your affiliate dashboard.`,
			ctaText: 'View payout status'
		},
		{
			id: 'payout-paid',
			name: 'Affiliate payout completed',
			subject: 'Your affiliate cash payout is complete',
			body: `Hi Tobi,

Amount paid: ₦12,000
Request reference: PAY-24091501

Your payout is complete. Thank you for growing with Fast Accounts.`,
			ctaText: 'View affiliate dashboard'
		},
		{
			id: 'payout-reversed',
			name: 'Affiliate payout not approved',
			subject: 'Update on your affiliate cash payout request',
			body: `Hi Tobi,

Requested amount: ₦12,000
Request reference: PAY-24091501
Reason: The account details need to be corrected.

Update your details or contact support if you need help.`,
			ctaText: 'View payout status'
		}
	].map<EmailReviewDraft>((item) => ({
		...item,
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'An affiliate payout enters this status.',
		timing: 'Immediately after the status change, with scheduled recovery.',
		frequency: 'Once for each payout and status.',
		protections: 'Status-specific reference prevents duplicate notices.',
		ctaUrl: `${BASE_URL}/dashboard?tab=affiliate`,
		notes: 'The amount, reference and any admin reason are filled from the payout.',
		source: 'src/lib/services/affiliate-payout-email.ts'
	})),
	...[
		{
			id: 'numbers-launch-1',
			name: 'Numbers discovery · introduction',
			timing: 'After five days, if the customer has not bought a number.',
			subject: 'Verification numbers for the apps you use ⚡',
			body: `Hi Tobi,

Get verification numbers for WhatsApp and Telegram across the USA, UK, and more countries. Pick what you need and your one-time code appears on your order page.

No code within the activation window? You are refunded automatically.`,
			ctaText: 'Get a number'
		},
		{
			id: 'numbers-launch-2',
			name: 'Numbers discovery · reminder',
			timing: 'At least seven days after the introduction.',
			subject: 'WhatsApp and Telegram numbers, ready when you need them',
			body: `Hi Tobi,

Choose WhatsApp or Telegram, select the USA, UK, or another available country, and receive your code automatically.

It is self-serve and available 24/7. If no code arrives, you are refunded automatically.`,
			ctaText: 'See available numbers'
		},
		{
			id: 'numbers-launch-3',
			name: 'Numbers discovery · final reminder',
			timing: 'At least fourteen days after the previous reminder.',
			subject: 'Need a number for WhatsApp or Telegram?',
			body: `Hi Tobi,

USA and UK options are available alongside other countries. Pick a number, request your code, done.

No code within the activation window? You are refunded automatically.`,
			ctaText: 'Try Numbers'
		}
	].map<EmailReviewDraft>((item) => ({
		...item,
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger:
			'The automated daily Numbers discovery run finds an opted-in customer who has not bought a number.',
		frequency: 'Maximum three campaign touches.',
		protections:
			'Existing Numbers buyers stop immediately; marketing consent, cross-campaign pacing and per-step deduplication apply.',
		ctaUrl: `${BASE_URL}/numbers`,
		notes:
			'The initial owner switch is already enabled. The daily cron now keeps this sequence live instead of ending after the old ten-day launch window.',
		source: 'src/lib/services/numbers-campaign.ts'
	})),
	{
		id: 'promo-reminder',
		name: 'Unused reward reminder',
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Live',
		trigger: 'A customer has an unlocked, unused and unexpired personal reward code.',
		timing: 'During the scheduled reward-reminder run.',
		frequency: 'Once per reward code.',
		protections: 'Requires marketing consent; inactive, used and expired codes are excluded.',
		subject: "Don't let your ₦1,000 expire",
		body: `Hi Tobi,

You still have ₦1,000 off your next account order.

Your code: SAVE1000
- Valid on account orders from ₦2,000
- Apply it at checkout`,
		ctaText: 'Use my ₦1,000',
		ctaUrl: `${BASE_URL}/platforms`,
		notes: 'The code, discount and minimum order are personalised.',
		source: 'src/lib/services/promo-reminder.ts'
	},
	{
		id: 'admin-one-off-email',
		name: 'One-off admin email',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Manual',
		trigger: 'An authorised broadcast admin uses the protected one-off email endpoint.',
		timing: 'Only after the manual request.',
		frequency: 'No automatic schedule.',
		protections:
			'Requires admin broadcast permission and the action is included in the admin audit log.',
		subject: 'Sample one-off subject',
		body: 'The subject and message are supplied by the authorised admin at send time.',
		ctaText: null,
		ctaUrl: null,
		notes: 'There is no fixed customer copy. This is separate from the audience Broadcast tool.',
		source: 'src/routes/api/send-email/+server.ts'
	}
];

const adminEntries: EmailReviewDraft[] = [
	{
		id: 'admin-stock-new',
		name: 'New out-of-stock tier',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Live',
		trigger: 'An instant-delivery account tier falls from available stock to zero.',
		timing: 'Immediately after the inventory-changing action.',
		frequency: 'Maximum three stock emails per day; repeats are grouped.',
		protections:
			'Manual-handover and Numbers tiers are excluded; database state prevents duplicate alerts.',
		subject: 'Stock needed: 1 new tier',
		preheader: '1 newly out of stock · 3 total',
		body: `1 tier is newly out of stock.

- X / Organic 500 Followers

There are 3 out-of-stock tiers in total. Open inventory to see them all.`,
		ctaText: 'Open inventory',
		ctaUrl: `${BASE_URL}/admin/inventory`,
		notes:
			'Simplified after the September re-audit: raw source names, thresholds and alert mechanics were removed.',
		source: 'src/lib/services/admin-alerts.ts'
	},
	{
		id: 'admin-stock-digest',
		name: 'Out-of-stock reminder',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Live',
		trigger: 'Out-of-stock tiers remain unresolved.',
		timing: 'At most once every 12 hours, subject to the daily cap.',
		frequency: 'Maximum three stock emails per day.',
		protections: 'Only unresolved tiers are included; repeated alerts are grouped.',
		subject: 'Stock needed: 3 tiers',
		preheader: '3 out-of-stock tiers need attention',
		body: `3 tiers still need stock.

- X / Organic 500 Followers
- TikTok / 1K Followers
- X / Organic 1K Followers`,
		ctaText: 'Open inventory',
		ctaUrl: `${BASE_URL}/admin/inventory`,
		notes: 'Shows at most eight tiers, then links to inventory.',
		source: 'src/lib/services/admin-alerts.ts'
	},
	{
		id: 'admin-boosting-paid',
		name: 'New Boosting order',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Live',
		trigger: 'A manual Boosting order is paid.',
		timing: 'Immediately after safe payment settlement.',
		frequency: 'Once per order.',
		protections: 'Persistent order-level deduplication prevents webhook/recovery duplicates.',
		subject: 'New boosting order',
		preheader: 'FA-24091501 · ₦32,500 · 1 service',
		body: `Order: FA-24091501
Amount: ₦32,500
Customer: Tobi

**Services**
- X Followers · 2,500 · [Open target](https://x.com/sample)`,
		ctaText: 'Open boosting orders',
		ctaUrl: `${BASE_URL}/admin/boosting-orders`,
		notes:
			'Simplified after the September re-audit: internal UUID, payment reference, source key and repeated heading were removed.',
		source: 'src/lib/services/manual-handover.ts'
	},
	{
		id: 'admin-handover-paid',
		name: 'New manual-handover order',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Live',
		trigger: 'A manual-handover account order is paid.',
		timing: 'Immediately after safe payment settlement.',
		frequency: 'Once per order.',
		protections: 'Persistent order-level deduplication prevents webhook/recovery duplicates.',
		subject: 'New manual-handover order',
		preheader: 'FA-24091501 · ₦12,500 · Tobi',
		body: `Order: FA-24091501
Amount: ₦12,500
Customer: Tobi
Contact: +234 800 000 0000
[Open WhatsApp handover](https://wa.link/fast_accounts)`,
		ctaText: 'Open order',
		ctaUrl: `${BASE_URL}/admin/orders/sample-order`,
		notes: 'Only information required to complete the handover remains.',
		source: 'src/lib/services/manual-handover.ts'
	},
	{
		id: 'admin-affiliate-payout',
		name: 'New affiliate payout request',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Live',
		trigger: 'An affiliate submits a payout request.',
		timing: 'Immediately after the request is safely recorded.',
		frequency: 'Once per payout request.',
		protections: 'The request reference identifies the exact ledger transaction.',
		subject: 'New affiliate payout — ₦12,000',
		preheader: 'Tobi requested ₦12,000',
		body: `Affiliate: Tobi
Email: tobi@example.com
Requested amount: ₦12,000
Request reference: PAY-24091501`,
		ctaText: 'Review payout',
		ctaUrl: `${BASE_URL}/admin/affiliates/sample-user`,
		notes: 'The customer separately receives a payout-received confirmation.',
		source: 'src/lib/services/affiliate.ts'
	},
	{
		id: 'admin-weekly-digest',
		name: 'Weekly business summary',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Live',
		trigger: 'The weekly business-digest automation runs.',
		timing: 'Once per configured business week.',
		frequency: 'Once per reporting window and recipient.',
		protections: 'A reporting-window reference prevents duplicate sends.',
		subject: 'Weekly business summary — 2026-09-14',
		preheader: '₦117,300 net sales · 22 paid orders · 3 out of stock',
		body: `Reporting window: 7 Sep to 13 Sep 2026 (Africa/Lagos)

**Executive snapshot**
- Net sales: ₦117,300 (+12% vs previous week)
- Successful paid orders: 22 (+10%)
- Order attempts: 29 (+7.4%)
- Units sold: 26
- Average successful order value: ₦5,332
- Manual WhatsApp handovers: 2

**Payment and checkout health**
- Successful-order conversion from attempts: 75.9%
- Failed or cancelled attempts this week: 3
- Current unresolved pending Monnify orders: 1
- Oldest unresolved pending order age: 2 hours
- Payment reconciliation runs: 1,008
- Orders recovered by scheduled reconciliation: 2
- Failed payment reconciliation runs: 0
- Abandoned-checkout reminders sent: 6

**Customer and growth signals**
- Unique buyers this week: 18
- Repeat buyers within the week: 3
- New user accounts: 31 (+14.8%)
- Users inactive for 20+ days: 84
- New restock requests: 7
- Restock requests notified: 4

**Inventory action**
- Available accounts: 91
- Zero-stock tiers: 3
- Low-stock tiers (1-10 available): 16
Most urgent tiers:
- X / Organic 500 Followers: 0 available
- TikTok / 1K Followers: 0 available
- X / Organic 1K Followers: 0 available

**Top platforms by weekly sales**
- Instagram: 9 units | ₦48,500
- X: 7 units | ₦36,300
- TikTok: 6 units | ₦22,500

**Top tiers by weekly sales**
- Instagram / 1K Followers: 5 units | ₦22,500
- X / Organic 1K Followers: 3 units | ₦18,000
- TikTok / Low Followers: 4 units | ₦16,000

**Affiliate signals**
- Active affiliate profiles: 12
- Affiliate-referred paid orders: 5
- Affiliate-referred sales: ₦28,000
- Affiliate Cash credited this week: ₦1,400
- New payout requests: 1

**Email performance**
- Emails sent: 96
- Email delivery failures: 1
- Optional marketing emails sent: 24
- Optional marketing sends suppressed by policy: 8
- Marketing unsubscribes: 0

**Automation and exact-preview health**
- Failed automation runs: 1
- Exact-preview automation runs: 168
- Exact previews generated: 12
- Exact-preview generation failures: 0

**Recommended operator actions**
- Review 1 unresolved pending payment
- Review 1 failed automation run
- Restock 3 zero-stock tiers`,
		ctaText: null,
		ctaUrl: null,
		notes:
			'The email is self-contained. Every number is calculated from the real weekly window; this preview uses representative sample values.',
		source: 'src/lib/services/weekly-business-digest.ts'
	},
	{
		id: 'admin-broadcast',
		name: 'Admin-created broadcast',
		audience: 'Customer',
		classification: 'Marketing',
		state: 'Manual',
		trigger: 'An authorised admin writes, previews and confirms a broadcast.',
		timing: 'Only when manually sent.',
		frequency: 'Defined by the admin; recipient deduplication applies.',
		protections:
			'Confirmation step, permissions, recipient deduplication, consent and unsubscribe link. Deliberate admin broadcasts do not use automated cross-campaign pacing.',
		subject: 'Sample broadcast subject',
		body: `Hi Tobi,

This space contains the exact message written in the Broadcast screen.`,
		ctaText: 'Open Fast Accounts',
		ctaUrl: BASE_URL,
		notes: 'There is no fixed copy to audit because an admin writes each broadcast.',
		source: 'src/routes/admin/broadcast and src/lib/services/admin-broadcast.ts'
	},
	{
		id: 'admin-test-email',
		name: 'SMTP test',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Manual',
		trigger: 'An authorised admin presses Send test email in Settings.',
		timing: 'Immediately after the manual action.',
		frequency: 'No automatic schedule.',
		protections: 'Admin permission required.',
		subject: 'Fast Accounts email test',
		body: 'Email delivery is working. This message was sent from the admin settings page.',
		ctaText: null,
		ctaUrl: null,
		notes: 'A diagnostic email only; customers never receive it.',
		source: 'src/routes/admin/settings/+page.server.ts'
	},
	{
		id: 'development-header-preview',
		name: 'Development-only header preview',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Manual',
		trigger: 'A developer opens the local test-email endpoint.',
		timing: 'Immediately after that development-only request.',
		frequency: 'No automatic schedule; unavailable in production.',
		protections: 'The endpoint returns 404 outside development.',
		subject: 'Fast Accounts email header preview',
		body: 'The email header and shared layout are rendering correctly.',
		ctaText: 'Open Fast Accounts',
		ctaUrl: BASE_URL,
		notes: 'A local design diagnostic only. It cannot email customers in production.',
		source: 'src/routes/api/test-email/+server.ts'
	}
];

const exceptionEntries: EmailReviewDraft[] = [
	{
		id: 'exception-payment-reconcile-binding',
		name: 'Reconciliation · payment does not match order',
		subject: 'Payment reconciliation held a mismatched payment',
		trigger:
			'Scheduled reconciliation verifies a payment reference that differs from the order’s stored reference.',
		body: 'Order FA-24091501 verified a payment reference that did not match its stored payment. No settlement or fulfilment was released.',
		source: 'src/lib/services/payment-reconciliation.ts'
	},
	{
		id: 'exception-payment-reconcile-migration',
		name: 'Reconciliation · database migration required',
		subject: 'Payment reconciliation paused (migration required)',
		trigger:
			'The reconciliation worker detects that the production database is behind the application schema.',
		body: 'Payment reconciliation is paused because a required database change is missing. Apply the pending migrations and redeploy before resuming it.',
		source: 'src/lib/services/payment-reconciliation.ts'
	},
	{
		id: 'exception-payment-reconcile-job',
		name: 'Reconciliation · scheduler failed',
		subject: 'Payment reconciliation scheduler error',
		trigger: 'The scheduled payment-reconciliation run exits with an unexpected error.',
		body: 'Payment reconciliation could not complete. Open Automation to see the recorded failure and retry after the cause is resolved.',
		source: 'src/lib/services/payment-reconciliation.ts'
	},
	{
		id: 'exception-webhook-binding',
		name: 'Monnify webhook · payment does not match order',
		subject: 'Payment held: order binding mismatch',
		trigger:
			'A verified Monnify webhook points to an order but its payment reference does not match that order.',
		body: 'A verified Monnify payment did not match the order’s stored reference. No settlement or fulfilment was released.',
		source: 'src/routes/api/webhooks/monnify/+server.ts'
	},
	{
		id: 'exception-webhook-error',
		name: 'Monnify webhook · processing failed',
		subject: 'Monnify webhook processing error',
		trigger: 'An unexpected error prevents a Monnify webhook from completing.',
		body: 'A Monnify payment update could not be processed. Open the payment logs before retrying settlement.',
		source: 'src/routes/api/webhooks/monnify/+server.ts'
	},
	{
		id: 'exception-late-split-payment',
		name: 'Payment · late store-credit split',
		subject: 'Late split payment held for review',
		trigger:
			'Gateway cash arrives after an order closed, but its restored store credit cannot be safely reserved again.',
		body: 'FA-24091501 has verified gateway cash, but its store credit could not be safely reserved again. No fulfilment was released.',
		source: 'src/lib/services/payment-settlement.ts'
	},
	{
		id: 'exception-late-payment',
		name: 'Payment · arrived after order closed',
		subject: 'Late payment held for review',
		trigger: 'A verified payment arrives after its order is already closed.',
		body: 'FA-24091501 received a verified payment after the order closed. No fulfilment or additional credit was released.',
		source: 'src/lib/services/payment-settlement.ts'
	},
	{
		id: 'exception-payment-reference-conflict',
		name: 'Payment · reference conflict',
		subject: 'Payment reference conflict held for review',
		trigger: 'Settlement presents a different payment reference from the one stored on the order.',
		body: 'FA-24091501 received a different payment reference from the one stored on the order. No fulfilment or additional credit was released.',
		source: 'src/lib/services/payment-settlement.ts'
	},
	{
		id: 'exception-payment-amount',
		name: 'Payment · amount or currency mismatch',
		subject: 'Payment amount or currency mismatch',
		trigger: 'The verified amount or currency differs from what the order requires.',
		body: 'FA-24091501 expected ₦12,500 but the verified payment details were different. No fulfilment was released.',
		source: 'src/lib/services/payment-settlement.ts'
	},
	{
		id: 'exception-payment-verify-endpoint',
		name: 'Payment · verification request failed',
		subject: 'Payment verification endpoint error',
		trigger: 'The customer-facing payment-verification endpoint exits unexpectedly.',
		body: 'A payment verification request could not complete. Open the payment logs to review the recorded error.',
		source: 'src/routes/api/payments/verify/+server.ts'
	},
	{
		id: 'exception-number-stale-rent',
		name: 'Numbers · stale rental not released',
		subject: 'Numbers: stale rent could not be released',
		trigger:
			'An outdated worker rents a number after losing ownership and the supplier does not confirm its release.',
		body: 'A stale rental for FA-24091501 was rejected safely, but the supplier did not confirm release. Review the recorded supplier reference.',
		source: 'src/lib/services/phone-fulfillment.ts'
	},
	{
		id: 'exception-number-rent-persist',
		name: 'Numbers · rental could not be saved',
		subject: 'Phone rent could not be recorded',
		trigger: 'A supplier rents a number but the application cannot safely record it.',
		body: 'The number for FA-24091501 could not be saved. The order was cancelled and refunded; confirm the supplier rental was released.',
		source: 'src/lib/services/phone-fulfillment.ts'
	},
	{
		id: 'exception-number-guest-refund',
		name: 'Numbers · guest refund needs review',
		subject: 'Phone order needs manual refund (guest)',
		trigger: 'A guest Numbers order needs a refund but has no customer wallet.',
		body: 'FA-24091501 could not be refunded automatically because the guest has no store-credit wallet. Review the order.',
		source: 'src/lib/services/phone-fulfillment.ts'
	},
	{
		id: 'exception-number-lease-expired',
		name: 'Numbers · rental request expired',
		subject: 'Numbers rent lease expired — reconcile possible provider hold',
		trigger:
			'A number-rental request outlives its safe worker lease while the supplier call is unresolved.',
		body: 'The customer was refunded after a number-rental request expired. Check the recorded supplier reference for an unresolved hold.',
		source: 'src/lib/services/phone-fulfillment.ts'
	},
	{
		id: 'exception-number-second-hold',
		name: 'Numbers · second unresolved supplier hold',
		subject: 'Numbers: second unresolved pvapins hold on refund',
		trigger: 'A refund encounters a second supplier rental that was not confirmed as released.',
		body: 'A second supplier rental could not be confirmed as released. Review both recorded supplier references before taking action.',
		source: 'src/lib/services/phone-fulfillment.ts'
	},
	{
		id: 'exception-number-balance',
		name: 'Numbers · supplier balance low',
		subject: 'hub-man balance is low',
		trigger: 'The Numbers supplier balance falls below the configured safety threshold.',
		body: 'Numbers balance is $8.40. Top up to keep Numbers available.',
		source: 'src/lib/services/phone-fulfillment.ts'
	},
	{
		id: 'exception-number-late-charge',
		name: 'Numbers · abandoned number charged late',
		subject: 'Numbers: abandoned pvapins number late-charged (leakage)',
		trigger:
			'An abandoned supplier number receives a code after the customer has moved to another number.',
		body: 'An abandoned number received a late code and created supplier cost. Review the order item and recorded cost if this starts repeating.',
		source: 'src/lib/services/phone-fulfillment.ts'
	},
	{
		id: 'exception-number-probe-release',
		name: 'Numbers · catalogue probe not released',
		subject: 'Numbers catalogue probe was not released',
		trigger: 'A safe availability probe rents a number but the supplier does not confirm release.',
		body: 'A Numbers catalogue probe was not confirmed as released. Automated probes are paused until the recorded supplier reference is reviewed.',
		source: 'src/lib/services/phone-catalog-probe.ts'
	},
	{
		id: 'exception-number-probe-error',
		name: 'Numbers · catalogue probe failed after rent',
		subject: 'Numbers catalogue probe errored after rent',
		trigger:
			'A catalogue probe fails after obtaining a supplier number but before release is durably confirmed.',
		body: 'A Numbers catalogue probe failed after renting a number. Automated probes are paused until the recorded supplier reference is reconciled.',
		source: 'src/lib/services/phone-catalog-probe.ts'
	},
	{
		id: 'exception-number-sweep',
		name: 'Numbers · rental sweep unhealthy',
		subject: 'Numbers rental sweep needs attention',
		trigger:
			'The scheduled rental sweep leaves stale rentals unresolved or encounters confirmed errors.',
		body: 'The latest Numbers sweep left 1 stale rental and hit 1 error. Open Numbers Orders to review the affected items.',
		source: 'src/lib/services/phone-rental-sweep.ts'
	},
	{
		id: 'exception-automation-health',
		name: 'Automation · job unhealthy',
		subject: 'Automation job unhealthy: payment-reconciliation',
		trigger:
			'An automation job misses its expected schedule or crosses the consecutive-failure threshold.',
		body: `Job: payment-reconciliation
Expected schedule: every 5 minutes
Last successful run: 15 Sep, 12:40
Consecutive failures: 2
Reason: Request timed out`,
		source: 'src/lib/services/automation-health.ts'
	}
].map<EmailReviewDraft>((item) => ({
	...item,
	audience: 'Admin',
	classification: 'Operational',
	state: 'Live',
	timing: 'Immediately after the safeguard confirms the exception.',
	frequency:
		'Grouped by problem; normally no more than once every 30 minutes, with longer limits for some alerts.',
	protections:
		'Routine healthy activity sends nothing. Cooldowns group repeats and the underlying operation remains fail-safe.',
	preheader: deriveEmailPreheader(item.body, item.subject),
	ctaText: 'Open admin',
	ctaUrl: `${BASE_URL}/admin`,
	notes:
		'Sample IDs, values and error details replace live operational data. The subject and decision context match the send path.'
}));

export function getEmailReviewCatalog(): EmailReviewEntry[] {
	return [...customerEntries, ...adminEntries, ...exceptionEntries].map(entry);
}
