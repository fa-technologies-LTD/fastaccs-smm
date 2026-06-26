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

	const serviceId = String(url.searchParams.get('serviceId') || '').trim();
	if (!isUuid(serviceId)) {
		return json({ success: false, error: 'Invalid serviceId' }, { status: 400 });
	}

	const existing = await prisma.boostingServiceWaitlist.findFirst({
		where: {
			userId: locals.user.id,
			serviceId,
			notifiedAt: null
		},
		select: { id: true, createdAt: true }
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
	const serviceId = String(payload?.serviceId || '').trim();

	if (!isUuid(serviceId)) {
		return json({ success: false, error: 'Invalid serviceId' }, { status: 400 });
	}

	if (!locals.user.email) {
		return json(
			{ success: false, error: 'No email is associated with your account.' },
			{ status: 400 }
		);
	}

	const service = await prisma.category.findFirst({
		where: {
			id: serviceId,
			categoryType: 'boosting_service'
		},
		select: { id: true, name: true }
	});

	if (!service) {
		return json({ success: false, error: 'Service not found' }, { status: 404 });
	}

	const existing = await prisma.boostingServiceWaitlist.findFirst({
		where: {
			userId: locals.user.id,
			serviceId,
			notifiedAt: null
		},
		select: { id: true }
	});

	if (existing) {
		return json({
			success: true,
			alreadyExists: true,
			message: `You will be notified when ${service.name} is live.`
		});
	}

	await prisma.boostingServiceWaitlist.upsert({
		where: {
			userId_serviceId: {
				userId: locals.user.id,
				serviceId
			}
		},
		update: {
			email: locals.user.email,
			notifiedAt: null,
			createdAt: new Date()
		},
		create: {
			userId: locals.user.id,
			email: locals.user.email,
			serviceId
		}
	});

	return json({
		success: true,
		alreadyExists: false,
		message: `You will be notified when ${service.name} is live.`
	});
};
