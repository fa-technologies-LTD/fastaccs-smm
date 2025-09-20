export const load = async ({ parent }) => {
	const { supabase, user } = await parent();

	return {
		supabase,
		user
	};
};
