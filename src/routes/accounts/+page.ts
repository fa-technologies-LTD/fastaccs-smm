import type { Load } from '@sveltejs/kit';

export const load: Load = async () => {
	// For now, return empty accounts since this page isn't part of the main user flow
	// We can implement this later using proper API endpoints
	return {
		accounts: []
	};
};
