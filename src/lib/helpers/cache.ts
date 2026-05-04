// Server-side cache utility for API responses

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

class ServerCache {
	private cache = new Map<string, CacheEntry<unknown>>();

	/**
	 * Get cached data if not expired
	 */
	get<T>(key: string, ttl: number): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		const age = Date.now() - entry.timestamp;
		if (age > ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.data as T;
	}

	/**
	 * Set cache entry
	 */
	set<T>(key: string, data: T): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});
	}

	/**
	 * Invalidate specific cache key
	 */
	invalidate(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * Invalidate cache keys matching pattern
	 */
	invalidatePattern(pattern: string): void {
		const regex = new RegExp(pattern);
		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Clear all cache
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Clean up expired entries
	 */
	cleanup(maxAge: number = 10 * 60 * 1000): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > maxAge) {
				this.cache.delete(key);
			}
		}
	}
}

// Singleton instance
export const serverCache = new ServerCache();

// Periodic cleanup (every 5 minutes)
if (typeof setInterval !== 'undefined') {
	setInterval(
		() => {
			serverCache.cleanup();
		},
		5 * 60 * 1000
	);
}

/**
 * Cache headers for HTTP responses
 */
export function getCacheHeaders(
	strategy: 'static' | 'dynamic' | 'private' | 'no-cache' | 'admin-live'
) {
	switch (strategy) {
		case 'static':
			// For data that rarely changes (platforms, categories)
			return {
				'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				'CDN-Cache-Control': 'public, max-age=86400'
			};
		case 'dynamic':
			// For data that changes frequently (orders, inventory)
			return {
				'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
			};
		case 'private':
			// For user-specific data (dashboard, profile)
			return {
				'Cache-Control': 'private, max-age=300, stale-while-revalidate=600'
			};
		case 'no-cache':
			// For sensitive operations (checkout, payments)
			return {
				'Cache-Control': 'no-store, no-cache, must-revalidate',
				Pragma: 'no-cache',
				Expires: '0'
			};
		case 'admin-live':
			// For authenticated admin metrics that must be fresh and never publicly cached
			return {
				'Cache-Control': 'private, no-store, no-cache, must-revalidate',
				Pragma: 'no-cache',
				Expires: '0'
			};
	}
}

/**
 * TTL constants for different data types
 */
export const CACHE_TTL = {
	ADMIN_STATS: 2 * 60 * 1000, // 2 minutes
	USER_DATA: 5 * 60 * 1000, // 5 minutes
	STATIC_DATA: 60 * 60 * 1000, // 1 hour
	DYNAMIC_DATA: 60 * 1000 // 1 minute
} as const;
