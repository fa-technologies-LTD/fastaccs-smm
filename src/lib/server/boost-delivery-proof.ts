import { prisma } from '$lib/prisma';
import { recordOrderEvent } from '$lib/services/order-events';
import {
	deletePrivateImage,
	receiptFromMetadata,
	uploadPrivateImage,
	type PayoutReceipt
} from './payout-receipts';

/**
 * Delivery proof for a Boosting item: a screenshot an admin keeps privately in Cloudinary. The customer
 * never sees an empty slot or a proof by default; it opens for them only after they reported a delivery
 * problem and that report was closed, and then only once (with a short grace for a reload). The image is
 * deleted after 30 days. Order events hold the small record, so no table or migration is needed.
 */
export const BOOST_PROOF_ADDED = 'boost_delivery_proof_added';
export const BOOST_PROOF_VIEWED = 'boost_delivery_proof_viewed';
export const BOOST_PROOF_DELETED = 'boost_delivery_proof_deleted';
export const BOOST_PROOF_EVENT_TYPES = [BOOST_PROOF_ADDED, BOOST_PROOF_VIEWED, BOOST_PROOF_DELETED];
export const BOOST_PROOF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const BOOST_PROOF_VIEW_GRACE_MS = 10 * 60 * 1000;
const PROOF_FOLDER = 'boost-delivery-proof';
// A report the admin has closed, either fixed or found to be delivered.
const CLOSED_REPORT_STATUSES = ['resolved', 'rejected'];

export interface BoostProofState {
	proof: PayoutReceipt | null;
	addedAt: string | null;
	firstViewedAt: string | null;
	deletedAt: string | null;
	expiresAt: string | null;
}

export type BoostProofAccess = 'none' | 'available' | 'viewing' | 'used';

interface ProofEvent {
	type: string;
	metadata: unknown;
	occurredAt: Date | string;
}

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const time = (value: Date | string) => new Date(value).getTime();

/** The current proof on one item from its event history; a newer upload replaces an older one. */
export function readBoostProof(events: ProofEvent[]): BoostProofState {
	let state: BoostProofState = {
		proof: null,
		addedAt: null,
		firstViewedAt: null,
		deletedAt: null,
		expiresAt: null
	};
	for (const event of [...events].sort((a, b) => time(a.occurredAt) - time(b.occurredAt))) {
		const metadata = record(event.metadata);
		const at = new Date(event.occurredAt).toISOString();
		if (event.type === BOOST_PROOF_ADDED) {
			const proof = receiptFromMetadata({ receipt: metadata.proof });
			if (proof)
				state = {
					proof,
					addedAt: at,
					firstViewedAt: null,
					deletedAt: null,
					expiresAt: new Date(time(at) + BOOST_PROOF_RETENTION_MS).toISOString()
				};
		} else if (state.proof && metadata.publicId === state.proof.publicId) {
			if (event.type === BOOST_PROOF_VIEWED) state.firstViewedAt ??= at;
			if (event.type === BOOST_PROOF_DELETED) state.deletedAt ??= at;
		}
	}
	return state;
}

/**
 * Whether the customer may open the proof: only after one of their reports on this item was closed,
 * once, within 30 days. "viewing" is the short grace after the first open, so a reload still works.
 */
export function customerProofAccess(
	state: BoostProofState,
	reports: Array<{ status: string }>,
	now = Date.now()
): BoostProofAccess {
	if (!state.proof || state.deletedAt || !state.expiresAt || now >= time(state.expiresAt))
		return 'none';
	if (!reports.some((report) => CLOSED_REPORT_STATUSES.includes(report.status))) return 'none';
	if (!state.firstViewedAt) return 'available';
	return now - time(state.firstViewedAt) <= BOOST_PROOF_VIEW_GRACE_MS ? 'viewing' : 'used';
}

/** What the admin sees about a proof: when it was saved, opened and deleted. Never the image reference. */
export function adminProofSummary(state: BoostProofState) {
	return state.proof
		? {
				uploadedAt: state.addedAt,
				firstViewedAt: state.firstViewedAt,
				deletedAt: state.deletedAt,
				expiresAt: state.expiresAt
			}
		: null;
}

export async function loadBoostProof(orderItemId: string): Promise<BoostProofState> {
	const events = await prisma.orderEvent.findMany({
		where: { orderItemId, type: { in: BOOST_PROOF_EVENT_TYPES } },
		select: { type: true, metadata: true, occurredAt: true }
	});
	return readBoostProof(events);
}

export async function addBoostProof(input: {
	orderId: string;
	orderItemId: string;
	file: File;
	actorUserId: string;
}): Promise<PayoutReceipt> {
	const proof = await uploadPrivateImage(input.file, input.actorUserId, {
		folder: PROOF_FOLDER,
		tag: 'boost_delivery_proof'
	});
	await recordOrderEvent({
		orderId: input.orderId,
		orderItemId: input.orderItemId,
		type: BOOST_PROOF_ADDED,
		source: 'admin.boosting_proof',
		actorUserId: input.actorUserId,
		description: 'Delivery proof added',
		idempotencyKey: `boosting:proof:${proof.publicId}:added`,
		metadata: { proof: { ...proof } }
	});
	return proof;
}

/** The first open is what counts; repeat opens inside the grace reuse the same record. */
export async function recordBoostProofViewed(input: {
	orderId: string;
	orderItemId: string;
	publicId: string;
	userId: string;
}): Promise<void> {
	await recordOrderEvent({
		orderId: input.orderId,
		orderItemId: input.orderItemId,
		type: BOOST_PROOF_VIEWED,
		source: 'customer.boosting_proof',
		actorUserId: input.userId,
		description: 'Customer opened the delivery proof',
		idempotencyKey: `boosting:proof:${input.publicId}:viewed`,
		metadata: { publicId: input.publicId }
	});
}

/** Deletes proof images older than 30 days, including ones replaced by a newer upload. */
export async function deleteExpiredBoostProofs(now = Date.now()): Promise<{ deleted: number }> {
	// The hourly run reaches every proof within an hour of its 30 days; the 60-day window keeps
	// retrying a failed delete for a while without rereading proofs that were deleted long ago.
	const added = await prisma.orderEvent.findMany({
		where: {
			type: BOOST_PROOF_ADDED,
			occurredAt: {
				lt: new Date(now - BOOST_PROOF_RETENTION_MS),
				gte: new Date(now - 3 * BOOST_PROOF_RETENTION_MS)
			}
		},
		select: { orderId: true, orderItemId: true, metadata: true },
		orderBy: { occurredAt: 'asc' },
		take: 200
	});
	const candidates = added
		.map((event) => ({
			...event,
			proof: receiptFromMetadata({ receipt: record(event.metadata).proof })
		}))
		.filter((event) => event.proof);
	if (!candidates.length) return { deleted: 0 };
	const done = await prisma.orderEvent.findMany({
		where: {
			type: BOOST_PROOF_DELETED,
			idempotencyKey: {
				in: candidates.map((event) => `boosting:proof:${event.proof?.publicId}:deleted`)
			}
		},
		select: { idempotencyKey: true }
	});
	const alreadyDeleted = new Set(done.map((event) => event.idempotencyKey));
	let deleted = 0;
	for (const event of candidates) {
		const publicId = event.proof?.publicId as string;
		const key = `boosting:proof:${publicId}:deleted`;
		if (alreadyDeleted.has(key) || deleted >= 25) continue;
		if (!(await deletePrivateImage(publicId, now))) continue;
		await recordOrderEvent({
			orderId: event.orderId,
			orderItemId: event.orderItemId,
			type: BOOST_PROOF_DELETED,
			source: 'automation.boosting_proof',
			description: 'Delivery proof deleted after 30 days',
			idempotencyKey: key,
			metadata: { publicId }
		});
		deleted += 1;
	}
	return { deleted };
}
