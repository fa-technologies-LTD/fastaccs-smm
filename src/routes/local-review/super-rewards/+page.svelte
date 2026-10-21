<script lang="ts">
	import AffiliateTab from '$lib/components/AffiliateTab.svelte';
	const example = {
		eligible: true,
		unlocked: true,
		isActive: true,
		isSuperAffiliate: true,
		availableStoreCredit: 13300,
		pendingStoreCredit: 700,
		underReviewStoreCredit: 0,
		totalStoreCreditEarned: 14000,
		payoutMinimum: 10000,
		payoutEligible: false,
		payoutBlockers: ['bank_details_missing'],
		hasBankDetails: false,
		totalReferredUsers: 62,
		paidReferredUsers: 27,
		successfulReferredOrders: 55,
		superActivationsThisMonth: 7,
		affiliateCode: 'FICTIONAL-DEMO',
		referralLink: 'https://example.invalid/ref/FICTIONAL-DEMO',
		programStatus: 'active',
		pendingPopup: null,
		recentReferralActivity: [],
		recentStoreCreditActivity: [],
		superReferrals: []
	};
</script>

<svelte:head
	><title>Super reward timing — local fictional preview</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>
<main class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="mb-2 text-xl font-semibold">Super rewards: 24-hour clearing</h1>
	<p class="mb-6 text-sm" style="color: var(--text-muted);">
		Read-only fictional example, not a live account balance. Controls are inactive. No account,
		reward, payment or email changes.
	</p>
	<div inert><AffiliateTab initialAffiliateData={example} /></div>
</main>
