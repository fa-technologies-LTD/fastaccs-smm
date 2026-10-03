export interface ProductLaunchEmailDraft {
	id: 'numbers_improved' | 'boosting_refresh';
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
		id: 'numbers_improved',
		label: 'Numbers improved',
		subject: 'Numbers are now faster ⚡',
		body: `Hi {{first_name}},

Getting a verification number is now faster and smoother. Choose the app and country you need, then follow your code from the order page.

If no code arrives within the activation window, you are refunded automatically.

[Get a number](https://smm.fastaccs.com/numbers)`
	},
	{
		id: 'boosting_refresh',
		label: 'Boosting refresh',
		subject: 'Boosting just got easier 🚀',
		body: `Hi {{first_name}},

Our new Boosting flow is faster and easier to use. Choose a platform and result, paste your link, pick an amount, and track the order from your dashboard.

No password needed.

[Start boosting](https://smm.fastaccs.com/services)`
	}
] as const;
