<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Share2,
		Copy,
		DollarSign,
		CheckCircle,
		Users,
		Wallet,
		Lock,
		Clock,
		MessageSquare,
		ArrowRight,
		RefreshCw
	} from '$lib/icons';
	import { addToast } from '$lib/stores/toasts';
	import { copyToClipboard } from '$lib/helpers/utils';
	import AffiliatePopupModal from '$lib/components/AffiliatePopupModal.svelte';
	import { getAffiliatePopupContent } from '$lib/helpers/affiliate-popup-content';
	import type { AffiliatePopupType } from '$lib/services/affiliate';

	interface AffiliateRecentReferralActivity {
		userId: string;
		displayName: string;
		status: 'signed_up' | 'paid_customer' | 'repeat_buyer';
		ordersCount: number;
		storeCreditEarned: number;
		lastActivityAt: string;
	}

	interface AffiliateRecentStoreCreditActivity {
		id: string;
		title: string;
		statusLabel: string;
		amount: number;
		isCredit: boolean;
		createdAt: string;
	}

	interface AffiliateData {
		eligible?: boolean;
		unlocked?: boolean;
		canActivate?: boolean;
		isActive?: boolean;
		lifetimeCompletedSpend?: number;
		unlockThreshold?: number;
		payoutEligible?: boolean;
		payoutHasOpenRequest?: boolean;
		payoutBlockers?: Array<
			| 'minimum_balance'
			| 'account_age'
			| 'bank_details_missing'
			| 'bank_details_pending'
			| 'bank_details_rejected'
			| 'payout_pending'
		>;
		payoutMinimum?: number;
		payoutMinAccountAgeDays?: number;
		accountAgeDays?: number;
		hasBankDetails?: boolean;
		bankDetailsStatus?: string | null;
		availableStoreCredit?: number;
		pendingStoreCredit?: number;
		underReviewStoreCredit?: number;
		requestedStoreCredit?: number;
		paidStoreCredit?: number;
		reversedStoreCredit?: number;
		totalStoreCreditEarned?: number;
		totalReferredUsers?: number;
		successfulReferredOrders?: number;
		codeUsesThisMonth?: number;
		paidReferredUsers?: number;
		affiliateCode?: string | null;
		referralLink?: string | null;
		programStatus?: string | null;
		recentReferralActivity?: AffiliateRecentReferralActivity[];
		recentStoreCreditActivity?: AffiliateRecentStoreCreditActivity[];
		pendingPopup?: AffiliatePopupType | null;
		isSuperAffiliate?: boolean;
		superReferrals?: SuperReferralItem[];
		superActivationsThisMonth?: number;
		regularPolicy?: {
			buyerDiscountPercent: number;
			affiliateRewardPercent: number;
			orderLimit: number;
			perOrderCap: number;
		};
		superPolicy?: {
			enabledForNewReferrals: boolean;
			activationSpendThreshold: number;
			activationOrderThreshold: number;
			activationReward: number;
			monthlyTiers: Array<{ count: number; totalAmount: number }>;
		};
	}

	interface SuperReferralItem {
		userId: string;
		displayName: string;
		status: 'pending' | 'activated';
		orderCount: number;
		cumulativeSpend: number;
		orderTarget: number;
		spendTarget: number;
		activationReward: number;
		termsFrozen: boolean;
		activatedAt: string | null;
	}

	let { initialAffiliateData } = $props();

	let isLoadingAffiliate = $state(false);
	let isRefreshing = $state(false);
	let isRequestingPayout = $state(false);
	const REFERRAL_BASE_URL = 'https://smm.fastaccs.com';

	function toNumber(value: unknown): number {
		const parsed = Number(value || 0);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function normalizeAffiliateData(value: unknown): AffiliateData | null {
		if (!value || typeof value !== 'object') return null;
		return value as AffiliateData;
	}

	function formatTimeAgo(value: string): string {
		const date = new Date(value);
		const timestamp = date.getTime();
		if (!Number.isFinite(timestamp)) return 'just now';
		const diffMs = Math.max(0, Date.now() - timestamp);
		const minute = 60 * 1000;
		const hour = 60 * minute;
		const day = 24 * hour;
		if (diffMs < minute) return 'just now';
		if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
		if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
		return `${Math.floor(diffMs / day)}d ago`;
	}

	function referralStatusLabel(status: string): string {
		switch (
			String(status || '')
				.trim()
				.toLowerCase()
		) {
			case 'repeat_buyer':
				return 'Repeat buyer';
			case 'paid_customer':
				return 'Paid customer';
			default:
				return 'Signed up';
		}
	}

	let affiliateData = $state<AffiliateData | null>(normalizeAffiliateData(initialAffiliateData));

	const DISMISSED_POPUPS_KEY = 'fa_dismissed_affiliate_popups';
	function isPopupDismissedInSession(type: string): boolean {
		if (typeof sessionStorage === 'undefined') return false;
		try {
			return (
				JSON.parse(sessionStorage.getItem(DISMISSED_POPUPS_KEY) || '[]') as string[]
			).includes(type);
		} catch {
			return false;
		}
	}
	function markPopupDismissedInSession(type: string): void {
		if (typeof sessionStorage === 'undefined') return;
		try {
			const list = JSON.parse(sessionStorage.getItem(DISMISSED_POPUPS_KEY) || '[]') as string[];
			if (!list.includes(type)) {
				list.push(type);
				sessionStorage.setItem(DISMISSED_POPUPS_KEY, JSON.stringify(list));
			}
		} catch {
			/* noop */
		}
	}

	const pendingPopupType = affiliateData?.pendingPopup ?? null;
	let activePopup = $state<AffiliatePopupType | null>(
		pendingPopupType && !isPopupDismissedInSession(pendingPopupType) ? pendingPopupType : null
	);

	function dismissPopup() {
		const popup = activePopup;
		if (!popup) return;
		activePopup = null;
		markPopupDismissedInSession(popup);
		fetch('/api/affiliate/popup-seen', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ popup })
		}).catch((error) => {
			console.error('Failed to mark affiliate popup as seen:', error);
		});
	}

	const affiliateCode = $derived(
		String(affiliateData?.affiliateCode || '')
			.trim()
			.toUpperCase()
	);
	const referralLink = $derived(
		affiliateCode
			? `${REFERRAL_BASE_URL}/ref/${affiliateCode}`
			: String(affiliateData?.referralLink || '')
	);
	const buyerDiscountPercent = $derived(
		toNumber(affiliateData?.regularPolicy?.buyerDiscountPercent)
	);
	const affiliateRewardPercent = $derived(
		toNumber(affiliateData?.regularPolicy?.affiliateRewardPercent)
	);
	const regularOrderLimit = $derived(toNumber(affiliateData?.regularPolicy?.orderLimit));
	const regularPerOrderCap = $derived(toNumber(affiliateData?.regularPolicy?.perOrderCap));
	const shareMessage = $derived(
		referralLink && affiliateCode
			? `Use code *${affiliateCode}* to save ${buyerDiscountPercent}% on your first ${regularOrderLimit} eligible FastAccs account orders — up to ₦${regularPerOrderCap.toLocaleString()} per order. I earn ${affiliateRewardPercent}% too.\n\nRegister with my link:\n${referralLink}`
			: ''
	);

	// Progress bar repurposed from the (now-defunct) spend-to-unlock meter to a real
	// goal: how close the affiliate is to their payout minimum. Access itself unlocks
	// on the first purchase (see the locked-state copy), so a spend bar was meaningless.
	const payoutMinimum = $derived(toNumber(affiliateData?.payoutMinimum));
	const availableForPayout = $derived(toNumber(affiliateData?.availableStoreCredit));
	const payoutProgressPercent = $derived(
		payoutMinimum > 0 ? Math.min(100, Math.round((availableForPayout / payoutMinimum) * 100)) : 0
	);
	const remainingToPayout = $derived(Math.max(0, payoutMinimum - availableForPayout));
	const payoutBlockerMessages = $derived(
		(affiliateData?.payoutBlockers || []).map((blocker) => {
			switch (blocker) {
				case 'minimum_balance':
					return `Earn ₦${remainingToPayout.toLocaleString()} more to reach the ₦${payoutMinimum.toLocaleString()} minimum.`;
				case 'account_age':
					return `Your account must be ${toNumber(affiliateData?.payoutMinAccountAgeDays)} days old (${Math.max(0, toNumber(affiliateData?.payoutMinAccountAgeDays) - toNumber(affiliateData?.accountAgeDays))} days remaining).`;
				case 'bank_details_missing':
					return 'Add your Nigerian bank details.';
				case 'bank_details_pending':
					return 'Your bank details are awaiting approval.';
				case 'bank_details_rejected':
					return 'Update your rejected bank details.';
				case 'payout_pending':
					return 'Your current payout request is already being reviewed.';
			}
		})
	);
	const isUnlocked = $derived(Boolean(affiliateData?.unlocked || affiliateData?.isActive));
	const isActiveAffiliate = $derived(Boolean(affiliateData?.isActive));

	const recentReferralActivity = $derived(
		Array.isArray(affiliateData?.recentReferralActivity) ? affiliateData.recentReferralActivity : []
	);

	// Super affiliate: per-referral progress + monthly activations/tier.
	const isSuperAffiliate = $derived(Boolean(affiliateData?.isSuperAffiliate));
	const superReferrals = $derived<SuperReferralItem[]>(
		Array.isArray(affiliateData?.superReferrals) ? affiliateData.superReferrals : []
	);
	const superActivationsThisMonth = $derived(toNumber(affiliateData?.superActivationsThisMonth));
	const superEnabledForNewReferrals = $derived(
		Boolean(affiliateData?.superPolicy?.enabledForNewReferrals)
	);
	const superActivationReward = $derived(toNumber(affiliateData?.superPolicy?.activationReward));
	const superMonthlyTiers = $derived(
		Array.isArray(affiliateData?.superPolicy?.monthlyTiers)
			? affiliateData.superPolicy.monthlyTiers
					.map((tier) => ({
						count: toNumber(tier.count),
						totalAmount: toNumber(tier.totalAmount)
					}))
					.filter((tier) => tier.count > 0)
					.sort((a, b) => a.count - b.count)
			: []
	);
	const superBonusTier = $derived.by(() => {
		return (
			[...superMonthlyTiers].reverse().find((tier) => superActivationsThisMonth >= tier.count) ||
			null
		);
	});
	const firstSuperBonusTier = $derived(superMonthlyTiers[0] || null);
	function superProgressPct(value: number, target: number): number {
		if (target <= 0) return 0;
		return Math.min(100, Math.round((value / target) * 100));
	}
	// Pending referrals = people who signed up with your code but haven't bought yet.
	const pendingReferrals = $derived(
		Math.max(
			0,
			toNumber(affiliateData?.totalReferredUsers) - toNumber(affiliateData?.paidReferredUsers)
		)
	);
	const recentStoreCreditActivity = $derived(
		Array.isArray(affiliateData?.recentStoreCreditActivity)
			? affiliateData.recentStoreCreditActivity
			: []
	);

	async function refreshAffiliateState() {
		isRefreshing = true;
		try {
			const response = await fetch('/api/affiliate/stats');
			const result = await response.json();
			if (response.ok && result.success) {
				affiliateData = normalizeAffiliateData(result.data?.dashboard);
			}
		} catch (error) {
			console.error('Failed to refresh affiliate state:', error);
		} finally {
			isRefreshing = false;
		}
	}

	async function enableAffiliate() {
		isLoadingAffiliate = true;
		try {
			const response = await fetch('/api/affiliate/enable', { method: 'POST' });
			const data = await response.json();

			if (data.success) {
				addToast({
					type: 'success',
					title: 'Affiliate access activated',
					duration: 3000
				});
				affiliateData = normalizeAffiliateData(data.dashboard) || affiliateData;
			} else {
				addToast({
					type: 'error',
					title: data.error || 'Failed to activate affiliate access',
					duration: 3600
				});
			}
		} catch {
			addToast({
				type: 'error',
				title: 'Failed to activate affiliate access',
				duration: 3600
			});
		} finally {
			isLoadingAffiliate = false;
		}
	}

	async function requestPayout() {
		isRequestingPayout = true;
		try {
			const response = await fetch('/api/affiliate/payout-request', {
				method: 'POST'
			});
			const result = await response.json();

			if (!response.ok || !result?.success) {
				addToast({
					type: 'error',
					title: result?.error || 'Failed to submit payout request',
					duration: 3600
				});
				return;
			}

			addToast({
				type: 'success',
				title: `Payout request submitted (₦${toNumber(result.amount).toLocaleString()})`,
				duration: 3200
			});
			affiliateData = normalizeAffiliateData(result.dashboard) || affiliateData;
		} catch {
			addToast({
				type: 'error',
				title: 'Failed to submit payout request',
				duration: 3600
			});
		} finally {
			isRequestingPayout = false;
		}
	}

	function shareToWhatsApp() {
		if (!shareMessage) return;
		trackAffiliateInteraction('affiliate_whatsapp_share_started');
		const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
		if (typeof window !== 'undefined') {
			window.open(shareUrl, '_blank', 'noopener,noreferrer');
		}
	}

	async function copyShareMessage() {
		if (!shareMessage) return;
		const copied = await copyToClipboard(shareMessage, {
			label: 'Share message',
			showToast: addToast
		});
		if (copied) trackAffiliateInteraction('affiliate_message_copied');
	}

	async function copyAffiliateValue(
		value: string,
		label: string,
		type: 'affiliate_code_copied' | 'affiliate_link_copied'
	) {
		const copied = await copyToClipboard(value, { label, showToast: addToast });
		if (copied) trackAffiliateInteraction(type);
	}

	function trackAffiliateInteraction(type: string) {
		if (typeof window === 'undefined' || !isActiveAffiliate) return;
		const eventId =
			type === 'affiliate_dashboard_viewed'
				? `view_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
				: globalThis.crypto?.randomUUID?.() ||
					`action_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
		void fetch('/api/affiliate/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type, eventId }),
			keepalive: true
		}).catch(() => undefined);
	}

	onMount(() => {
		trackAffiliateInteraction('affiliate_dashboard_viewed');
	});
</script>

<div
	class="rounded-[var(--r-md)] border border-[var(--border)]"
	style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
>
	<div class="border-b border-[var(--border)] p-5">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.16), rgba(105,109,250,0.14)); border: 1px solid var(--border-2); color: var(--primary);"
				>
					<Share2 size={18} />
				</div>
				<div class="min-w-0">
					<h2
						class="text-base font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Affiliate Program
					</h2>
					<p class="text-sm" style="color: var(--text-muted);">Share your code. Earn real Cash.</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={refreshAffiliateState}
					disabled={isRefreshing}
					aria-label="Refresh affiliate data"
					class="inline-flex h-10 w-10 items-center justify-center rounded-full transition-all hover:-translate-y-0.5 disabled:opacity-60"
					style="background: rgba(105,109,250,0.14); border: 1px solid rgba(105,109,250,0.32); color: var(--text);"
				>
					<RefreshCw size={16} />
				</button>
				<a
					href="/how-it-works?tab=affiliate"
					class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5"
					style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
				>
					How it works
					<ArrowRight size={16} />
				</a>
			</div>
		</div>
	</div>

	<div class="space-y-4 p-5">
		{#if !isUnlocked}
			<div
				class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
				style="background: var(--surface);"
			>
				<div class="mb-3 flex items-center gap-2" style="color: var(--text);">
					<Lock size={17} />
					<h3 class="text-base font-semibold" style="font-family: var(--font-head);">
						Affiliate Access Locked
					</h3>
				</div>
				<p class="mb-4 text-sm" style="color: var(--text-muted);">
					Refer friends and earn real, withdrawable cash from retained eligible account orders.
					<strong style="color: var(--text);"
						>Make your first purchase to unlock your referral code</strong
					>
					— that's all it takes.
				</p>
				<div class="flex flex-wrap items-center gap-3">
					<a
						href="/platforms"
						class="rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5"
						style="background: var(--btn-primary-gradient); color: #04140C; font-family: var(--font-head);"
					>
						Browse accounts →
					</a>
					<a
						href="/how-it-works?tab=affiliate"
						class="text-xs font-medium underline-offset-2 hover:underline"
						style="color: var(--text-muted);"
					>
						See how it works
					</a>
				</div>
			</div>
		{:else if isUnlocked && !isActiveAffiliate}
			<div
				class="rounded-[var(--r-sm)] border border-[var(--border)] p-4 text-center"
				style="background: var(--surface);"
			>
				<Share2 class="mx-auto mb-3 h-12 w-12" style="color: var(--primary);" />
				<h3
					class="mb-2 text-base font-semibold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Affiliate Access Unlocked
				</h3>
				<p class="mx-auto mb-5 max-w-md text-sm" style="color: var(--text-muted);">
					Activate your profile, get your code, and start earning real Cash from successful referred
					orders.
				</p>
				<button
					onclick={enableAffiliate}
					disabled={isLoadingAffiliate}
					class="cursor-pointer rounded-full px-8 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:active:translate-y-0"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C; box-shadow: var(--glow-primary);"
				>
					{isLoadingAffiliate ? 'Activating...' : 'Activate Affiliate Access'}
				</button>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-2 sm:gap-3">
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-3 sm:p-4"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.12), rgba(13,145,82,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase sm:text-xs"
						style="color: var(--primary);"
					>
						<Wallet size={14} />
						Available Cash
					</div>
					<div
						class="text-lg font-semibold sm:text-2xl"
						style="color: var(--text); font-family: var(--font-head);"
					>
						₦{toNumber(affiliateData?.availableStoreCredit).toLocaleString()}
					</div>
				</div>
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-3 sm:p-4"
					style="background: linear-gradient(180deg, rgba(105,109,250,0.12), rgba(170,173,255,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase sm:text-xs"
						style="color: var(--link);"
					>
						<Clock size={14} />
						Pending Cash
					</div>
					<div
						class="text-lg font-semibold sm:text-2xl"
						style="color: var(--text); font-family: var(--font-head);"
					>
						₦{toNumber(affiliateData?.pendingStoreCredit).toLocaleString()}
					</div>
				</div>
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-3 sm:p-4"
					style="background: linear-gradient(180deg, rgba(105,109,250,0.12), rgba(170,173,255,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase sm:text-xs"
						style="color: var(--link);"
					>
						<Users size={14} />
						Referred Users
					</div>
					<div
						class="text-lg font-semibold sm:text-2xl"
						style="color: var(--text); font-family: var(--font-head);"
					>
						{toNumber(affiliateData?.totalReferredUsers)}
					</div>
					{#if pendingReferrals > 0}
						<div class="mt-0.5 text-[10px] sm:text-xs" style="color: var(--text-muted);">
							{pendingReferrals} pending · not bought yet
						</div>
					{/if}
				</div>
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-3 sm:p-4"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.12), rgba(13,145,82,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase sm:text-xs"
						style="color: var(--primary-strong);"
					>
						<CheckCircle size={14} />
						Successful Orders
					</div>
					<div
						class="text-lg font-semibold sm:text-2xl"
						style="color: var(--text); font-family: var(--font-head);"
					>
						{toNumber(affiliateData?.successfulReferredOrders)}
					</div>
				</div>
			</div>

			<div
				class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
				style="background: var(--surface);"
			>
				<div class="space-y-3">
					<div>
						<label
							for="affiliate-code"
							class="mb-1 block text-xs font-semibold uppercase"
							style="color: var(--text-muted);">Affiliate Promo Code</label
						>
						<div class="flex gap-2">
							<input
								id="affiliate-code"
								type="text"
								value={affiliateCode}
								readonly
								class="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] px-4 py-2.5 font-mono text-base font-semibold"
								style="background: rgba(0,0,0,0.3); color: var(--text);"
							/>
							<button
								type="button"
								onclick={() =>
									void copyAffiliateValue(
										affiliateCode,
										'Affiliate promo code',
										'affiliate_code_copied'
									)}
								class="rounded-full px-3 py-2 transition-all hover:-translate-y-0.5"
								style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
							>
								<Copy class="h-5 w-5" />
							</button>
						</div>
					</div>

					<div>
						<label
							for="affiliate-ref-link"
							class="mb-1 block text-xs font-semibold uppercase"
							style="color: var(--text-muted);">Referral Link</label
						>
						<div class="flex gap-2">
							<input
								id="affiliate-ref-link"
								type="text"
								value={referralLink}
								readonly
								class="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] px-4 py-2.5 text-sm"
								style="background: rgba(0,0,0,0.3); color: var(--text);"
							/>
							<button
								type="button"
								onclick={() =>
									void copyAffiliateValue(referralLink, 'Referral link', 'affiliate_link_copied')}
								class="rounded-full px-3 py-2 transition-all hover:-translate-y-0.5"
								style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
							>
								<Copy class="h-5 w-5" />
							</button>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<button
							type="button"
							onclick={shareToWhatsApp}
							disabled={!shareMessage}
							class="rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
							style="background: rgba(5,212,113,0.14); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
						>
							Share referral link on WhatsApp
						</button>
						<button
							type="button"
							onclick={() => void copyShareMessage()}
							disabled={!shareMessage}
							class="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
							style="background: rgba(105,109,250,0.12); border: 1px solid rgba(105,109,250,0.3); color: var(--text);"
						>
							<MessageSquare size={15} />
							Copy message
						</button>
					</div>
				</div>
			</div>

			<div
				class="rounded-[var(--r-sm)] border p-4"
				style="background: rgba(105,109,250,0.08); border-color: rgba(105,109,250,0.2);"
			>
				<p class="text-sm" style="color: var(--text-muted);">
					<DollarSign class="mr-1 inline h-4 w-4" style="color: var(--primary);" />
					Cash earned:
					<strong style="color: var(--text);">
						₦{toNumber(affiliateData?.totalStoreCreditEarned).toLocaleString()}
					</strong>
				</p>
				{#if !affiliateData?.payoutHasOpenRequest}
					<div class="mt-3">
						<div
							class="mb-1 flex items-center justify-between text-xs"
							style="color: var(--text-muted);"
						>
							<span>Progress to payout</span>
							<span>₦{availableForPayout.toLocaleString()} / ₦{payoutMinimum.toLocaleString()}</span
							>
						</div>
						<div
							class="h-2 overflow-hidden rounded-full"
							style="background: rgba(255,255,255,0.08);"
						>
							<div
								class="h-full rounded-full"
								style="width: {payoutProgressPercent}%; background: linear-gradient(90deg, rgba(5,212,113,0.9), rgba(13,145,82,0.9));"
							></div>
						</div>
					</div>
				{/if}
				{#if affiliateData?.payoutEligible}
					<p class="mt-2 text-sm" style="color: var(--primary);">
						You can request a payout now. Requests are processed on Saturdays.
					</p>
				{:else if payoutBlockerMessages.length > 0}
					<div class="mt-2 text-sm" style="color: var(--text-muted);">
						<p class="font-semibold" style="color: var(--text);">Before you can withdraw:</p>
						<ul class="mt-1 space-y-1 pl-4">
							{#each payoutBlockerMessages as message}
								<li class="list-disc">{message}</li>
							{/each}
						</ul>
						<p class="mt-2 text-xs">Approved requests are processed on Saturdays.</p>
					</div>
				{/if}
				<div class="mt-3 flex flex-wrap gap-2">
					<a
						href="/affiliate/bank-details"
						class="rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5"
						style="background: rgba(105,109,250,0.18); border: 1px solid rgba(105,109,250,0.35); color: var(--text);"
					>
						{affiliateData?.bankDetailsStatus === 'approved'
							? 'View bank details'
							: affiliateData?.hasBankDetails
								? 'Update bank details'
								: 'Add bank details'}
					</a>
					{#if affiliateData?.payoutEligible && toNumber(affiliateData?.availableStoreCredit) > 0}
						<button
							type="button"
							onclick={requestPayout}
							disabled={isRequestingPayout}
							class="rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-60"
							style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C;"
						>
							{isRequestingPayout ? 'Submitting...' : 'Request payout'}
						</button>
					{/if}
				</div>
				<div class="mt-3 flex flex-wrap gap-2 text-xs">
					<span
						class="rounded-full px-2.5 py-1"
						style="background: rgba(5,212,113,0.14); border: 1px solid rgba(5,212,113,0.3); color: var(--primary);"
					>
						Available: ₦{toNumber(affiliateData?.availableStoreCredit).toLocaleString()}
					</span>
					<span
						class="rounded-full px-2.5 py-1"
						style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: var(--text-muted);"
					>
						Pending: ₦{toNumber(affiliateData?.pendingStoreCredit).toLocaleString()}
					</span>
					{#if toNumber(affiliateData?.underReviewStoreCredit) > 0}
						<span
							class="rounded-full px-2.5 py-1"
							style="background: rgba(226,75,74,0.12); border: 1px solid rgba(226,75,74,0.28); color: #ffb5b1;"
						>
							Under review: ₦{toNumber(affiliateData?.underReviewStoreCredit).toLocaleString()}
						</span>
					{/if}
					{#if toNumber(affiliateData?.requestedStoreCredit) > 0}
						<span
							class="rounded-full px-2.5 py-1"
							style="background: rgba(105,109,250,0.16); border: 1px solid rgba(105,109,250,0.35); color: #c0c4ff;"
						>
							Requested: ₦{toNumber(affiliateData?.requestedStoreCredit).toLocaleString()}
						</span>
					{/if}
				</div>
			</div>

			{#if isSuperAffiliate}
				<div
					class="mb-4 rounded-[var(--r-md)] border border-[var(--border)] p-4"
					style="background: var(--surface);"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<h4
							class="text-sm font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Super Affiliate
						</h4>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-semibold"
							style="background: rgba(105,109,250,0.12); color: var(--link);"
							>{superEnabledForNewReferrals
								? `Current · ₦${superActivationReward.toLocaleString()} / activation`
								: 'Existing agreements'}</span
						>
					</div>

					<!-- Monthly activations + non-additive total bonus tier. -->
					<div class="mb-4 grid grid-cols-2 gap-2">
						<div class="rounded-[var(--r-sm)] border border-[var(--border)] p-3">
							<div class="text-xs" style="color: var(--text-muted);">Activations this month</div>
							<div class="text-lg font-bold" style="color: var(--text);">
								{superActivationsThisMonth}
							</div>
						</div>
						<div class="rounded-[var(--r-sm)] border border-[var(--border)] p-3">
							<div class="text-xs" style="color: var(--text-muted);">Monthly bonus</div>
							{#if superBonusTier}
								<div class="text-lg font-bold" style="color: var(--primary);">
									₦{superBonusTier.totalAmount.toLocaleString()}
								</div>
								<div class="text-[10px]" style="color: var(--text-muted);">
									{superBonusTier.count}+ activations this month
								</div>
							{:else}
								<div class="text-sm" style="color: var(--text-muted);">
									—
									{#if firstSuperBonusTier}
										<span class="text-[10px]">
											({firstSuperBonusTier.count}+ unlocks ₦{firstSuperBonusTier.totalAmount.toLocaleString()})
										</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<div class="mb-2 text-xs font-semibold" style="color: var(--text-muted);">
						Your referrals
					</div>
					{#if superReferrals.length === 0}
						<p class="text-sm" style="color: var(--text-muted);">
							No referrals yet — share your code to get started.
						</p>
					{:else}
						<div class="space-y-3">
							{#each superReferrals as ref (ref.userId)}
								<div class="rounded-[var(--r-sm)] border border-[var(--border)] p-3">
									<div class="mb-2 flex items-center justify-between gap-2">
										<span class="truncate text-sm font-medium" style="color: var(--text);"
											>{ref.displayName}</span
										>
										{#if ref.status === 'activated'}
											<span
												class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
												style="background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);"
												>Activated</span
											>
										{:else}
											<span
												class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
												style="background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border);"
												>Pending</span
											>
										{/if}
									</div>
									{#if ref.status === 'pending'}
										<div class="space-y-1.5">
											<div class="text-[11px]" style="color: var(--text-muted);">
												Earn ₦{toNumber(ref.activationReward).toLocaleString()} when either target is
												reached.
											</div>
											<div>
												<div
													class="mb-0.5 flex justify-between text-[11px]"
													style="color: var(--text-muted);"
												>
													<span>Orders</span><span>{ref.orderCount}/{ref.orderTarget}</span>
												</div>
												<div
													class="h-1.5 w-full overflow-hidden rounded-full"
													style="background: var(--bg-elev-2);"
												>
													<div
														class="h-full rounded-full"
														style="width: {superProgressPct(
															ref.orderCount,
															ref.orderTarget
														)}%; background: var(--link);"
													></div>
												</div>
											</div>
											<div>
												<div
													class="mb-0.5 flex justify-between text-[11px]"
													style="color: var(--text-muted);"
												>
													<span>Spend</span><span
														>₦{ref.cumulativeSpend.toLocaleString()}/₦{ref.spendTarget.toLocaleString()}</span
													>
												</div>
												<div
													class="h-1.5 w-full overflow-hidden rounded-full"
													style="background: var(--bg-elev-2);"
												>
													<div
														class="h-full rounded-full"
														style="width: {superProgressPct(
															ref.cumulativeSpend,
															ref.spendTarget
														)}%; background: var(--primary);"
													></div>
												</div>
											</div>
										</div>
									{:else}
										<div class="text-[11px]" style="color: var(--text-muted);">
											Earned ₦{toNumber(ref.activationReward).toLocaleString()} · {ref.orderCount} order{ref.orderCount ===
											1
												? ''
												: 's'}, ₦{ref.cumulativeSpend.toLocaleString()}
											spent
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{#if recentReferralActivity.length > 0}
					<details
						class="rounded-[var(--r-sm)] border border-[var(--border)] p-3 sm:p-4"
						style="background: var(--surface);"
					>
						<summary class="flex cursor-pointer items-center justify-between gap-2">
							<h4
								class="text-xs font-semibold sm:text-sm"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Recent referrals
							</h4>
						</summary>
						<div class="mt-3 space-y-2">
							{#each recentReferralActivity as item (item.userId)}
								<div
									class="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] px-3 py-2"
								>
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold" style="color: var(--text);">
											{item.displayName}
										</p>
										<p class="text-xs" style="color: var(--text-muted);">
											{referralStatusLabel(item.status)} · {item.ordersCount} order{item.ordersCount ===
											1
												? ''
												: 's'} · {formatTimeAgo(item.lastActivityAt)}
										</p>
									</div>
									<div class="shrink-0 text-sm font-semibold" style="color: var(--primary);">
										+₦{toNumber(item.storeCreditEarned).toLocaleString()}
									</div>
								</div>
							{/each}
						</div>
					</details>
				{/if}

				<details
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-3 sm:p-4 {recentReferralActivity.length ===
					0
						? 'sm:col-span-2'
						: ''}"
					style="background: var(--surface);"
				>
					<summary class="flex cursor-pointer items-center justify-between gap-2">
						<h4
							class="text-xs font-semibold sm:text-sm"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Recent cash
						</h4>
					</summary>
					<div class="mt-3">
						{#if recentStoreCreditActivity.length === 0}
							<p class="text-sm" style="color: var(--text-muted);">No Cash activity yet.</p>
						{:else}
							<div class="space-y-2">
								{#each recentStoreCreditActivity as item (item.id)}
									<div
										class="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] px-3 py-2"
									>
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold" style="color: var(--text);">
												{item.title}
											</p>
											<p class="text-xs" style="color: var(--text-muted);">
												{item.statusLabel} • {formatTimeAgo(item.createdAt)}
											</p>
										</div>
										<div
											class="shrink-0 text-sm font-semibold"
											style="color: {item.amount >= 0 ? 'var(--primary)' : 'var(--status-danger)'};"
										>
											{item.amount >= 0 ? '+' : '-'}₦{Math.abs(
												toNumber(item.amount)
											).toLocaleString()}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</details>
			</div>
		{/if}
	</div>
</div>

{#if activePopup}
	<AffiliatePopupModal
		isOpen={true}
		onClose={dismissPopup}
		{...getAffiliatePopupContent(activePopup, payoutMinimum, {
			buyerDiscountPercent,
			affiliateRewardPercent,
			orderLimit: regularOrderLimit,
			perOrderCap: regularPerOrderCap
		})}
	/>
{/if}
