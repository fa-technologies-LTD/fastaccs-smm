import { prisma } from '$lib/prisma';
import {
	normalizeTierDeliveryMode,
	type TierDeliveryMode
} from '$lib/helpers/tier-delivery-config';

function extractTierModeFromMetadata(metadata: unknown): TierDeliveryMode {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return 'instant_auto';
	}

	return normalizeTierDeliveryMode((metadata as Record<string, unknown>).delivery_mode);
}

export async function getOrderTierDeliveryMode(orderId: string): Promise<TierDeliveryMode> {
	const orderItems = await prisma.orderItem.findMany({
		where: { orderId },
		select: {
			category: {
				select: {
					metadata: true
				}
			}
		}
	});

	if (orderItems.length === 0) {
		return 'instant_auto';
	}

	const modes = new Set<TierDeliveryMode>();
	for (const item of orderItems) {
		modes.add(extractTierModeFromMetadata(item.category?.metadata));
	}

	return modes.has('manual_handover') ? 'manual_handover' : 'instant_auto';
}

export async function isManualHandoverOrder(orderId: string): Promise<boolean> {
	const mode = await getOrderTierDeliveryMode(orderId);
	return mode === 'manual_handover';
}
