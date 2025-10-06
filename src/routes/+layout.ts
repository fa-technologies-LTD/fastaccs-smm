import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
	// For now, return minimal data until we implement proper auth
	// TODO: Implement proper authentication system
	return {
		session: null,
		user: null
	};
};
