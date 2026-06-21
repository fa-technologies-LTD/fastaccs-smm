import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/categories?type=boosting_service');
		const result = await response.json();

		if (!response.ok) {
			return {
				services: [],
				error: result.error || 'Failed to load boosting services'
			};
		}

		return {
			services: result.data || [],
			error: null
		};
	} catch (error) {
		console.error('Failed to load boosting services:', error);
		return {
			services: [],
			error: 'Failed to load boosting services'
		};
	}
};
