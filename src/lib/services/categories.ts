// Type for category metadata
export interface CategoryMetadata {
	icon?: string;
	color?: string;
	logo_url?: string;
	website_url?: string;
	api_info?: {
		base_url?: string;
		rate_limits?: Record<string, number>;
		auth_methods?: string[];
	};
	platform_info?: {
		followers_range?: [number, number];
		content_types?: string[];
		demographics?: string[];
	};
	[key: string]: unknown;
}

// Category type to match Prisma schema
export interface Category {
	id: string;
	parentId: string | null;
	name: string;
	slug: string;
	description: string | null;
	categoryType: 'platform' | 'tier' | 'service_group' | 'boosting_service';
	metadata: CategoryMetadata;
	sortOrder: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	parent?: Category | null; // Optional parent relation
}

export interface CategoryInsert {
	parentId?: string | null;
	name: string;
	slug: string;
	description?: string | null;
	categoryType: 'platform' | 'tier' | 'service_group' | 'boosting_service';
	metadata?: CategoryMetadata;
	sortOrder?: number;
	isActive?: boolean;
}

export interface CategoryUpdate {
	parentId?: string | null;
	name?: string;
	slug?: string;
	description?: string | null;
	categoryType?: 'platform' | 'tier' | 'service_group' | 'boosting_service';
	metadata?: CategoryMetadata;
	sortOrder?: number;
	isActive?: boolean;
}

export interface RetireCategoryOptions {
	moveAvailableInventory?: boolean;
	targetCategoryId?: string;
}

// Helper function to handle API responses
async function handleApiCall(response: Response) {
	if (!response.ok) {
		try {
			const payload = await response.json();
			return {
				data: null,
				error: payload?.error || `HTTP ${response.status}: ${response.statusText}`
			};
		} catch {
			return {
				data: null,
				error: `HTTP ${response.status}: ${response.statusText}`
			};
		}
	}

	try {
		return await response.json();
	} catch {
		return {
			data: null,
			error: 'Invalid API response'
		};
	}
}

// Update category
export async function updateCategory(id: string, updates: CategoryUpdate) {
	try {
		const response = await fetch(`/api/categories/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to update category:', error);
		return { data: null, error: 'Failed to update category' };
	}
}

// Delete category
export async function deleteCategory(id: string) {
	try {
		const response = await fetch(`/api/categories/${id}`, {
			method: 'DELETE'
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to delete category:', error);
		return { data: null, error: 'Failed to delete category' };
	}
}

// Retire/archive category without hard delete
export async function retireCategory(id: string, options: RetireCategoryOptions = {}) {
	try {
		const response = await fetch(`/api/categories/${id}/retire`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(options)
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to retire category:', error);
		return { data: null, error: 'Failed to retire category' };
	}
}

// Generic create category function
export async function createCategory(category: CategoryInsert) {
	try {
		const response = await fetch('/api/categories', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(category)
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to create category:', error);
		return { data: null, error: 'Failed to create category' };
	}
}
