import { supabase } from '$lib/supabase';

export interface TierReservation {
	id: string;
	product_id: string;
	user_id?: string;
	user_session_id?: string;
	quantity: number;
	expires_at: string;
	created_at: string;
}

export interface ReservationResult {
	success: boolean;
	reservation?: TierReservation;
	error?: string;
}

/**
 * Create a tier reservation for 30 minutes
 */
export async function createTierReservation(
	productId: string,
	quantity: number,
	userId?: string,
	sessionId?: string
): Promise<ReservationResult> {
	try {
		// Set expiry to 30 minutes from now
		const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

		const reservationData: {
			product_id: string;
			quantity: number;
			expires_at: string;
			user_id?: string;
			user_session_id?: string;
		} = {
			product_id: productId,
			quantity,
			expires_at: expiresAt
		};

		if (userId) {
			reservationData.user_id = userId;
		} else if (sessionId) {
			reservationData.user_session_id = sessionId;
		}

		const { data, error } = await supabase
			.from('tier_reservations')
			.insert([reservationData])
			.select()
			.single();

		if (error) {
			console.error('Error creating tier reservation:', error);
			return { success: false, error: error.message };
		}

		return { success: true, reservation: data };
	} catch (err) {
		console.error('Error creating tier reservation:', err);
		return { success: false, error: 'Failed to create reservation' };
	}
}

/**
 * Update existing reservation quantity
 */
export async function updateTierReservation(
	reservationId: string,
	quantity: number
): Promise<ReservationResult> {
	try {
		// Extend expiry by 30 minutes when updating
		const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

		const { data, error } = await supabase
			.from('tier_reservations')
			.update({
				quantity,
				expires_at: expiresAt
			})
			.eq('id', reservationId)
			.select()
			.single();

		if (error) {
			console.error('Error updating tier reservation:', error);
			return { success: false, error: error.message };
		}

		return { success: true, reservation: data };
	} catch (err) {
		console.error('Error updating tier reservation:', err);
		return { success: false, error: 'Failed to update reservation' };
	}
}

/**
 * Remove tier reservation
 */
export async function removeTierReservation(reservationId: string): Promise<boolean> {
	try {
		const { error } = await supabase.from('tier_reservations').delete().eq('id', reservationId);

		if (error) {
			console.error('Error removing tier reservation:', error);
			return false;
		}

		return true;
	} catch (err) {
		console.error('Error removing tier reservation:', err);
		return false;
	}
}

/**
 * Get user's active reservations
 */
export async function getUserReservations(
	userId?: string,
	sessionId?: string
): Promise<TierReservation[]> {
	try {
		let query = supabase
			.from('tier_reservations')
			.select('*')
			.gt('expires_at', new Date().toISOString());

		if (userId) {
			query = query.eq('user_id', userId);
		} else if (sessionId) {
			query = query.eq('user_session_id', sessionId);
		} else {
			return [];
		}

		const { data, error } = await query;

		if (error) {
			console.error('Error fetching user reservations:', error);
			return [];
		}

		return data || [];
	} catch (err) {
		console.error('Error fetching user reservations:', err);
		return [];
	}
}

/**
 * Clean up expired reservations
 */
export async function cleanupExpiredReservations(): Promise<number> {
	try {
		const { data, error } = await supabase.rpc('cleanup_expired_reservations');

		if (error) {
			console.error('Error cleaning up expired reservations:', error);
			return 0;
		}

		return data || 0;
	} catch (err) {
		console.error('Error cleaning up expired reservations:', err);
		return 0;
	}
}

/**
 * Get time remaining for reservation
 */
export function getReservationTimeRemaining(expiresAt: string): number {
	const expiry = new Date(expiresAt).getTime();
	const now = Date.now();
	return Math.max(0, expiry - now);
}

/**
 * Check if reservation is expired
 */
export function isReservationExpired(expiresAt: string): boolean {
	return new Date(expiresAt).getTime() <= Date.now();
}
