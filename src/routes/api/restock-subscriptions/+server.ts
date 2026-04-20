import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const tierId = String(url.searchParams.get('tierId') || '').trim();
	if (!isUuid(tierId)) {
		return json({ success: false, error: 'Invalid tierId' }, { status: 400 });
	}

	const existing = await prisma.restockSubscription.findFirst({
		where: {
			userId: locals.user.id,
			tierId,
			notifiedAt: null
		},
		select: {
			id: true,
			createdAt: true
		}
	});

	return json({
		success: true,
		data: {
			subscribed: Boolean(existing),
			subscribedAt: existing?.createdAt?.toISOString() || null
		}
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json().catch(() => ({}));
	const tierId = String(payload?.tierId || '').trim();

	if (!isUuid(tierId)) {
		return json({ success: false, error: 'Invalid tierId' }, { status: 400 });
	}

	if (!locals.user.email) {
		return json(
			{ success: false, error: 'No email is associated with your account.' },
			{ status: 400 }
		);
	}

	const tier = await prisma.category.findFirst({
		where: {
			id: tierId,
			categoryType: 'tier'
		},
		include: {
			parent: {
				select: {
					name: true
				}
			}
		}
	});

	if (!tier) {
		return json({ success: false, error: 'Tier not found' }, { status: 404 });
	}

	const existing = await prisma.restockSubscription.findFirst({
		where: {
			userId: locals.user.id,
			tierId,
			notifiedAt: null
		},
		select: { id: true }
	});

	if (existing) {
		return json({
			success: true,
			alreadyExists: true,
			message: `You will be notified when ${tier.name} is back in stock.`
		});
	}

	await prisma.restockSubscription.upsert({
		where: {
			userId_tierId: {
				userId: locals.user.id,
				tierId
			}
		},
		update: {
			email: locals.user.email,
			platformName: tier.parent?.name || 'Platform',
			tierName: tier.name,
			notifiedAt: null,
			createdAt: new Date()
		},
		create: {
			userId: locals.user.id,
			email: locals.user.email,
			tierId,
			platformName: tier.parent?.name || 'Platform',
			tierName: tier.name
		}
	});

	return json({
		success: true,
		alreadyExists: false,
		message: `You will be notified when ${tier.name} is back in stock.`
	});
};
