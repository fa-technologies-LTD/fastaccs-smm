export interface ProductLaunchEmailDraft {
	id: 'numbers_improved' | 'boosting_refresh' | 'account_delivery_privacy';
	label: string;
	subject: string;
	body: string;
}

export const NUMBERS_IMPROVED_ANNOUNCEMENT = {
	icon: '⚡',
	title: 'Numbers just got better',
	body: 'Faster sourcing, smoother code delivery, and automatic refunds when a code does not arrive.',
	ctaText: 'Maybe later',
	secondaryHref: '/numbers',
	secondaryText: 'Get a number →'
} as const;

export const BOOSTING_REFRESH_ANNOUNCEMENT = {
	icon: '🚀',
	title: 'Boosting just got easier',
	body: 'Pick a service, paste your link, and track delivery from your dashboard.',
	ctaText: 'Maybe later',
	secondaryHref: '/services',
	secondaryText: 'Start boosting →'
} as const;

export const PRODUCT_LAUNCH_EMAIL_DRAFTS: readonly ProductLaunchEmailDraft[] = [
	{
		id: 'account_delivery_privacy',
		label: 'Account delivery update',
		subject: 'Account details now stay in your dashboard',
		body: `Hi {{first_name}},

For your privacy, account login details now appear only in your dashboard. Order emails simply let you know when your accounts are ready.

Sign in and open Purchases to view your details. This does not remove details from older emails.

[View your orders](https://smm.fastaccs.com/dashboard?tab=purchases)`
	},
	{
		id: 'numbers_improved',
		label: 'Numbers improved',
		subject: 'Need a verification number?',
		body: `Hi {{first_name}},

Choose the app and country you need, get a number, and follow your code from the order page.

If no code arrives within the activation window, your payment is refunded automatically to store credit.

[Get a number](https://smm.fastaccs.com/numbers)`
	},
	{
		id: 'boosting_refresh',
		label: 'Boosting refresh',
		subject: 'Boosting, made simpler',
		body: `Hi {{first_name}},

Choose an available service, paste your link, and pick an amount. Follow your order from your dashboard.

No password needed.

[Start boosting](https://smm.fastaccs.com/services)`
	}
] as const;
