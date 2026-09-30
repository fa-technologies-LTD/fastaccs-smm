import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';

function csvCell(value: unknown): string {
	let text = value === null || value === undefined ? '' : String(value);
	// Keep spreadsheet applications from interpreting exported text as a formula.
	if (/^[=+\-@]/.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:revenue:view')) {
		return new Response('Forbidden', { status: 403 });
	}

	const orders = await prisma.order.findMany({
		where: { paidAt: { not: null } },
		select: {
			id: true,
			orderNumber: true,
			paidAt: true,
			orderItems: {
				select: {
					productName: true,
					quantity: true,
					totalPrice: true
				},
				orderBy: { createdAt: 'asc' }
			}
		},
		orderBy: [{ paidAt: 'asc' }, { id: 'asc' }]
	});

	const rows = [['order_id', 'paid_at', 'product', 'quantity', 'amount']];
	for (const order of orders) {
		for (const item of order.orderItems) {
			rows.push([
				order.orderNumber || order.id,
				order.paidAt?.toISOString() || '',
				item.productName,
				String(item.quantity),
				Number(item.totalPrice).toFixed(2)
			]);
		}
	}

	const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
	const date = new Date().toISOString().slice(0, 10);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="fast-accounts-paid-orders-${date}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
};
