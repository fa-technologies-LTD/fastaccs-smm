import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ManagedBoostingStorefront from './ManagedBoostingStorefront.svelte';
import { cart } from '$lib/stores/cart.svelte';

const notifications = vi.hoisted(() => ({ showSuccess: vi.fn() }));
vi.mock('$lib/stores/toasts', () => ({
	showSuccess: notifications.showSuccess,
	showError: vi.fn(),
	showWarning: vi.fn()
}));

const groups = [
	{
		categoryId: '11111111-1111-4111-8111-111111111111',
		platform: 'x' as const,
		platformLabel: 'X (Twitter)',
		outcome: 'followers',
		outcomeLabel: 'Followers',
		offers: [
			{
				id: '22222222-2222-4222-8222-222222222222',
				categoryId: '11111111-1111-4111-8111-111111111111',
				platform: 'x' as const,
				outcome: 'followers',
				customerName: 'Quick',
				shortPromise: 'Quick delivery, best when speed matters.',
				expectationChips: [],
				qualityTier: 'value',
				minQuantity: 500,
				maxQuantity: 100_000,
				stepQuantity: 500,
				quantityPresets: [500, 1000, 2500, 5000],
				pricePerStepNgn: 2000,
				refillDays: null,
				displayOrder: 0
			},
			{
				id: '33333333-3333-4333-8333-333333333333',
				categoryId: '11111111-1111-4111-8111-111111111111',
				platform: 'x' as const,
				outcome: 'followers',
				customerName: 'Stable',
				shortPromise: 'Less likely to drop. A balance of price and staying power.',
				expectationChips: ['30-day refill protection'],
				qualityTier: 'stable',
				minQuantity: 500,
				maxQuantity: 100_000,
				stepQuantity: 500,
				quantityPresets: [500, 1000, 2500, 5000],
				pricePerStepNgn: 5000,
				refillDays: 30,
				displayOrder: 1
			}
		]
	}
];

// Two platforms with several results each, as on the live page; Followers comes first on each.
function phoneGroups() {
	const base = groups[0].offers[0];
	const group = (platform: 'x' | 'facebook', outcome: string, label: string, index: number) => {
		const categoryId = `${index}1111111-1111-4111-8111-111111111111`;
		return {
			categoryId,
			platform,
			platformLabel: platform === 'x' ? 'X (Twitter)' : 'Facebook',
			outcome,
			outcomeLabel: label,
			offers: [
				{
					...base,
					id: `${index}2222222-2222-4222-8222-222222222222`,
					categoryId,
					platform,
					outcome
				}
			]
		};
	};
	return [
		group('x', 'followers', 'Followers', 1),
		group('x', 'likes', 'Likes', 2),
		group('x', 'views', 'Views', 3),
		group('x', 'reposts', 'Reposts', 4),
		group('facebook', 'followers', 'Page Followers', 5),
		group('facebook', 'likes', 'Likes', 6),
		group('facebook', 'comments', 'Comments', 7)
	];
}
const SAVED_CHOICE_KEY = 'fastaccs.boosting.choice';
const pressed = (name: string | RegExp) =>
	expect
		.element(page.getByRole('button', { name, exact: typeof name === 'string' }))
		.toHaveAttribute('aria-pressed', 'true');

describe('Managed Boosting storefront', () => {
	it('names options as the service pages do, keeps a refill as a note, and explains refill limits', async () => {
		render(ManagedBoostingStorefront, { groups });
		await expect.element(page.getByText('Quick', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Stable', { exact: true })).toBeVisible();
		await expect
			.element(
				page.getByText('Less likely to drop. A balance of price and staying power.', {
					exact: true
				})
			)
			.toBeVisible();
		await expect.element(page.getByText('30-day refill', { exact: true })).toBeVisible();
		for (const label of ['Lower price', 'No refill', 'Recommended'])
			expect(page.getByText(label, { exact: true }).query()).toBeNull();
		expect(page.getByText(/Delivery timing varies/).all()).toHaveLength(0);
		await expect
			.element(page.getByText('Refill terms (eligibility applies)', { exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: /Stable/ }).click();
		const terms = page.getByText('Refill terms (eligibility applies)', { exact: true });
		await expect.element(terms).toBeVisible();
		await expect.element(page.getByText(/not\s+a\s+guarantee\s+against\s+drops/)).not.toBeVisible();
		await terms.click();
		await expect.element(page.getByText(/not\s+a\s+guarantee\s+against\s+drops/)).toBeVisible();
		await expect
			.element(
				page.getByText(/normally\s+starts\s+when\s+your\s+order\s+is\s+sent\s+to\s+the\s+supplier/)
			)
			.toBeVisible();
		await page.getByRole('button', { name: /Quick/ }).click();
		await expect.element(terms).not.toBeInTheDocument();
	});
	it('keeps differing descriptions attached to their own options', async () => {
		render(ManagedBoostingStorefront, {
			groups: [
				{
					...groups[0],
					offers: groups[0].offers.map((offer, index) => ({
						...offer,
						shortPromise: index ? 'For public profiles.' : 'For public pages.'
					}))
				}
			]
		});
		await expect
			.element(page.getByRole('button', { name: /Quick/ }))
			.toHaveTextContent('For public pages.');
		await expect
			.element(page.getByRole('button', { name: /Stable/ }))
			.toHaveTextContent('For public profiles.');
	});
	it('shows a short refill label for a custom name and disables checkout in the local demo', async () => {
		const add = vi.spyOn(cart, 'addBoostingService').mockImplementation(() => {});
		render(ManagedBoostingStorefront, {
			groups: [{ ...groups[0], offers: [{ ...groups[0].offers[1], customerName: 'X Followers' }] }],
			previewOnly: true
		});
		await expect.element(page.getByText('30-day refill', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Preview only — checkout disabled' }))
			.toBeDisabled();
		expect(add).not.toHaveBeenCalled();
	});
	afterEach(() => {
		cart.close();
		notifications.showSuccess.mockClear();
		vi.restoreAllMocks();
		localStorage.removeItem(SAVED_CHOICE_KEY);
	});
	const customGroups = [
		{
			...groups[0],
			platform: 'tiktok' as const,
			platformLabel: 'TikTok',
			outcome: 'custom_comments',
			outcomeLabel: 'Custom comments',
			offers: [
				{
					...groups[0].offers[0],
					platform: 'tiktok' as const,
					outcome: 'custom_comments',
					customerName: 'Custom comments',
					minQuantity: 10,
					maxQuantity: 500,
					stepQuantity: 1,
					pricePerStepNgn: 10.5,
					quantityPresets: []
				}
			]
		}
	];
	it('counts custom comments rather than showing a separate quantity input', async () => {
		render(ManagedBoostingStorefront, { groups: customGroups });
		await page.getByLabelText('Your comments').fill('Love this!\nLovely colours!\nGreat work!');
		await expect.element(page.getByText('3 comments · One per line')).toBeVisible();
		await expect.element(page.getByRole('spinbutton')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add to Cart — ₦50' })).toBeVisible();
	});
	it('does not add too few custom comments and only shows the error after an attempt', async () => {
		const add = vi.spyOn(cart, 'addBoostingService').mockImplementation(() => {});
		render(ManagedBoostingStorefront, { groups: customGroups });
		await page.getByLabelText('Your comments').fill('Lovely!');
		await expect
			.element(page.getByText('Use at least 10 comments, in steps of 1.'))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: /Add to Cart/ }).click();
		await expect.element(page.getByText('Use at least 10 comments, in steps of 1.')).toBeVisible();
		expect(add).not.toHaveBeenCalled();
	});
	it('sends the exact approved comments and their count to the cart', async () => {
		const open = vi.spyOn(cart, 'open');
		vi.spyOn(cart, 'ensureDeliveryModeCompatibility').mockResolvedValue({
			compatible: true,
			existingMode: null
		});
		const add = vi.spyOn(cart, 'addBoostingService').mockImplementation(() => {});
		render(ManagedBoostingStorefront, { groups: customGroups });
		const comments = Array.from({ length: 10 }, (_, i) => `Lovely idea ${i + 1}!`).join('\n');
		await page.getByLabelText('Your comments').fill(comments);
		await page
			.getByLabelText('Paste your post or video link')
			.fill('https://www.tiktok.com/@faworldwidegifting/video/7599586070874918162');
		await page.getByRole('button', { name: /Add to Cart/ }).click();
		expect(add).toHaveBeenCalledWith(
			groups[0].categoryId,
			'https://www.tiktok.com/@faworldwidegifting/video/7599586070874918162',
			10,
			groups[0].offers[0].id,
			comments
		);
		expect(open).toHaveBeenCalled();
		expect(notifications.showSuccess).toHaveBeenCalledWith(
			'Added to cart!',
			expect.any(String),
			6000
		);
	});
	it('starts a cheap offer at ₦500 and keeps the existing quantity increment', async () => {
		const cheapGroups = [
			{
				...groups[0],
				offers: [
					{ ...groups[0].offers[0], minQuantity: 100, stepQuantity: 100, pricePerStepNgn: 50 }
				]
			}
		];
		render(ManagedBoostingStorefront, { groups: cheapGroups });
		await expect.element(page.getByRole('button', { name: 'Add to Cart — ₦500' })).toBeVisible();
		await expect.element(page.getByRole('spinbutton')).toHaveValue(1000);
		await page.getByRole('button', { name: 'Increase followers quantity by 100' }).click();
		await expect.element(page.getByRole('spinbutton')).toHaveValue(1100);
	});

	it('renders the approved platform, result, tier and working purchase controls', async () => {
		render(ManagedBoostingStorefront, { groups });

		await expect.element(page.getByRole('button', { name: /X \(Twitter\)/ }).first()).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Followers', exact: true }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /Quick/ })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Quick/ }))
			.toHaveTextContent('500 followers');
		await expect.element(page.getByRole('button', { name: /Stable/ })).toBeVisible();
		await expect.element(page.getByLabelText('Paste your profile link')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Add to Cart/ })).toBeEnabled();
	});
	it('uses the service name without a tier or recommendation when only one option exists', async () => {
		render(ManagedBoostingStorefront, {
			groups: [{ ...groups[0], offers: [{ ...groups[0].offers[0], customerName: 'Premium' }] }]
		});
		await expect.element(page.getByRole('button', { name: /500 followers/ })).toBeVisible();
		expect(page.getByText('Premium', { exact: true }).query()).toBeNull();
		expect(page.getByText('Recommended', { exact: true }).query()).toBeNull();
		expect(page.getByText('Pick what suits you', { exact: true }).query()).toBeNull();
	});

	it('glides the chosen result back into view on a phone when the platform changes', async () => {
		await page.viewport(390, 800);
		render(ManagedBoostingStorefront, { groups: phoneGroups() });
		const row = page
			.getByRole('button', { name: 'Followers', exact: true })
			.element().parentElement!;
		// Component tests load no stylesheet; give the row its phone layout (a sideways-scrolling strip).
		const layout = document.createElement('style');
		layout.textContent =
			'[data-phone-row]{display:flex;overflow-x:auto;width:360px}[data-phone-row]>*{flex:0 0 280px}';
		document.head.append(layout);
		row.dataset.phoneRow = '';
		row.scrollLeft = row.scrollWidth;
		await expect.poll(() => row.scrollLeft).toBeGreaterThan(100);
		await page.getByRole('button', { name: /Facebook/ }).click();
		await expect
			.element(page.getByRole('button', { name: 'Page Followers', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => row.scrollLeft).toBeLessThan(5);
		layout.remove();
	});

	it('reopens on the platform and result a customer last chose', async () => {
		const first = render(ManagedBoostingStorefront, { groups: phoneGroups() });
		await page.getByRole('button', { name: /Facebook/ }).click();
		await page.getByRole('button', { name: 'Comments', exact: true }).click();
		await pressed('Comments');
		await first.unmount();
		render(ManagedBoostingStorefront, { groups: phoneGroups() });
		await pressed(/Facebook/);
		await pressed('Comments');
	});

	it('starts on the first result when the saved one is gone or storage is blocked', async () => {
		localStorage.setItem(SAVED_CHOICE_KEY, JSON.stringify({ categoryId: 'gone' }));
		const first = render(ManagedBoostingStorefront, { groups: phoneGroups() });
		await pressed(/X \(Twitter\)/);
		await pressed('Followers');
		await first.unmount();
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		render(ManagedBoostingStorefront, { groups: phoneGroups() });
		await pressed('Followers');
		await page.getByRole('button', { name: 'Likes', exact: true }).click();
		await pressed('Likes');
	});

	it('does not remember choices made in the admin preview', async () => {
		render(ManagedBoostingStorefront, { groups: phoneGroups(), previewOnly: true });
		await page.getByRole('button', { name: /Facebook/ }).click();
		await pressed(/Facebook/);
		expect(localStorage.getItem(SAVED_CHOICE_KEY)).toBeNull();
	});

	it('brings a chosen result’s options up only when they sit below the screen', async () => {
		const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
		const toOptions = { block: 'nearest', behavior: 'smooth' };
		await page.viewport(390, 2000);
		render(ManagedBoostingStorefront, { groups: phoneGroups() });
		await page.getByRole('button', { name: 'Views', exact: true }).click();
		await pressed('Views');
		expect(scroll).not.toHaveBeenCalledWith(toOptions);
		await page.viewport(390, 240);
		// No stylesheet loads here, so give the chips real phone height: the options then start below the screen.
		const tall = document.createElement('style');
		tall.textContent = 'button{display:block;width:100%;min-height:160px}';
		document.head.append(tall);
		await page.getByRole('button', { name: 'Likes', exact: true }).click();
		await expect
			.poll(() =>
				scroll.mock.calls.some(([options]) => JSON.stringify(options) === JSON.stringify(toOptions))
			)
			.toBe(true);
		tall.remove();
		await page.viewport(390, 800);
	});

	it('fades the options in when the result changes, but not on first load', async () => {
		const animate = vi.spyOn(Element.prototype, 'animate');
		const fade = () =>
			animate.mock.calls.some(
				([, options]) => (options as KeyframeAnimationOptions)?.duration === 180
			);
		render(ManagedBoostingStorefront, { groups: phoneGroups() });
		await pressed('Followers');
		expect(fade()).toBe(false);
		await page.getByRole('button', { name: 'Likes', exact: true }).click();
		await expect.poll(fade).toBe(true);
	});
});
