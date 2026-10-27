/**
 * Admin actions are logged as "METHOD /path" by the request hook. This turns those into plain
 * sentences for the dashboard, plus a link to the thing that changed. Descriptions that are already
 * written as sentences pass through untouched.
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LOGGED_REQUEST = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)$/i;

type Rule = {
	method: string;
	path: RegExp;
	label: string | ((match: RegExpMatchArray) => string);
	href?: (match: RegExpMatchArray) => string;
};

const orderHref = (match: RegExpMatchArray) => `/admin/orders/${match[1]}`;
const humanize = (value: string) =>
	value.replace(/[-_]+/g, ' ').replace(/^\w/, (char) => char.toUpperCase());

const RULES: Rule[] = [
	{
		method: 'POST',
		path: new RegExp(`^/api/orders/(${UUID})/refund$`),
		label: 'Order refunded to store credit',
		href: orderHref
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/orders/(${UUID})/replace-account$`),
		label: 'Faulty account replaced',
		href: orderHref
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/orders/(${UUID})/refund-account$`),
		label: 'Faulty account refunded',
		href: orderHref
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/orders/(${UUID})/deliver$`),
		label: 'Order delivered',
		href: orderHref
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/orders/(${UUID})/notes$`),
		label: 'Order note added',
		href: orderHref
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/orders/(${UUID})/process$`),
		label: 'Order processing started',
		href: orderHref
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/orders/(${UUID})/release-to-profile$`),
		label: 'Logs released to your profile',
		href: orderHref
	},
	{
		method: 'PATCH',
		path: new RegExp(`^/api/orders/(${UUID})$`),
		label: 'Order updated',
		href: orderHref
	},
	{ method: 'POST', path: /^\/api\/orders$/, label: 'Order placed from an admin login' },
	{
		method: 'PATCH',
		path: new RegExp(`^/api/admin/boosting-orders/(${UUID})$`),
		label: 'Boosting order updated',
		href: orderHref
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/admin/boosting-orders/(${UUID})/support$`),
		label: 'Boosting order: customer update sent',
		href: orderHref
	},
	{
		method: 'PATCH',
		path: /^\/api\/admin\/boosting-complaints\//,
		label: 'Boosting complaint reviewed'
	},
	{
		method: 'POST',
		path: /^\/api\/batches(\/import)?$/,
		label: 'Logs uploaded',
		href: () => '/admin/batches'
	},
	{
		method: 'PATCH',
		path: /^\/api\/batches\//,
		label: 'Upload edited',
		href: () => '/admin/batches'
	},
	{
		method: 'POST',
		path: /^\/api\/accounts$/,
		label: 'Accounts added',
		href: () => '/admin/inventory'
	},
	{
		method: 'POST',
		path: /^\/api\/categories\/tiers\/batch$/,
		label: 'Account types updated',
		href: () => '/admin/tiers'
	},
	{
		method: 'POST',
		path: /^\/api\/categories$/,
		label: 'Account type or platform added',
		href: () => '/admin/tiers'
	},
	{
		method: 'PUT',
		path: new RegExp(`^/api/categories/${UUID}$`),
		label: 'Account type or platform edited',
		href: () => '/admin/tiers'
	},
	{
		method: 'DELETE',
		path: new RegExp(`^/api/categories/${UUID}/offload$`),
		label: 'Unsold logs deleted',
		href: () => '/admin/inventory'
	},
	{
		method: 'DELETE',
		path: new RegExp(`^/api/categories/${UUID}$`),
		label: 'Account type or platform deleted',
		href: () => '/admin/tiers'
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/categories/${UUID}/retire$`),
		label: 'Platform retired',
		href: () => '/admin/platforms'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/uploads\/tier-sample-screenshot$/,
		label: 'Account type sample picture uploaded',
		href: () => '/admin/tiers'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/boosting-pricing$/,
		label: 'Boosting prices saved',
		href: () => '/admin/boosting-pricing'
	},
	{
		method: 'PUT',
		path: /^\/api\/admin\/boosting-mappings\//,
		label: 'Boosting supplier route saved',
		href: () => '/admin/boosting-pricing'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/boosting-suppliers\/sync$/,
		label: 'Boosting suppliers refreshed',
		href: () => '/admin/boosting-services'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/numbers$/,
		label: 'Numbers prices saved',
		href: () => '/admin/numbers'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/exact-preview\/thumbnails$/,
		label: 'Preview pictures made'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/broadcast\/send$/,
		label: 'Broadcast sent',
		href: () => '/admin/broadcast'
	},
	{
		method: 'POST',
		path: new RegExp(`^/api/admin/affiliates/(${UUID})/bank-details$`),
		label: 'Affiliate bank details reviewed',
		href: (m) => `/admin/affiliates/${m[1]}`
	},
	{
		method: 'PATCH',
		path: new RegExp(`^/api/admin/affiliates/(${UUID})/toggle$`),
		label: 'Affiliate switched on or off',
		href: (m) => `/admin/affiliates/${m[1]}`
	},
	{
		method: 'PATCH',
		path: new RegExp(`^/api/admin/users/(${UUID})/status$`),
		label: 'Customer status changed',
		href: (m) => `/admin/users/${m[1]}`
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/promotions$/,
		label: 'Promo code created',
		href: () => '/admin/promotions'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/roles$/,
		label: 'Team access changed',
		href: () => '/admin/settings'
	},
	{
		method: 'POST',
		path: /^\/admin\/settings$/,
		label: 'Settings saved',
		href: () => '/admin/settings'
	},
	{
		method: 'POST',
		path: /^\/api\/admin\/automation\/([^/]+)\/run$/,
		label: (m) => `Ran by hand: ${humanize(m[1])}`,
		href: () => '/admin/automation'
	}
];

const VERB: Record<string, string> = {
	POST: 'saved',
	PUT: 'updated',
	PATCH: 'updated',
	DELETE: 'deleted'
};

export function describeAdminActivity(description: string | null | undefined): {
	label: string;
	href: string | null;
} {
	const text = String(description ?? '').trim();
	const logged = text.match(LOGGED_REQUEST);
	if (!logged) return { label: text || 'Admin action', href: null };
	const method = logged[1].toUpperCase();
	const path = logged[2].split('?')[0];
	for (const rule of RULES) {
		if (rule.method !== method) continue;
		const match = path.match(rule.path);
		if (!match) continue;
		return {
			label: typeof rule.label === 'function' ? rule.label(match) : rule.label,
			href: rule.href ? rule.href(match) : null
		};
	}
	// Unknown route: name the area it touched, never the raw path.
	const area = path
		.split('/')
		.filter(
			(part) =>
				part && part !== 'api' && part !== 'admin' && !new RegExp(`^${UUID}$`, 'i').test(part)
		)
		.slice(0, 2)
		.join(' ');
	return { label: `${humanize(area || 'Admin')} ${VERB[method] ?? 'changed'}`, href: null };
}
