export const load = async ({ fetch }) => {
	try {
		const response = await fetch('/api/categories');
		if (!response.ok) {
			return {
				platforms: [],
				error: `Failed to load platforms: ${response.status} ${response.statusText}`
			};
		}
		const result = await response.json();
		return {
			platforms: result.data || [],
			error: null
		};
	} catch (error) {
		console.error('Failed to load platforms:', error);
		return {
			platforms: [],
			error: 'Failed to load platforms'
		};
	}
};
