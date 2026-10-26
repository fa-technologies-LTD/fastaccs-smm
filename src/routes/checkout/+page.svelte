<script lang="ts">
	import { boostQuantityText } from '$lib/helpers/boosting-customer-facts';
	import { onMount } from 'svelte';
	import { boostingMinimumMessage } from '$lib/helpers/boosting-checkout';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ShoppingBag,
		CreditCard,
		Check,
		Lock,
		Tag,
		X,
		Minus,
		Plus,
		ExternalLink,
		Edit,
		Gift,
		Wallet
	} from '$lib/icons';
	import AnimatedAmount from '$lib/components/checkout/AnimatedAmount.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import { brandKey } from '$lib/components/BrandIcon.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { createOrder } from '$lib/services/orders';
	import type { CreateOrderData } from '$lib/services/orders';
	import {
		computeOrderRedemption,
		EARNED_REDEMPTION_CAP_PERCENT
	} from '$lib/helpers/store-credit-redemption';
	import { matchesCheckoutQuote, type CheckoutQuote } from '$lib/helpers/checkout-quote';
	import type { CartItemWithTier } from '$lib/types/cart';
	import { formatPrice } from '$lib/helpers/utils';
	import { getPlatformIcon, isPlatformImageUrl } from '$lib/helpers/platformColors';
	import { validateLinkForAction } from '$lib/helpers/social-link-validator';
	import type { BoostingPlatform, BoostingActionType } from '$lib/helpers/social-link-validator';
	import { buildCheckoutFingerprint } from '$lib/helpers/checkout-session';
	import { recordAnalyticsEvent } from '$lib/services/analytics-events';
	import {
		getGa4ClientId,
		saveGa4CheckoutSnapshot,
		trackGa4AddPaymentInfo,
		trackGa4BeginCheckout,
		trackGa4ViewCart,
		type Ga4EventParams,
		type Ga4Item
	} from '$lib/services/ga4';

	let { data }: { data: PageData } = $props();

	// Reactive state
	let loading = $state(false);
	let affiliateCode = $state<string | null>(data.affiliateRef ?? null);
	let promoCodeInput = $state('');
	let promoAppliedCode = $state<string | null>(null);
	let promoDiscountAmount = $state(0);
	let promoValidationLoading = $state(false);
	// Code box: shown on demand; feedback stays inline (error under the field, a short celebration on success).
	let showCodeInput = $state(false);
	let promoError = $state('');
	let promoCelebrate = $state(false);
	let promoReplacesReferral = $state(false);
	let promoCelebrateTimer: ReturnType<typeof setTimeout> | undefined;
	let loadingCartData = $state(true);
	let cartLoadError = $state<string | null>(null);
	let checkoutSlow = $state(false);
	let lastCartNotice = $state('');
	let lastGa4CartKey = $state('');
	let lastAnalyticsCheckoutKey = $state('');
	let cartLoadPromise: Promise<void> | null = null;
	const PENDING_ORDER_STORAGE_KEY = 'fastaccs_pending_order_id';
	const CHECKOUT_SESSION_STORAGE_KEY = 'fastaccs_checkout_session';

	// Use user data directly from page data
	const user = $derived(data.user);

	// Cart items and total
	let cartItems = $state<CartItemWithTier[]>([]);
	let cartTotal = $state(0);
	let loadedCartSignature = $state('');
	let serverQuote = $state<CheckoutQuote | null>(null);
	let serverQuoteContext = $state('');
	let priceChangeMessage = $state('');
	let priceChangeContext = $state('');
	let savedAttempt = $state<CreateOrderData | null>(null);
	let failedCheckoutIcons = $state<Record<string, boolean>>({});
	function quoteContext() {
		return JSON.stringify([
			user?.id,
			applyStoreCredit,
			affiliateCode,
			promoAppliedCode,
			cartItems.map((item) => [
				getCartLineKey(item),
				item.quantity,
				item.boosting?.boostQuantity,
				item.boosting?.targetUrl,
				item.boosting?.comments,
				cart.getItemLinePrice(item)
			])
		]);
	}
	const activeServerQuote = $derived(serverQuoteContext === quoteContext() ? serverQuote : null);
	const currentPriceChangeMessage = $derived(
		priceChangeContext === quoteContext() ? priceChangeMessage : ''
	);
	const checkoutTotal = $derived(
		activeServerQuote?.total ?? Math.max(0, cartTotal - promoDiscountAmount)
	);

	// Store credit (signed-in buyers). Mirrors the server redemption rule so we can preview it: refund
	// credit pays up to 100% of the order, reward credit up to 30%, promo credit up to its campaign cap.
	// The server recomputes authoritatively at checkout, so this is only an estimate for display.
	// The buyer decides whether credit pays. Only promo credit (it expires) starts ticked. Instead of
	// spending credit for them, the credit row and the one-tap offer give a short shake on a buyer's
	// first few checkouts, so they learn the option is there.
	const hasPromoCreditAtLoad = () => (data.storeCredit?.promoAvailable ?? 0) > 0;
	let applyStoreCredit = $state(hasPromoCreditAtLoad());
	function setStoreCreditChoice(on: boolean) {
		applyStoreCredit = on;
		creditNudge = false;
	}
	const NUDGE_STORAGE_KEY = 'fastaccs_checkout_nudges';
	const NUDGES_PER_FEATURE = 3;
	let creditNudge = $state(false);
	let offerNudge = $state(false);
	let nudgesPlanned = false;
	/** True (and counted) while this buyer has seen fewer than three nudges for this feature. */
	function takeNudge(feature: 'credit' | 'offer'): boolean {
		if (!user?.id) return false;
		try {
			const key = `${NUDGE_STORAGE_KEY}:${user.id}`;
			const seen = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>;
			const count = Number(seen[feature] || 0);
			if (count >= NUDGES_PER_FEATURE) return false;
			localStorage.setItem(key, JSON.stringify({ ...seen, [feature]: count + 1 }));
			return true;
		} catch {
			return false;
		}
	}
	function nudge(set: (on: boolean) => void, delay: number) {
		setTimeout(() => set(true), delay);
		setTimeout(() => set(false), delay + 1500);
	}
	const storeCreditAvailable = $derived(data.storeCredit?.totalAvailable ?? 0);
	const promoCreditAvailable = $derived(data.storeCredit?.promoAvailable ?? 0);
	const promoCreditNote = $derived.by(() => {
		const promo = data.storeCredit?.promo ?? [];
		if (promoCreditAvailable <= 0 || promo.length === 0) return '';
		const caps = data.storeCredit?.promoCaps ?? {};
		const cap = Math.max(...promo.map((entry) => caps[entry.campaign] ?? 50));
		const soonest = promo
			.map((entry) => entry.nextExpiresAt)
			.filter((value): value is string => Boolean(value))
			.sort()[0];
		const expiry = soonest
			? new Date(soonest).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					timeZone: 'Africa/Lagos'
				})
			: '';
		return `Includes ${formatPrice(promoCreditAvailable)} promo credit · pays up to ${cap}% of an order${expiry ? ` · expires ${expiry}` : ''}`;
	});
	const creditEstimate = $derived(
		computeOrderRedemption(
			checkoutTotal,
			{
				refundAvailable: data.storeCredit?.refundAvailable ?? 0,
				earnedAvailable: data.storeCredit?.earnedAvailable ?? 0,
				promo: data.storeCredit?.promo ?? []
			},
			{ promoCaps: data.storeCredit?.promoCaps ?? {} }
		)
	);
	const storeCreditApplied = $derived.by(() => {
		if (!applyStoreCredit || storeCreditAvailable <= 0 || checkoutTotal <= 0) return 0;
		return activeServerQuote?.creditApplied ?? creditEstimate.totalApplied;
	});
	const payableTotal = $derived(Math.max(0, checkoutTotal - storeCreditApplied));
	const usesStoreCredit = $derived(applyStoreCredit && storeCreditAvailable > 0);
	const rewardCapPercent = Math.round(EARNED_REDEMPTION_CAP_PERCENT * 100);
	// One short line under the credit row: why part of the balance stays unused, or what is left.
	const storeCreditNote = $derived.by(() => {
		if (!applyStoreCredit || storeCreditApplied <= 0) return '';
		const reward = Math.floor(data.storeCredit?.earnedAvailable ?? 0);
		if (payableTotal > 0 && reward >= 1 && creditEstimate.earnedApplied < reward)
			return `${formatPrice(storeCreditAvailable)} balance · reward credit pays up to ${rewardCapPercent}% of an order`;
		const left = Math.max(0, storeCreditAvailable - storeCreditApplied);
		return left >= 1 ? `${formatPrice(left)} left after this order` : 'Uses all your store credit';
	});
	// An earlier attempt is only continued while the store-credit choice is unchanged. After the buyer
	// changes it (e.g. ticks credit after leaving Monnify), the next attempt is built from the screen and
	// replaces the earlier one under the same checkout key, so the server can cancel the old payment.
	const resumableAttempt = $derived(
		savedAttempt && Boolean(savedAttempt.useStoreCredit) === usesStoreCredit ? savedAttempt : null
	);
	const hasManualHandover = $derived(
		cartItems.some((item) => item.tier.deliveryMode === 'manual_handover')
	);
	const hasBoostingOrder = $derived(cartItems.some((item) => Boolean(item.boosting)));
	const hasNumbersOrder = $derived(cartItems.some((item) => item.tier.deliveryMode === 'auto_sms'));
	// Once per checkout visit, after the cart has loaded: shake what the buyer can use but hasn't.
	$effect(() => {
		if (nudgesPlanned || loadingCartData || !cartItems.length || !user) return;
		nudgesPlanned = true;
		const offer = data.availablePromo;
		const offerUsable =
			Boolean(offer) &&
			!promoAppliedCode &&
			!hasBoostingOrder &&
			!hasNumbersOrder &&
			cartTotal >= Number(offer?.minOrderValue || 0);
		const creditUsable = storeCreditAvailable > 0 && !applyStoreCredit;
		if (creditUsable && takeNudge('credit')) nudge((on) => (creditNudge = on), 600);
		if (offerUsable && takeNudge('offer'))
			nudge((on) => (offerNudge = on), creditUsable ? 1400 : 600);
	});
	// One line under the pay button: what happens next, for the kind of order in the cart.
	const deliveryNote = $derived.by(() => {
		const after = payableTotal > 0 ? 'after payment' : 'after you confirm';
		if (hasBoostingOrder) return `Delivery starts ${after}. Track it on your order page.`;
		if (hasNumbersOrder) return `Your number opens right ${after}. The code appears there.`;
		if (hasManualHandover)
			return 'We send the login details on WhatsApp. Your order page shows the link.';
		return `Login details appear on your dashboard right ${after}.`;
	});
	// A short glow on the pay button whenever the amount due changes (credit or a code applied).
	let payPulse = $state(false);
	let lastPayable: number | null = null;
	$effect(() => {
		const amount = payableTotal;
		const changed = lastPayable !== null && amount !== lastPayable;
		lastPayable = amount;
		if (!changed) return;
		payPulse = false;
		const frame = requestAnimationFrame(() => (payPulse = true));
		const timer = setTimeout(() => (payPulse = false), 650);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	});
	$effect(() => {
		const signature = JSON.stringify(cart.items);
		if (!loadingCartData && !loading && signature !== loadedCartSignature) void loadCartData(true);
	});

	onMount(() => {
		loading = false;
		savedAttempt = resumableRequest();
		void loadCartData();

		const refCode = page.url.searchParams.get('ref');
		if (refCode && !affiliateCode) {
			void validateAffiliateCode(refCode);
		}

		const resetLoadingState = () => {
			loading = false;
		};

		window.addEventListener('pageshow', resetLoadingState);

		return () => {
			window.removeEventListener('pageshow', resetLoadingState);
		};
	});

	function loadCartData(force = false): Promise<void> {
		if (cartLoadPromise) return cartLoadPromise;
		cartLoadPromise = performCartLoad(force).finally(() => {
			cartLoadPromise = null;
		});
		return cartLoadPromise;
	}

	// Return to the storefront section the shopper came from (numbers/boosting/accounts),
	// so an empty cart never dumps a numbers shopper onto the accounts page.
	function shopReturnPath(): string {
		if (typeof sessionStorage !== 'undefined') {
			const r = sessionStorage.getItem('shopReturn');
			if (r === '/numbers' || r === '/services' || r === '/platforms') return r;
		}
		return '/platforms';
	}
	const shopReturnLabel = $derived(
		shopReturnPath() === '/numbers'
			? 'Browse Numbers'
			: shopReturnPath() === '/services'
				? 'Browse Boosting'
				: 'Browse Accounts'
	);

	async function performCartLoad(force = false) {
		loadingCartData = true;
		cartLoadError = null;
		if (cart.itemCount === 0) {
			await goto(shopReturnPath());
			loadedCartSignature = JSON.stringify(cart.items);
			loadingCartData = false;
			return;
		}

		try {
			const previousContext = quoteContext();
			cartItems = await cart.getItemsWithTiers({ force });
			cartTotal = cart.getTotal(cartItems);
			if (cart.error) {
				cartLoadError = cart.error;
			}
			if (cart.notice && cart.notice !== lastCartNotice) {
				lastCartNotice = cart.notice;
				showWarning('Cart updated', cart.notice);
			}
			if (cartItems.length === 0 && cart.itemCount === 0 && !cart.error) {
				await goto(shopReturnPath());
				return;
			}
			// Cart mutation invalidates promo context. Re-apply manually for deterministic totals.
			if (promoAppliedCode && previousContext !== quoteContext()) {
				promoAppliedCode = null;
				promoDiscountAmount = 0;
			}
			if (cartItems.length > 0) {
				trackCheckoutCartView();
				// Keep the return path in sync with what's actually in the cart, so if the
				// cart later empties we send the shopper back to the right section.
				try {
					const section = cartItems.every((i) => i.tier.deliveryMode === 'auto_sms')
						? '/numbers'
						: cartItems.every((i) => Boolean(i.boosting))
							? '/services'
							: '/platforms';
					sessionStorage.setItem('shopReturn', section);
				} catch {
					/* ignore */
				}
			}
		} catch (error) {
			console.error('Failed to load cart data:', error);
			cartLoadError = 'We could not refresh your cart. Your saved items are still safe.';
		} finally {
			loadedCartSignature = JSON.stringify(cart.items);
			loadingCartData = false;
		}
	}

	async function validateAffiliateCode(code: string) {
		try {
			const response = await fetch(`/api/affiliate/validate?code=${encodeURIComponent(code)}`);
			const result = await response.json();

			if (result.valid) {
				affiliateCode = code.toUpperCase();
				showSuccess('Referral detected', `${affiliateCode} captured for referral pricing.`);
			} else {
				showWarning('Invalid affiliate code', 'The code you entered is not valid');
			}
		} catch (error) {
			console.error('Error validating affiliate code:', error);
		}
	}

	async function applyPromoCode() {
		if (!promoCodeInput.trim() || promoValidationLoading) {
			return;
		}

		promoValidationLoading = true;
		promoError = '';
		try {
			const response = await fetch('/api/promotions/validate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					code: promoCodeInput.trim(),
					subtotal: cartTotal,
					categoryIds: cartItems.map((item) => item.tierId),
					items: cartItems.map((item) => ({
						categoryId: item.tierId,
						quantity: item.quantity,
						unitPrice: cart.getItemLinePrice(item),
						totalPrice: cart.getItemLinePrice(item),
						productName: item.tier.name
					}))
				})
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Promo code is invalid.');
			}

			promoAppliedCode = result.data.code;
			promoDiscountAmount = Number(result.data.discountAmount || 0);
			promoReplacesReferral = Boolean(result.data.replacesReferralDiscount);
			showCodeInput = false;
			promoCelebrate = true;
			clearTimeout(promoCelebrateTimer);
			promoCelebrateTimer = setTimeout(() => (promoCelebrate = false), 900);
		} catch (error) {
			promoAppliedCode = null;
			promoDiscountAmount = 0;
			// Keep what they typed so a small typo is easy to fix; the message says what went wrong.
			promoError = error instanceof Error ? error.message : 'This code isn’t valid.';
		} finally {
			promoValidationLoading = false;
		}
	}

	function clearPromoCode() {
		promoAppliedCode = null;
		promoDiscountAmount = 0;
		promoCodeInput = '';
		promoError = '';
		promoReplacesReferral = false;
		promoCelebrate = false;
	}

	function redirectToLoginWithReturnUrl(): void {
		const currentUrl = new URL(window.location.href);
		const returnUrl = encodeURIComponent(currentUrl.pathname + currentUrl.search);
		goto(`/auth/login?returnUrl=${returnUrl}`);
	}

	function isUnauthorizedApiError(errorText: unknown): boolean {
		if (typeof errorText !== 'string') return false;
		return errorText.includes('HTTP 401');
	}

	function isEmailVerificationError(errorText: unknown): boolean {
		if (typeof errorText !== 'string') return false;
		return (
			errorText.includes('EMAIL_NOT_VERIFIED') || errorText.includes('Email verification required')
		);
	}

	function shouldRenderCheckoutPlatformImage(item: CartItemWithTier): boolean {
		return isPlatformImageUrl(item.tier.platformIcon) && !failedCheckoutIcons[item.tier.id];
	}

	function markCheckoutPlatformImageFailed(tierId: string): void {
		failedCheckoutIcons = {
			...failedCheckoutIcons,
			[tierId]: true
		};
	}

	function getCartLineKey(item: CartItemWithTier): string {
		return (
			item.cartItemId ||
			(item.exactAccount ? `exact:${item.exactAccount.accountId}` : `tier:${item.tierId}`)
		);
	}

	let editingBoostingLineKey = $state<string | null>(null);
	let editLinkDraft = $state('');
	let editLinkError = $state<string | null>(null);

	function startEditingBoostingLink(item: CartItemWithTier) {
		editingBoostingLineKey = getCartLineKey(item);
		editLinkDraft = item.boosting?.targetUrl || '';
		editLinkError = null;
	}

	function cancelEditingBoostingLink() {
		editingBoostingLineKey = null;
		editLinkError = null;
	}

	async function saveEditedBoostingLink(item: CartItemWithTier) {
		const value = editLinkDraft.trim();
		if (!value) {
			editLinkError = 'Please enter a link.';
			return;
		}

		const config = item.tier.boostingConfig;
		if (config) {
			const result = validateLinkForAction(
				config.platform as BoostingPlatform,
				config.actionType as BoostingActionType,
				value
			);
			if (!result.valid) {
				editLinkError = result.reason || 'Invalid link';
				return;
			}
		}

		const normalizedValue = config
			? validateLinkForAction(
					config.platform as BoostingPlatform,
					config.actionType as BoostingActionType,
					value
				).normalizedUrl || value
			: value;
		cart.updateBoostingLink(getCartLineKey(item), normalizedValue);
		editingBoostingLineKey = null;
		editLinkError = null;
		await loadCartData();
		showSuccess('Link updated', '');
	}

	function getCheckoutGa4Items(): Ga4Item[] {
		return cartItems.map((item, index) => ({
			item_id: item.tierId,
			item_name: item.tier.name,
			item_brand: 'FastAccs',
			item_category: item.boosting
				? 'Boosting Services'
				: item.tier.deliveryMode === 'auto_sms'
					? 'Verification Numbers'
					: 'SMM accounts',
			item_category2: item.tier.platformName,
			item_variant: item.boosting
				? 'boosting_service'
				: item.exactAccount
					? 'exact_profile'
					: 'standard_pool',
			price: cart.getItemLinePrice(item),
			quantity: item.quantity,
			index
		}));
	}

	function getCheckoutGa4Payload(orderId?: string): Ga4EventParams {
		const payload: Ga4EventParams = {
			currency: 'NGN',
			value: checkoutTotal,
			items: getCheckoutGa4Items(),
			affiliation: affiliateCode ? 'affiliate_referral' : 'FastAccs SMM',
			coupon: promoAppliedCode || undefined,
			number_items: cartItems.reduce((sum, item) => sum + item.quantity, 0)
		};

		if (orderId) {
			payload.transaction_id = orderId;
		}

		return payload;
	}

	function getCheckoutFingerprint(): string {
		return buildCheckoutFingerprint({
			userId: user?.id || null,
			items: cartItems.map((item) => ({
				id: getCartLineKey(item),
				tierId: item.tierId,
				quantity: item.quantity,
				exactAccountId: item.exactAccount?.accountId || null,
				accountAddonKey: item.accountAddon?.key || null
			})),
			affiliateCode,
			promotionCode: promoAppliedCode,
			total: checkoutTotal,
			useStoreCredit: applyStoreCredit && storeCreditAvailable > 0,
			storeCreditApplied,
			payableTotal
		});
	}

	function getOrCreateCheckoutKey(): string {
		const fingerprint = getCheckoutFingerprint();
		try {
			const stored = JSON.parse(localStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY) || 'null') as {
				fingerprint?: string;
				key?: string;
			} | null;
			if (stored?.fingerprint === fingerprint && stored.key) {
				return stored.key;
			}
		} catch {
			localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
		}

		const key = crypto.randomUUID();
		localStorage.setItem(CHECKOUT_SESSION_STORAGE_KEY, JSON.stringify({ fingerprint, key }));
		return key;
	}

	function resetCheckoutSession(): void {
		localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
		savedAttempt = null;
	}
	function displayedQuote(): CheckoutQuote {
		return {
			subtotal: cartTotal,
			discount: activeServerQuote?.discount ?? promoDiscountAmount,
			total: checkoutTotal,
			creditApplied: storeCreditApplied,
			payable: payableTotal,
			linePrices: cartItems.map((item) => cart.getItemLinePrice(item))
		};
	}
	function resumableRequest(): CreateOrderData | null {
		try {
			const saved = JSON.parse(localStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY) || 'null');
			return saved?.request?.userId === user?.id && saved.request.checkoutKey === saved.key
				? saved.request
				: null;
		} catch {
			return null;
		}
	}
	function rememberRequest(request: CreateOrderData) {
		savedAttempt = request;
		try {
			localStorage.setItem(
				CHECKOUT_SESSION_STORAGE_KEY,
				JSON.stringify({
					fingerprint: getCheckoutFingerprint(),
					key: request.checkoutKey,
					request: { ...request, analytics: undefined }
				})
			);
		} catch {
			/* the in-flight request remains stable even if browser storage is unavailable */
		}
	}

	function shouldRotateCheckoutSession(errorText: unknown): boolean {
		return (
			typeof errorText === 'string' &&
			/checkout session conflict|checkout payment option changed/i.test(errorText)
		);
	}

	function trackCheckoutCartView(): void {
		const items = getCheckoutGa4Items();
		const cartKey = `${checkoutTotal}|${items
			.map((item) => `${item.item_id}:${item.quantity}:${item.item_variant}`)
			.join('|')}`;

		if (!cartItems.length) return;
		if (
			cartKey !== lastAnalyticsCheckoutKey &&
			recordAnalyticsEvent('start_checkout', page.url.pathname)
		)
			lastAnalyticsCheckoutKey = cartKey;
		if (cartKey === lastGa4CartKey) return;

		if (
			trackGa4ViewCart({
				currency: 'NGN',
				value: checkoutTotal,
				items
			})
		) {
			lastGa4CartKey = cartKey;
		}
	}

	// ARCHIVED: wallet checkout (processCheckout) removed — wallet payments disabled.
	// See git history for the original implementation.

	async function payWithMonnify() {
		if (loading) return;
		if (cartItems.some((item) => item.boosting)) {
			const message = boostingMinimumMessage(checkoutTotal);
			if (message) {
				showWarning(message);
				return;
			}
		}

		if (!user) {
			redirectToLoginWithReturnUrl();
			return;
		}

		if (!user.emailVerified) {
			showWarning('Verify your email', 'Please verify your email before completing checkout.');
			const currentUrl = new URL(window.location.href);
			const nextPath = currentUrl.pathname + currentUrl.search;
			goto(`/verify-email?next=${encodeURIComponent(nextPath)}`);
			return;
		}

		loading = true;
		checkoutSlow = false;
		const slowTimer = window.setTimeout(() => {
			checkoutSlow = true;
		}, 6_000);
		try {
			const earlierAttempt = resumableRequest();
			let requestSnapshot =
				earlierAttempt && Boolean(earlierAttempt.useStoreCredit) === usesStoreCredit
					? earlierAttempt
					: null;
			// Replacing an earlier attempt keeps its key, so the server cancels that payment first.
			let replacedCheckoutKey =
				earlierAttempt && !requestSnapshot ? earlierAttempt.checkoutKey : null;
			if (!requestSnapshot) {
				const previousQuote = displayedQuote();
				await loadCartData(true);
				if (cartLoadError)
					throw new Error('Your cart could not be refreshed. Please retry before paying.');
				if (!cartItems.length) return;
				if (!matchesCheckoutQuote(previousQuote, displayedQuote())) {
					priceChangeMessage = `Your total changed from ${formatPrice(previousQuote.payable)} to ${formatPrice(payableTotal)}. Review the updated order before continuing.`;
					priceChangeContext = quoteContext();
					showWarning('Review your updated order', priceChangeMessage);
					return;
				}
			}

			const finalTotal = checkoutTotal;

			const createCheckoutOrder = async (timeoutMs = 30_000) => {
				const ga4ClientId = getGa4ClientId();
				const controller = new AbortController();
				const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
				try {
					requestSnapshot ??= {
						userId: user.id,
						email: user.email || '',
						phone: user.phone || '',
						items: cartItems.map((item) => ({
							categoryId: item.tierId,
							quantity: item.quantity,
							price: cart.getItemLinePrice(item),
							exactAccountId: item.exactAccount?.accountId,
							exactAccountLabel: item.exactAccount?.displayLabel,
							boostTargetUrl: item.boosting?.targetUrl,
							boostQuantity: item.boosting?.boostQuantity,
							boostOfferId: item.boosting?.boostOfferId,
							boostComments: item.boosting?.comments,
							accountAddonKey: item.accountAddon?.key
						})),
						totalAmount: finalTotal,
						acceptedQuote: displayedQuote(),
						currency: 'NGN',
						paymentMethod: 'monnify',
						checkoutKey: replacedCheckoutKey ?? getOrCreateCheckoutKey(),
						affiliateCode:
							hasBoostingOrder || hasNumbersOrder ? undefined : affiliateCode || undefined,
						promotionCode:
							hasBoostingOrder || hasNumbersOrder ? undefined : promoAppliedCode || undefined,
						useStoreCredit: usesStoreCredit,
						analytics: {
							ga4ClientId,
							consentGranted: Boolean(ga4ClientId)
						}
					};
					// Keep financial intent stable, but optional tracking must use CURRENT consent.
					requestSnapshot = {
						...requestSnapshot,
						analytics: { ga4ClientId, consentGranted: Boolean(ga4ClientId) }
					};
					rememberRequest(requestSnapshot);
					return await createOrder(requestSnapshot, { signal: controller.signal });
				} finally {
					window.clearTimeout(timeout);
				}
			};

			const waitForCheckoutInitialization = async (
				initialResult: Awaited<ReturnType<typeof createCheckoutOrder>>
			) => {
				let currentResult = initialResult;
				const deadline = Date.now() + 20_000;

				while (
					Date.now() < deadline &&
					(currentResult.unknownOutcome ||
						/checkout is still initializing/i.test(String(currentResult.error || '')))
				) {
					await new Promise((resolve) => window.setTimeout(resolve, 1_000));
					const remainingMs = deadline - Date.now();
					if (remainingMs <= 0) break;
					currentResult = await createCheckoutOrder(Math.min(5_000, remainingMs));
				}

				return currentResult;
			};

			// A shared browser can retain another account's checkout key. Rotate it once and retry.
			let orderResult = await createCheckoutOrder();
			// The POST is idempotent by checkout key. If the browser lost the response,
			// poll the same durable order until its hosted checkout URL is ready. This avoids
			// sending a buyer to order history just because provider initialization finished
			// a few seconds after the browser's first request timed out.
			if (
				orderResult.unknownOutcome ||
				/checkout is still initializing/i.test(String(orderResult.error || ''))
			) {
				orderResult = await waitForCheckoutInitialization(orderResult);
			}
			if (!orderResult.success && shouldRotateCheckoutSession(orderResult.error)) {
				resetCheckoutSession();
				requestSnapshot = null;
				replacedCheckoutKey = null;
				orderResult = await createCheckoutOrder();
			}

			if (!orderResult.success) {
				if (orderResult.code === 'CREDIT_UNAVAILABLE') {
					resetCheckoutSession();
					showWarning(
						'Store credit could not be checked',
						'No new payment was started. Please try again or choose not to use store credit.'
					);
					return;
				}
				if (orderResult.code === 'CHECKOUT_PRICE_CHANGED' && orderResult.quote) {
					resetCheckoutSession();
					await loadCartData(true);
					if (cartLoadError) throw new Error('Please refresh your cart before continuing.');
					serverQuote =
						orderResult.quote.subtotal === cartTotal &&
						orderResult.quote.linePrices.length === cartItems.length &&
						orderResult.quote.linePrices.every(
							(price: number, i: number) => price === cart.getItemLinePrice(cartItems[i])
						)
							? orderResult.quote
							: null;
					serverQuoteContext = quoteContext();
					priceChangeMessage = `Your checkout amount changed to ${formatPrice(orderResult.quote.payable)}. Review the updated total before continuing.`;
					priceChangeContext = quoteContext();
					showWarning('Review your updated total', priceChangeMessage);
					return;
				}
				if (isUnauthorizedApiError(orderResult.error)) {
					showWarning('Session expired', 'Please log in again to continue checkout.');
					redirectToLoginWithReturnUrl();
					return;
				}
				if (isEmailVerificationError(orderResult.error)) {
					showWarning('Verify your email', 'Please verify your email before completing checkout.');
					const currentUrl = new URL(window.location.href);
					const nextPath = currentUrl.pathname + currentUrl.search;
					goto(`/verify-email?next=${encodeURIComponent(nextPath)}`);
					return;
				}
				if (/checkout is still initializing/i.test(String(orderResult.error || ''))) {
					const savedOrderId = String(orderResult.orderId || '');
					if (savedOrderId) sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, savedOrderId);
					showWarning(
						'Your order is saved',
						'Payment setup is taking longer than expected. Open My Orders to continue safely.'
					);
					goto(
						savedOrderId
							? `/dashboard?tab=orders&orderId=${encodeURIComponent(savedOrderId)}&paymentPending=1`
							: '/dashboard?tab=orders&paymentPending=1'
					);
					return;
				}
				// Only explicit pre-payment refusals may reset an attempt. A gateway outage
				// containing similar English wording can have an uncertain, already-saved outcome.
				if (
					orderResult.code === 'ITEM_UNAVAILABLE' ||
					orderResult.code === 'number_unavailable' ||
					orderResult.code === 'BOOSTING_PAUSED'
				) {
					showWarning(
						'This option is currently unavailable',
						'You haven’t been charged. Your other cart items are unchanged. Choose another option or try again later.'
					);
					resetCheckoutSession();
					await loadCartData(true);
					loading = false;
					return;
				}
				if (
					String(orderResult.error || '')
						.toLowerCase()
						.includes('refresh your cart')
				) {
					await loadCartData();
				}
				// A confirmed input-validation rejection did not create a payable order.
				// Let the buyer correct the form instead of replaying that rejected request forever.
				if (!orderResult.orderId && /^HTTP 400:/i.test(String(orderResult.error || '')))
					resetCheckoutSession();
				throw new Error(orderResult.error || 'Failed to create order');
			}

			const resolvedOrderId = String(orderResult.orderId || '');
			const ga4CheckoutPayload = getCheckoutGa4Payload(resolvedOrderId);
			if (orderResult.resumed) {
				// The displayed basket may have changed since this saved order was created.
				// Use its durable amount and do not invent current-basket product attribution.
				ga4CheckoutPayload.value = Number(
					orderResult.data?.totalAmount ?? requestSnapshot?.totalAmount ?? checkoutTotal
				);
				ga4CheckoutPayload.items = [];
			}
			trackGa4BeginCheckout(ga4CheckoutPayload);
			if (resolvedOrderId && !orderResult.resumed) {
				saveGa4CheckoutSnapshot({
					orderId: resolvedOrderId,
					value: checkoutTotal,
					currency: 'NGN',
					items: getCheckoutGa4Items(),
					coupon: promoAppliedCode || undefined,
					affiliation: affiliateCode ? 'affiliate_referral' : 'FastAccs SMM',
					createdAt: Date.now(),
					purchaseReporter:
						orderResult.data?.ga4PurchaseReporter === 'server' ? 'server' : 'browser'
				});
			}

			// Store credit covered the full total — no gateway payment. Route to the
			// verify page, which settles/fulfils the already-paid order and shows the
			// standard success UI.
			if (orderResult.paidWithStoreCredit && orderResult.redirectUrl) {
				if (resolvedOrderId) {
					sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, resolvedOrderId);
				}
				trackGa4AddPaymentInfo({ ...ga4CheckoutPayload, payment_type: 'Store credit' });
				window.location.href = orderResult.redirectUrl;
				return;
			}
			if (orderResult.alreadyPaid && orderResult.redirectUrl) {
				if (resolvedOrderId) {
					sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, resolvedOrderId);
				}
				trackGa4AddPaymentInfo({ ...ga4CheckoutPayload, payment_type: 'Monnify' });
				window.location.href = orderResult.redirectUrl;
				return;
			}

			if (!orderResult.checkoutUrl) {
				throw new Error(orderResult.error || 'Failed to initialize payment');
			}

			trackGa4AddPaymentInfo({
				...ga4CheckoutPayload,
				payment_type: 'Monnify'
			});
			sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, resolvedOrderId);
			window.location.href = orderResult.checkoutUrl;
		} catch (error) {
			console.error('Payment initialization error:', error);
			if (error instanceof Error && isUnauthorizedApiError(error.message)) {
				showWarning('Session expired', 'Please log in again to continue checkout.');
				redirectToLoginWithReturnUrl();
				loading = false;
				return;
			}
			if (error instanceof Error && isEmailVerificationError(error.message)) {
				showWarning('Verify your email', 'Please verify your email before completing checkout.');
				const currentUrl = new URL(window.location.href);
				const nextPath = currentUrl.pathname + currentUrl.search;
				goto(`/verify-email?next=${encodeURIComponent(nextPath)}`);
				loading = false;
				return;
			}
			const message = error instanceof Error ? error.message : 'Please try again.';
			if (/timed out|failed to create order/i.test(message)) {
				showWarning(
					'We’re finishing this safely',
					'Open My Orders to see the saved checkout status. Don’t start a second payment.'
				);
				goto('/dashboard?tab=orders&paymentPending=1');
			} else {
				showError('Checkout could not start', message);
			}
			loading = false;
		} finally {
			window.clearTimeout(slowTimer);
			checkoutSlow = false;
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Checkout - FastAccs</title>
	<meta name="description" content="Complete your purchase securely on FastAccs" />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Navigation />

<main class="min-h-screen py-4 sm:py-8" style="background: var(--bg);">
	<div class="mx-auto max-w-3xl px-4 sm:px-6">
		<!-- Header -->
		<div class="mb-6 sm:mb-8">
			<h1
				style="font-size: 1.25rem; font-weight: 700; color: var(--text); font-family: var(--font-head);"
				class="sm:text-xl"
			>
				Checkout
			</h1>
		</div>

		{#if loadingCartData && cartItems.length === 0}
			<!-- Loading Spinner -->
			<div
				class="rounded-lg p-12 text-center shadow-sm sm:p-16"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<div class="mx-auto mb-6 flex items-center justify-center">
					<svg
						class="animate-spin"
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<circle
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							style="opacity: 0.25; color: var(--primary);"
						/>
						<path
							d="M12 2a10 10 0 0 1 10 10"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							style="color: var(--primary);"
						/>
					</svg>
				</div>
				<h2
					class="mb-2 text-lg font-semibold sm:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Loading your cart...
				</h2>
				<p
					class="text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					Please wait while we prepare your checkout
				</p>
			</div>
		{:else if cartLoadError && cartItems.length === 0}
			<div
				class="rounded-lg p-8 text-center shadow-sm sm:p-12"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<ShoppingBag
					size={48}
					class="mx-auto mb-4 sm:h-16 sm:w-16"
					style="color: var(--text-dim);"
				/>
				<h2
					class="mb-2 text-lg font-semibold sm:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Your cart is still here
				</h2>
				<p
					class="mx-auto mb-6 max-w-md text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					{cartLoadError}
				</p>
				<button
					onclick={() => loadCartData()}
					class="rounded-full px-6 py-2.5 text-sm font-semibold transition-all sm:px-8 sm:py-3 sm:text-base"
					style="background: var(--btn-primary-gradient); color: #04140c;"
				>
					Retry cart
				</button>
			</div>
		{:else if cartItems.length === 0}
			<div
				class="rounded-lg p-8 text-center shadow-sm sm:p-12"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<ShoppingBag
					size={48}
					class="mx-auto mb-4 sm:h-16 sm:w-16"
					style="color: var(--text-dim);"
				/>
				<h2
					class="mb-2 text-lg font-semibold sm:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Your cart is empty
				</h2>
				<p
					class="mb-6 text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					Add some accounts to continue with checkout
				</p>
				<button
					onclick={() => goto(shopReturnPath())}
					class="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all sm:px-8 sm:py-3 sm:text-base"
					style="background: var(--btn-primary-gradient);"
				>
					{shopReturnLabel}
				</button>
			</div>
		{:else}
			<div class="flex flex-col gap-4 sm:gap-6">
				<!-- Order Summary -->
				<div class="order-1">
					<div
						class="rounded-lg p-4 shadow-sm sm:p-6"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<h3
							class="mb-6 text-base font-semibold sm:text-lg"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Order Summary
						</h3>

						<!-- Cart Items -->
						<div class="space-y-4 sm:space-y-5">
							{#each cartItems as item (getCartLineKey(item))}
								{@const PlatformIcon = getPlatformIcon(item.tier.platformSlug)}
								{@const renderPlatformImage = shouldRenderCheckoutPlatformImage(item)}
								{@const isNumber =
									item.tier.deliveryMode === 'auto_sms' && Boolean(brandKey(item.tier.name))}
								<div class="flex gap-3">
									<div
										class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br sm:h-16 sm:w-16 {item
											.tier.platformSlug === 'instagram' && !renderPlatformImage
											? 'from-pink-500 to-purple-600'
											: item.tier.platformSlug === 'tiktok' && !renderPlatformImage
												? 'from-black to-gray-800'
												: item.tier.platformSlug === 'facebook' && !renderPlatformImage
													? 'from-blue-600 to-blue-700'
													: (item.tier.platformSlug === 'twitter' ||
																item.tier.platformSlug === 'x') &&
														  !renderPlatformImage
														? 'from-blue-400 to-blue-500'
														: !renderPlatformImage
															? 'from-gray-500 to-gray-600'
															: ''}"
									>
										<div
											class="flex h-full w-full items-center justify-center"
											style={isNumber ? 'background: var(--bg-elev-2);' : ''}
										>
											{#if isNumber}
												<BrandIcon service={item.tier.name} size={28} />
											{:else if renderPlatformImage}
												<img
													src={item.tier.platformIcon}
													alt={item.tier.platformName}
													class="h-full w-full object-contain p-2"
													style="background: rgba(255,255,255,0.06);"
													onerror={() => markCheckoutPlatformImageFailed(item.tier.id)}
												/>
											{:else}
												<PlatformIcon size={20} class="text-white sm:h-6 sm:w-6" />
											{/if}
										</div>
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex items-start justify-between">
											<div class="min-w-0 flex-1">
												<h4
													class="line-clamp-2 text-xs font-medium sm:text-sm"
													style="color: var(--text); font-family: var(--font-head);"
												>
													{item.tier.name}
												</h4>
												{#if !item.boosting}<p
														class="text-xs"
														style="color: var(--text-muted); font-family: var(--font-body);"
													>
														{item.tier.platformName}
													</p>{/if}
												{#if item.boosting && item.tier.boostingConfig?.benefitLabel && !item.tier.name
														.toLowerCase()
														.includes(item.tier.boostingConfig.benefitLabel.toLowerCase())}
													<p class="mt-1 text-xs font-medium" style="color: var(--text-muted);">
														{item.tier.boostingConfig.benefitLabel}
													</p>
												{/if}
												{#if item.exactAccount}
													<a
														href={item.exactAccount.profileUrl}
														target="_blank"
														rel="noopener noreferrer"
														class="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
														style="background: rgba(5, 212, 113, 0.1); border: 1px solid rgba(5, 212, 113, 0.24); color: var(--primary);"
													>
														Exact: {item.exactAccount.displayLabel}
														<ExternalLink size={12} />
													</a>
												{/if}
												{#if item.accountAddon}
													<p class="mt-1 text-xs font-semibold" style="color: var(--primary);">
														{item.accountAddon.label} add-on
													</p>
												{/if}
												{#if item.boosting}
													{#if editingBoostingLineKey === getCartLineKey(item)}
														<div class="mt-1 flex items-center gap-1.5">
															<input
																type="url"
																bind:value={editLinkDraft}
																class="min-w-0 flex-1 rounded-md px-2 py-1 text-xs"
																style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
															/>
															<button
																type="button"
																onclick={() => saveEditedBoostingLink(item)}
																class="rounded-full px-2 py-1 text-xs font-semibold"
																style="background: var(--primary); color: #000;"
															>
																Save
															</button>
															<button
																type="button"
																onclick={cancelEditingBoostingLink}
																class="rounded-full px-2 py-1 text-xs font-medium"
																style="background: var(--surface); color: var(--text-muted); border: 1px solid var(--border);"
															>
																Cancel
															</button>
														</div>
														{#if editLinkError}
															<p class="mt-1 text-xs text-red-500">{editLinkError}</p>
														{/if}
													{:else}
														<div class="mt-1 flex max-w-full items-center gap-1">
															<a
																href={item.boosting.targetUrl}
																target="_blank"
																rel="noopener noreferrer"
																class="flex min-w-0 flex-1 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
																style="background: rgba(5, 212, 113, 0.1); border: 1px solid rgba(5, 212, 113, 0.24); color: var(--primary);"
															>
																<span class="min-w-0 truncate">{item.boosting.targetUrl}</span>
																<ExternalLink size={12} class="flex-shrink-0" />
															</a>
															<button
																type="button"
																onclick={() => startEditingBoostingLink(item)}
																class="flex-shrink-0 rounded-full p-1"
																style="background: var(--surface); color: var(--text-dim); border: 1px solid var(--border);"
																title="Edit link"
																aria-label="Edit link"
															>
																<Edit size={12} />
															</button>
														</div>
													{/if}
												{/if}
											</div>
											<button
												onclick={async () => {
													cart.removeItem(getCartLineKey(item));
													await loadCartData();
												}}
												style="color: var(--text-dim);"
												class="hover:text-red-600"
												title="Remove item"
											>
												<X size={16} />
											</button>
										</div>

										<!-- Quantity Controls -->
										<div class="mt-2 flex items-center gap-2">
											{#if item.boosting}
												<span
													class="rounded-md px-2 py-1 text-xs font-semibold"
													style="border: 1px solid var(--border); color: var(--text-muted); background: var(--bg-elev-2);"
												>
													{boostQuantityText(
														item.boosting.boostQuantity,
														item.tier.boostingConfig?.actionType ?? ''
													)}
												</span>
											{:else if item.exactAccount || item.tier.deliveryMode === 'auto_sms'}
												<span
													class="rounded-md px-2 py-1 text-xs font-semibold"
													style="border: 1px solid var(--border); color: var(--text-muted); background: var(--bg-elev-2);"
												>
													{item.tier.deliveryMode === 'auto_sms' ? '1 number' : '1 account'}
												</span>
											{:else}
												<div
													class="flex items-center gap-1 rounded-md"
													style="border: 1px solid var(--border);"
												>
													<button
														onclick={async () => {
															if (item.quantity > 1) {
																cart.updateItemQuantity(getCartLineKey(item), item.quantity - 1);
																await loadCartData();
															}
														}}
														disabled={item.quantity <= 1}
														style="color: var(--text-muted); background: transparent;"
														class="px-2 py-1 hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
													>
														<Minus size={14} />
													</button>
													<span
														class="min-w-[2rem] text-center text-sm font-medium"
														style="color: var(--text); font-family: var(--font-body);"
													>
														{item.quantity}
													</span>
													<button
														onclick={async () => {
															cart.updateItemQuantity(getCartLineKey(item), item.quantity + 1);
															await loadCartData();
														}}
														style="color: var(--text-muted); background: transparent;"
														class="px-2 py-1 hover:bg-[var(--surface)]"
													>
														<Plus size={14} />
													</button>
												</div>
											{/if}
											<p
												class="text-sm font-semibold"
												style="color: var(--primary); font-family: var(--font-body);"
											>
												{formatPrice(cart.getItemLinePrice(item))}
											</p>
										</div>
									</div>
								</div>
							{/each}
						</div>

						<hr class="my-8" style="border-color: var(--border);" />

						{#if !hasBoostingOrder && !hasNumbersOrder}
							<div class="mb-4 space-y-2" style="font-family: var(--font-body);">
								{#if promoAppliedCode}
									<div
										class="promo-applied flex items-center gap-3 rounded-xl p-3"
										class:promo-applied--celebrate={promoCelebrate}
										role="status"
									>
										<span class="promo-applied__check" aria-hidden="true">
											<Check size={16} />
											{#if promoCelebrate}
												{#each [0, 1, 2, 3, 4, 5, 6, 7] as spark (spark)}
													<i style="--spark: {spark}"></i>
												{/each}
											{/if}
										</span>
										<span class="min-w-0 flex-1">
											<span class="block text-sm font-semibold" style="color: var(--text);"
												>{promoAppliedCode} applied</span
											>
											{#if promoReplacesReferral}
												<span class="block text-xs" style="color: var(--text-muted);"
													>Used instead of your referral discount</span
												>
											{/if}
										</span>
										<span class="shrink-0 text-right">
											<span class="block text-[11px]" style="color: var(--text-muted);"
												>You save</span
											>
											<span class="block text-sm font-bold" style="color: var(--primary);">
												<AnimatedAmount
													value={activeServerQuote?.discount ?? promoDiscountAmount}
													from={0}
												/>
											</span>
										</span>
										<button
											type="button"
											onclick={clearPromoCode}
											class="shrink-0 text-xs underline"
											style="color: var(--text-muted);">Remove</button
										>
									</div>
								{:else}
									{#if data.availablePromo}
										{@const offerShortBy = Math.max(
											0,
											Number(data.availablePromo.minOrderValue || 0) - cartTotal
										)}
										<button
											type="button"
											onclick={() => {
												promoCodeInput = data.availablePromo!.code;
												void applyPromoCode();
											}}
											disabled={promoValidationLoading || offerShortBy > 0}
											class="offer-card flex w-full items-center gap-3 rounded-xl p-3 text-left"
											class:nudge={offerNudge}
										>
											<span class="offer-card__icon" aria-hidden="true"><Gift size={18} /></span>
											<span class="min-w-0 flex-1">
												<span class="block text-sm font-semibold" style="color: var(--text);"
													>{data.availablePromo.label}</span
												>
												<span
													class="block text-xs"
													style="color: {offerShortBy > 0
														? 'var(--primary)'
														: 'var(--text-muted)'};"
													>{offerShortBy > 0
														? `Add ${formatPrice(offerShortBy)} more to use it`
														: 'Your first-order offer'}</span
												>
											</span>
											{#if offerShortBy <= 0}
												<span class="offer-card__cta"
													>{promoValidationLoading && promoCodeInput === data.availablePromo.code
														? 'Applying…'
														: 'Apply'}</span
												>
											{/if}
										</button>
									{/if}
									{#if showCodeInput}
										<form
											class="flex items-center gap-2"
											onsubmit={(event) => {
												event.preventDefault();
												void applyPromoCode();
											}}
										>
											<input
												type="text"
												bind:value={promoCodeInput}
												oninput={() => (promoError = '')}
												placeholder="Enter promo code"
												aria-label="Promo code"
												aria-invalid={promoError ? 'true' : undefined}
												autocomplete="off"
												autocapitalize="characters"
												class="w-full rounded-lg px-3 py-2 text-sm uppercase placeholder:normal-case"
												style="border: 1px solid {promoError
													? 'var(--status-error)'
													: 'var(--border)'}; background: var(--bg-elev-1); color: var(--text);"
											/>
											<button
												type="submit"
												disabled={promoValidationLoading || !promoCodeInput.trim()}
												class="btn-fa btn-fa--primary shrink-0 px-4 text-xs"
											>
												{promoValidationLoading ? 'Checking…' : 'Apply'}
											</button>
										</form>
									{:else}
										<button
											type="button"
											onclick={() => (showCodeInput = true)}
											class="text-xs font-semibold"
											style="color: var(--primary);">Have a promo code?</button
										>
									{/if}
									{#if promoError}
										<p class="text-xs" role="alert" style="color: var(--status-error);">
											{promoError}
										</p>
									{/if}
								{/if}
							</div>
						{/if}

						<!-- Total -->
						<div class="space-y-3">
							<div class="flex justify-between text-xs sm:text-sm">
								<span style="color: var(--text-muted); font-family: var(--font-body);"
									>Subtotal</span
								>
								<span class="font-medium" style="color: var(--text); font-family: var(--font-body);"
									>{formatPrice(cartTotal)}</span
								>
							</div>
							{#if (activeServerQuote?.discount ?? promoDiscountAmount) > 0}
								<div
									class="flex justify-between text-xs font-semibold sm:text-sm"
									style="color: var(--primary); font-family: var(--font-body);"
								>
									<span class="flex items-center gap-1">
										<Tag size={14} />
										{promoAppliedCode
											? 'Promo discount'
											: affiliateCode
												? 'Referral savings'
												: 'Discount'}
									</span>
									<span>-{formatPrice(activeServerQuote?.discount ?? promoDiscountAmount)}</span>
								</div>
							{/if}
							<div class="flex justify-between text-xs sm:text-sm">
								<span style="color: var(--text-muted); font-family: var(--font-body);"
									>Processing Fee</span
								>
								<span class="font-medium" style="color: var(--text); font-family: var(--font-body);"
									>Free</span
								>
							</div>
							{#if storeCreditAvailable > 0}
								<label
									class="flex cursor-pointer items-start justify-between gap-3 rounded-lg p-3"
									class:nudge={creditNudge}
									style="background: var(--bg-elev-2); border: 1px solid var(--border-2); font-family: var(--font-body);"
								>
									<span class="flex min-w-0 items-start gap-2">
										<input
											type="checkbox"
											checked={applyStoreCredit}
											onchange={(event) => setStoreCreditChoice(event.currentTarget.checked)}
											class="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
											style="accent-color: var(--primary);"
										/>
										<span class="min-w-0">
											<span
												class="block text-xs font-medium sm:text-sm"
												style="color: var(--text);"
											>
												{applyStoreCredit
													? 'Store credit'
													: `Use your ${formatPrice(storeCreditAvailable)} store credit`}
											</span>
											{#if storeCreditNote}
												<span class="mt-0.5 block text-xs" style="color: var(--text-muted);"
													>{storeCreditNote}</span
												>
											{/if}
											{#if applyStoreCredit && promoCreditNote}
												<span class="mt-0.5 block text-xs" style="color: var(--text-muted);"
													>{promoCreditNote}</span
												>
											{/if}
										</span>
									</span>
									{#if storeCreditApplied > 0}
										<span
											class="shrink-0 text-xs font-semibold sm:text-sm"
											style="color: var(--primary);">-{formatPrice(storeCreditApplied)}</span
										>
									{/if}
								</label>
							{/if}
							<hr style="border-color: var(--border);" />
							<div class="flex items-baseline justify-between">
								<span
									class="text-base font-semibold sm:text-lg"
									style="color: var(--text); font-family: var(--font-head);">To pay</span
								>
								<span
									class="text-2xl font-bold sm:text-3xl"
									style="color: var(--primary); font-family: var(--font-head);"
								>
									<AnimatedAmount value={payableTotal} />
								</span>
							</div>
						</div>
						<!-- Complete checkout -->
						{#if resumableAttempt}
							<p
								role="status"
								class="mt-4 rounded-lg border p-3 text-sm"
								style="border-color: var(--border); color: var(--text-muted);"
							>
								You started a {formatPrice(
									resumableAttempt.acceptedQuote?.payable ?? resumableAttempt.totalAmount
								)} payment earlier.
								<a class="underline" href="/dashboard?tab=orders">See it in My Orders</a>
							</p>
						{:else if savedAttempt}
							<p
								role="status"
								class="mt-4 rounded-lg border p-3 text-sm"
								style="border-color: var(--border); color: var(--text-muted);"
							>
								This replaces your earlier {formatPrice(
									savedAttempt.acceptedQuote?.payable ?? savedAttempt.totalAmount
								)} checkout.
							</p>
						{/if}
						{#if currentPriceChangeMessage}
							<p
								role="status"
								class="mt-4 rounded-lg border p-3 text-sm"
								style="border-color: var(--status-warning); color: var(--text);"
							>
								{currentPriceChangeMessage}
							</p>
						{/if}
						{#if !user}
							<p
								class="mt-4 text-center text-xs"
								style="color: var(--text-muted); font-family: var(--font-body);"
							>
								Have store credit? Sign in to use it.
							</p>
						{/if}
						<button
							onclick={payWithMonnify}
							disabled={loading || loadingCartData}
							aria-busy={loading}
							class="btn-fa btn-fa--primary pay-button w-full py-3 sm:py-4 sm:text-base {user
								? 'mt-6'
								: 'mt-3'}"
							class:pay-button--pulse={payPulse}
						>
							{#if loading}
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-[#04140C] border-t-transparent sm:h-5 sm:w-5"
								></div>
								<span class="text-sm sm:text-base"
									>{payableTotal <= 0
										? checkoutSlow
											? 'Still applying safely…'
											: 'Applying your store credit…'
										: checkoutSlow
											? 'Saving your order…'
											: 'Securing your order…'}</span
								>
								<span class="pay-button__progress" aria-hidden="true"></span>
							{:else if !user}
								<Lock size={18} class="sm:h-5 sm:w-5" />
								<span class="text-sm sm:text-base">Sign in to continue</span>
							{:else if resumableAttempt}
								<span class="text-sm sm:text-base">Finish that payment</span>
							{:else if currentPriceChangeMessage}
								<span class="text-sm sm:text-base">Confirm updated total &amp; continue</span>
							{:else if payableTotal <= 0}
								<Wallet size={18} class="sm:h-5 sm:w-5" />
								<span class="text-sm sm:text-base">Pay with store credit</span>
							{:else}
								<CreditCard size={18} class="sm:h-5 sm:w-5" />
								<span class="text-sm sm:text-base">Pay <AnimatedAmount value={payableTotal} /></span
								>
							{/if}
						</button>
						<p
							class="mt-3 text-center text-xs leading-relaxed"
							style="color: var(--text-dim); font-family: var(--font-body);"
						>
							{payableTotal > 0
								? 'Secure payment by Monnify · '
								: 'Nothing to pay by card. '}{deliveryNote}
						</p>
						<p
							class="mt-1 text-center text-xs leading-relaxed"
							style="color: var(--text-dim); font-family: var(--font-body);"
						>
							By {payableTotal > 0 ? 'paying' : 'confirming'} you agree to our
							<a href="/terms" class="hover:underline" style="color: var(--link);">Terms</a> and
							<a href="/refund-policy" class="hover:underline" style="color: var(--link);"
								>Refund Policy</a
							>.
						</p>
					</div>
				</div>
			</div>
		{/if}
	</div>
</main>

<Footer />

<style>
	/* Pay button: a soft shine on hover, a press-in on tap, a glow when the amount changes, and a
	   moving bar while the order is being secured. All of it stops under reduced motion. */
	.pay-button {
		position: relative;
		overflow: hidden;
		transition:
			transform 120ms ease,
			box-shadow 200ms ease;
	}
	.pay-button:active:not(:disabled) {
		transform: scale(0.98);
	}
	.pay-button::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			110deg,
			transparent 30%,
			rgba(255, 255, 255, 0.32) 50%,
			transparent 70%
		);
		transform: translateX(-120%);
		pointer-events: none;
	}
	@media (hover: hover) {
		.pay-button:not(:disabled):hover::after {
			transform: translateX(120%);
			transition: transform 750ms ease;
		}
	}
	.pay-button--pulse {
		animation: pay-pulse 650ms ease-out;
	}
	@keyframes pay-pulse {
		from {
			box-shadow: 0 0 0 0 rgba(5, 212, 113, 0.55);
		}
		to {
			box-shadow: 0 0 0 14px rgba(5, 212, 113, 0);
		}
	}
	.pay-button__progress {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 40%;
		height: 3px;
		border-radius: 999px;
		background: rgba(4, 20, 12, 0.45);
		animation: pay-progress 1.1s ease-in-out infinite;
	}
	@keyframes pay-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(260%);
		}
	}

	/* Teaching nudge: a short shake and a soft ring, on a buyer's first few checkouts only. */
	.nudge {
		animation:
			nudge-shake 650ms ease-in-out 1,
			nudge-ring 1.4s ease-out 1;
	}
	@keyframes nudge-shake {
		0%,
		100% {
			transform: translateX(0);
		}
		15% {
			transform: translateX(-6px);
		}
		30% {
			transform: translateX(5px);
		}
		45% {
			transform: translateX(-4px);
		}
		60% {
			transform: translateX(3px);
		}
		75% {
			transform: translateX(-1px);
		}
	}
	@keyframes nudge-ring {
		from {
			box-shadow: 0 0 0 0 rgba(5, 212, 113, 0.5);
		}
		to {
			box-shadow: 0 0 0 12px rgba(5, 212, 113, 0);
		}
	}

	/* First-order offer and applied-code card. */
	.offer-card {
		background: rgba(5, 212, 113, 0.08);
		border: 1px solid rgba(5, 212, 113, 0.3);
		transition:
			border-color 150ms ease,
			transform 120ms ease;
	}
	.offer-card:not(:disabled):hover {
		border-color: rgba(5, 212, 113, 0.6);
	}
	.offer-card:active:not(:disabled) {
		transform: scale(0.99);
	}
	.offer-card__icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: 10px;
		background: rgba(5, 212, 113, 0.16);
		color: var(--primary);
	}
	.offer-card__cta {
		flex-shrink: 0;
		padding: 6px 14px;
		border-radius: 999px;
		background: var(--primary);
		color: #04140c;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.promo-applied {
		background: rgba(5, 212, 113, 0.1);
		border: 1px solid rgba(5, 212, 113, 0.4);
	}
	.promo-applied--celebrate {
		animation: promo-pop 420ms cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	@keyframes promo-pop {
		from {
			transform: scale(0.96);
		}
		to {
			transform: scale(1);
		}
	}
	.promo-applied__check {
		position: relative;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 999px;
		background: var(--primary);
		color: #04140c;
	}
	.promo-applied__check i {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 5px;
		height: 5px;
		margin: -2.5px 0 0 -2.5px;
		border-radius: 999px;
		background: var(--primary);
		opacity: 0;
		animation: promo-spark 700ms ease-out forwards;
	}
	@keyframes promo-spark {
		from {
			opacity: 1;
			transform: rotate(calc(var(--spark) * 45deg)) translateY(-8px) scale(1);
		}
		to {
			opacity: 0;
			transform: rotate(calc(var(--spark) * 45deg)) translateY(-26px) scale(0.4);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nudge {
			animation: none !important;
			border-color: var(--primary) !important;
		}
		.pay-button,
		.pay-button::after,
		.pay-button__progress,
		.pay-button--pulse,
		.offer-card,
		.promo-applied--celebrate,
		.promo-applied__check i {
			animation: none !important;
			transition: none !important;
		}
		.promo-applied__check i {
			display: none;
		}
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
