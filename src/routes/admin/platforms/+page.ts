import { getPlatforms } from '$lib/services/categories';

export const load = async () => {
	const result = await getPlatforms();

	return {
		platforms: result.data || [],
		error: result.error?.message || null
	};
};
