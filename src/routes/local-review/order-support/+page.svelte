<script lang="ts">
	import { onMount, type ComponentProps } from 'svelte';
	import Orders from '../../admin/boosting-orders/+page.svelte';
	import { getBoostSupportState, type BoostSupportState } from '$lib/helpers/boosting-support';
	let ready = $state(false);
	let notice = $state('');
	const date = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
	const examples = [
		['demo-link', 'Instagram Followers', 'DEMO-7DBCA94B', 'Morayo', 'needs_link', 24],
		['demo-review', 'X (Twitter) Followers', 'DEMO-FB6E1F53', 'Alex', 'under_review', 72],
		['demo-progress', 'Facebook Followers', 'DEMO-CE0373F6', 'Sam', 'in_progress', 2]
	] as const;
	const rows = examples.map(([id, productName, orderNumber, name, status, hours]) => ({
		id,
		productName,
		boostQuantity: 500,
		boostFulfillmentStatus: status as string,
		boostProviderReference: 'DEMO-SUPPLIER-REF',
		boostCompletedAt: null,
		boostTargetUrl: productName.startsWith('X')
			? 'https://x.com/example'
			: productName.startsWith('Facebook')
				? 'https://facebook.com/example'
				: 'https://instagram.com/example',
		createdAt: date(hours),
		latestIssue: null,
		complaints: [],
		fulfillmentState: {
			status: status === 'in_progress' ? 'in_progress' : 'manual_review',
			mode: 'live'
		},
		holdReasons:
			status === 'under_review'
				? ['The customer reported missing delivery. Review the evidence.']
				: [],
		overdueReview: hours >= 24,
		support:
			status === 'needs_link'
				? ({
						...getBoostSupportState([]),
						revision: 'demo-request',
						state: 'awaiting_customer',
						requestId: 'demo-request',
						message: 'Please send the correct public link for your order.'
					} as BoostSupportState)
				: getBoostSupportState([]),
		progress: {
			rawProviderStatus: status === 'needs_link' ? 'Partial' : 'Processing',
			remains: status === 'needs_link' ? 496 : 500,
			startCount: null,
			supplierOrderId: 'DEMO-SUPPLIER-REF',
			lastCheckedAt: date(1),
			refillDays: null
		},
		shadowDecision: null,
		category: { metadata: {} },
		order: {
			id: `order-${id}`,
			orderNumber,
			status: 'paid',
			deliveryStatus: 'processing',
			guestEmail: null,
			createdAt: date(hours),
			paidAt: date(hours),
			user: { fullName: name, email: null }
		}
	}));
	const analytics = {
		since: date(24 * 30),
		checkedAt: date(0),
		overall: {
			orders: 3,
			items: 3,
			completed: 0,
			completionRate: 0,
			knownCostItems: 0,
			netSalesNgn: 7500,
			supplierCostNgn: null,
			recordedMarginNgn: null
		},
		byService: [],
		providers: []
	};
	function listMeta(status = 'active', count = rows.length) {
		const counts: Record<string, number> = {};
		for (const row of rows)
			counts[row.boostFulfillmentStatus] = (counts[row.boostFulfillmentStatus] ?? 0) + 1;
		return {
			page: 1,
			pageSize: 25,
			total: count,
			totalPages: 1,
			sort: 'newest',
			status,
			search: '',
			statusCounts: counts,
			activeCount: rows.filter((row) => row.boostFulfillmentStatus !== 'completed').length,
			overdueCount: rows.filter(
				(row) => row.overdueReview && row.boostFulfillmentStatus !== 'completed'
			).length,
			totalItems: rows.length,
			canRunShadowRouting: false,
			canManageOrders: true
		};
	}
	const example = {
		items: structuredClone(rows),
		meta: listMeta(),
		analytics,
		analyticsError: null,
		error: null,
		canViewRevenue: true,
		adminPermissions: [],
		stats: { total_orders: 3 }
	} as unknown as ComponentProps<typeof Orders>['data'];
	onMount(() => {
		const originalFetch = window.fetch;
		const mockFetch: typeof fetch = async (input, init) => {
			const url = new URL(
				typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
				location.origin
			);
			if (url.origin !== location.origin) return Response.json({ success: false }, { status: 403 });
			if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);
			if (url.pathname === '/api/admin/boosting-orders/analytics')
				return Response.json({ success: true, data: analytics });
			if (url.pathname === '/api/admin/boosting-orders') {
				const status = url.searchParams.get('status') ?? 'active',
					search = (url.searchParams.get('q') ?? '').toLowerCase();
				const selected = rows.filter(
					(row) =>
						(status === 'all' ||
							(status === 'active'
								? row.boostFulfillmentStatus !== 'completed'
								: status === 'overdue'
									? row.overdueReview && row.boostFulfillmentStatus !== 'completed'
									: row.boostFulfillmentStatus === status)) &&
						`${row.productName} ${row.order.orderNumber} ${row.order.user.fullName}`
							.toLowerCase()
							.includes(search)
				);
				return Response.json({
					success: true,
					data: selected,
					meta: listMeta(status, selected.length)
				});
			}
			const match = url.pathname.match(/^\/api\/admin\/boosting-orders\/(demo-[a-z]+)\/support$/);
			const row = rows.find((item) => item.id === match?.[1]);
			if (row && init?.method === 'POST') {
				const body = JSON.parse(String(init.body));
				const revision = crypto.randomUUID();
				if (body.action === 'request_link') {
					row.boostFulfillmentStatus = 'needs_link';
					row.support = {
						...getBoostSupportState([]),
						state: 'awaiting_customer',
						revision,
						requestId: revision,
						message: body.message
					};
				} else if (body.action === 'withdraw_link') {
					row.boostFulfillmentStatus = 'under_review';
					row.support = { ...getBoostSupportState([]), revision };
				} else if (body.action === 'confirm_delivery') {
					if (!body.confirmed || String(body.evidence).trim().length < 10)
						return Response.json(
							{ success: false, error: 'Delivery evidence is required.' },
							{ status: 400 }
						);
					row.boostFulfillmentStatus = 'completed';
					row.fulfillmentState.status = 'completed';
					row.holdReasons = [];
					row.overdueReview = false;
					row.support = {
						...getBoostSupportState([]),
						state: 'resolved',
						revision,
						message: body.message
					};
				} else if (body.action === 'confirm_failure') {
					row.boostFulfillmentStatus = 'under_review';
					row.holdReasons = [
						'Missing delivery recorded for support review. No supplier action was taken.'
					];
				} else if (body.action !== 'message')
					return Response.json({ success: false }, { status: 400 });
				notice = 'Preview updated. No real order, message, refund or supplier request was changed.';
				return Response.json({ success: true });
			}
			return Response.json(
				{ success: false, error: 'Preview only. No real action is available here.' },
				{ status: 403 }
			);
		};
		window.fetch = mockFetch;
		ready = true;
		return () => {
			if (window.fetch === mockFetch) window.fetch = originalFetch;
		};
	});
	function interceptNavigation(event: MouseEvent) {
		if (event.target instanceof Element && event.target.closest('a[href^="/admin"]')) {
			event.preventDefault();
			notice =
				'This opens the full order or report in the real admin. Preview stays on fictional data.';
		}
	}
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>
<aside class="preview-notice">
	LOCAL PREVIEW · Fictional orders · No real changes
	{#if notice}<p role="status">{notice}</p>{/if}
</aside>
<main class="preview-page" onclickcapture={interceptNavigation}>
	{#if ready}<Orders data={example} />{:else}<p>Loading preview…</p>{/if}
</main>

<style>
	.preview-notice {
		padding: 12px 20px;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		font-size: 11px;
	}
	.preview-notice p {
		margin-top: 6px;
		color: var(--primary);
	}
	.preview-page {
		max-width: 1120px;
		margin: auto;
		padding: 24px 16px 64px;
	}
</style>
