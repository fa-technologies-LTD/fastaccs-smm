<script lang="ts">
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
		TrendingUp,
		ArrowRight,
		RefreshCw
	} from '$lib/icons';
	import { addToast } from '$lib/stores/toasts';
	import { copyToClipboard } from '$lib/helpers/utils';
	import AffiliatePopupModal from '$lib/components/AffiliatePopupModal.svelte';
	import { AFFILIATE_POPUP_CONTENT } from '$lib/helpers/affiliate-popup-content';
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
		payoutMinimum?: number;
		payoutMinAccountAgeDays?: number;
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
	}

	let { initialAffiliateData } = $props();

	let isLoadingAffiliate = $state(false);
	let isRefreshing = $state(false);
	let isRequestingPayout = $state(false);
	const BANK_DETAILS_FORM_URL =
		'https://docs.google.com/forms/d/e/1FAIpQLSfCmv6ADTG51ooEjm9-UBz2GzsxFDqxxSep6Lo_Gb-OMQv8UA/viewform?usp=dialog';
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
			return (JSON.parse(sessionStorage.getItem(DISMISSED_POPUPS_KEY) || '[]') as string[]).includes(type);
		} catch { return false; }
	}
	function markPopupDismissedInSession(type: string): void {
		if (typeof sessionStorage === 'undefined') return;
		try {
			const list = JSON.parse(sessionStorage.getItem(DISMISSED_POPUPS_KEY) || '[]') as string[];
			if (!list.includes(type)) {
				list.push(type);
				sessionStorage.setItem(DISMISSED_POPUPS_KEY, JSON.stringify(list));
			}
		} catch { /* noop */ }
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
	const shareMessage = $derived(
		referralLink && affiliateCode
			? `Use code *${affiliateCode}* at checkout to save on your *FastAccs* order 🛒\n\nOr register with my link and get discounts on your first orders:\n${referralLink}`
			: ''
	);

	const unlockThreshold = $derived(toNumber(affiliateData?.unlockThreshold));
	const lifetimeSpend = $derived(toNumber(affiliateData?.lifetimeCompletedSpend));
	const spendProgressPercent = $derived(
		unlockThreshold > 0 ? Math.min(100, Math.round((lifetimeSpend / unlockThreshold) * 100)) : 0
	);
	const remainingSpend = $derived(Math.max(0, unlockThreshold - lifetimeSpend));
	const isUnlocked = $derived(Boolean(affiliateData?.unlocked || affiliateData?.isActive));
	const isActiveAffiliate = $derived(Boolean(affiliateData?.isActive));

	const recentReferralActivity = $derived(
		Array.isArray(affiliateData?.recentReferralActivity) ? affiliateData.recentReferralActivity : []
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
		const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
		if (typeof window !== 'undefined') {
			window.open(shareUrl, '_blank', 'noopener,noreferrer');
		}
	}

	function copyShareMessage() {
		if (!shareMessage) return;
		copyToClipboard(shareMessage, {
			label: 'Share message',
			showToast: addToast
		});
	}
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
					<p class="text-sm" style="color: var(--text-muted);">
						Share your code. Earn real Cash.
					</p>
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
				<p class="mb-3 text-sm" style="color: var(--text-muted);">
					Refer friends and earn real, withdrawable cash on every order they make. Keep shopping to
					unlock your referral code.
				</p>
				<div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
					<div
						class="rounded-lg border px-3 py-2"
						style="border-color: var(--border); background: rgba(255,255,255,0.035);"
					>
						<p class="text-[11px] uppercase" style="color: var(--text-muted);">Current spend</p>
						<p class="text-sm font-semibold" style="color: var(--text);">
							₦{lifetimeSpend.toLocaleString()}
						</p>
					</div>
					<div
						class="rounded-lg border px-3 py-2"
						style="border-color: var(--border); background: rgba(5,212,113,0.06);"
					>
						<p class="text-[11px] uppercase" style="color: var(--text-muted);">Target</p>
						<p class="text-sm font-semibold" style="color: var(--text);">
							₦{unlockThreshold.toLocaleString()}
						</p>
					</div>
					<div
						class="rounded-lg border px-3 py-2"
						style="border-color: var(--border); background: rgba(202,219,46,0.07);"
					>
						<p class="text-[11px] uppercase" style="color: var(--text-muted);">Remaining</p>
						<p class="text-sm font-semibold" style="color: var(--text);">
							₦{remainingSpend.toLocaleString()}
						</p>
					</div>
				</div>
				<div class="h-2 overflow-hidden rounded-full" style="background: rgba(255,255,255,0.08);">
					<div
						class="h-full rounded-full"
						style="width: {spendProgressPercent}%; background: linear-gradient(90deg, rgba(5,212,113,0.9), rgba(13,145,82,0.9));"
					></div>
				</div>
				<div class="mt-3 flex items-center justify-between gap-3 text-xs">
					<span style="color: var(--text-muted);">{spendProgressPercent}% complete</span>
					<a href="/platforms" class="font-semibold" style="color: var(--primary);">
						Buy more to unlock affiliate access
					</a>
				</div>
				<div class="mt-2 text-right text-xs">
					<a
						href="/how-it-works?tab=affiliate"
						class="font-medium underline-offset-2 hover:underline"
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
					Activate your profile, get your code, and start earning real Cash from successful
					referred orders.
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
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.12), rgba(13,145,82,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase"
						style="color: var(--primary);"
					>
						<Wallet size={15} />
						Available Store Credit
					</div>
					<div
						class="text-2xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						₦{toNumber(affiliateData?.availableStoreCredit).toLocaleString()}
					</div>
				</div>
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
					style="background: linear-gradient(180deg, rgba(105,109,250,0.12), rgba(170,173,255,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase"
						style="color: var(--link);"
					>
						<Clock size={15} />
						Pending Store Credit
					</div>
					<div
						class="text-2xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						₦{toNumber(affiliateData?.pendingStoreCredit).toLocaleString()}
					</div>
				</div>
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
					style="background: linear-gradient(180deg, rgba(105,109,250,0.12), rgba(170,173,255,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase"
						style="color: var(--link);"
					>
						<Users size={15} />
						Referred Users
					</div>
					<div
						class="text-2xl font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						{toNumber(affiliateData?.totalReferredUsers)}
					</div>
				</div>
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.12), rgba(13,145,82,0.08));"
				>
					<div
						class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase"
						style="color: var(--primary-strong);"
					>
						<CheckCircle size={15} />
						Successful Orders
					</div>
					<div
						class="text-2xl font-semibold"
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
									copyToClipboard(affiliateCode, {
										label: 'Affiliate promo code',
										showToast: addToast
									})}
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
									copyToClipboard(referralLink, {
										label: 'Referral link',
										showToast: addToast
									})}
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
							onclick={copyShareMessage}
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
					Store Credit earned:
					<strong style="color: var(--text);">
						₦{toNumber(affiliateData?.totalStoreCreditEarned).toLocaleString()}
					</strong>
				</p>
				<p class="mt-2 text-sm" style="color: var(--text-muted);">
					Payout unlocks at
					<strong style="color: var(--text);"
						>₦{toNumber(affiliateData?.payoutMinimum).toLocaleString()}</strong
					>
					approved Store Credit and
					<strong style="color: var(--text);"
						>{toNumber(affiliateData?.payoutMinAccountAgeDays)} days</strong
					>
					affiliate age.
				</p>
				<p
					class="mt-2 text-sm"
					style="color: {affiliateData?.payoutEligible ? 'var(--primary)' : 'var(--text-muted)'};"
				>
					{affiliateData?.payoutEligible
						? 'Payout is available. Add your bank details, then request payout.'
						: 'Keep earning from referrals to unlock withdrawals.'}
				</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<a
						href={BANK_DETAILS_FORM_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5"
						style="background: rgba(105,109,250,0.18); border: 1px solid rgba(105,109,250,0.35); color: var(--text);"
					>
						Add bank details
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
					<span
						class="rounded-full px-2.5 py-1"
						style="background: rgba(226,75,74,0.12); border: 1px solid rgba(226,75,74,0.28); color: #ffb5b1;"
					>
						Under review: ₦{toNumber(affiliateData?.underReviewStoreCredit).toLocaleString()}
					</span>
					<span
						class="rounded-full px-2.5 py-1"
						style="background: rgba(105,109,250,0.16); border: 1px solid rgba(105,109,250,0.35); color: #c0c4ff;"
					>
						Requested: ₦{toNumber(affiliateData?.requestedStoreCredit).toLocaleString()}
					</span>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
					style="background: var(--surface);"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<h4
							class="text-sm font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Recent Referral Activity
						</h4>
					</div>
					{#if recentReferralActivity.length === 0}
						<p class="text-sm" style="color: var(--text-muted);">No referral activity yet.</p>
					{:else}
						<div class="space-y-2">
							{#each recentReferralActivity as item (item.userId)}
								<div
									class="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] px-3 py-2"
								>
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold" style="color: var(--text);">
											{item.displayName}
										</p>
										<p class="truncate text-xs" style="color: var(--text-muted);">
											{referralStatusLabel(item.status)} • {item.ordersCount} order{item.ordersCount ===
											1
												? ''
												: 's'} • {formatTimeAgo(item.lastActivityAt)}
										</p>
									</div>
									<div class="shrink-0 text-sm font-semibold" style="color: var(--primary);">
										+₦{toNumber(item.storeCreditEarned).toLocaleString()}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div
					class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
					style="background: var(--surface);"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<h4
							class="text-sm font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Recent Store Credit Activity
						</h4>
					</div>
					{#if recentStoreCreditActivity.length === 0}
						<p class="text-sm" style="color: var(--text-muted);">No Store Credit activity yet.</p>
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
			</div>

			<div
				class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
				style="background: var(--surface);"
			>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div class="rounded-[10px] border border-[var(--border)] p-3">
						<div
							class="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase"
							style="color: var(--primary);"
						>
							<TrendingUp size={14} />
							Code Uses This Month
						</div>
						<p
							class="text-2xl font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							{toNumber(affiliateData?.codeUsesThisMonth)}
						</p>
					</div>
					<div class="rounded-[10px] border border-[var(--border)] p-3">
						<div
							class="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase"
							style="color: var(--link);"
						>
							<Users size={14} />
							Paid Referred Users
						</div>
						<p
							class="text-2xl font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							{toNumber(affiliateData?.paidReferredUsers)}
						</p>
					</div>
					<div class="rounded-[10px] border border-[var(--border)] p-3">
						<div
							class="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase"
							style="color: var(--primary-strong);"
						>
							<Wallet size={14} />
							Store Credit Earned
						</div>
						<p
							class="text-2xl font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							₦{toNumber(affiliateData?.totalStoreCreditEarned).toLocaleString()}
						</p>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

{#if activePopup}
	<AffiliatePopupModal isOpen={true} onClose={dismissPopup} {...AFFILIATE_POPUP_CONTENT[activePopup]} />
{/if}
