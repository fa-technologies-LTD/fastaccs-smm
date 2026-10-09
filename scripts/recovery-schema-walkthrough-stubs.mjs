// Isolated staging harness only. No provider, email, reward or financial dispatch.
const state = globalThis.__recoverySchemaWalkthrough;
if (!state) throw new Error('Recovery schema walkthrough context required.');
export const prisma = new Proxy(
	{},
	{
		get: (_target, key) => {
			if (!state.database) throw new Error('Transactional fixture database required.');
			return state.database[key];
		}
	}
);
export const processMonnifyWebhookEvent = async (payload) => {
	if (!payload.eventData.paymentReference?.startsWith(state.prefix))
		throw new Error('Non-fixture webhook prohibited.');
	state.calls.push(payload.eventData.paymentReference);
	return Response.json(
		{ success: state.gatewayOutcome === 'success' },
		{
			status: state.gatewayOutcome === 'temporary' ? 503 : 200
		}
	);
};
const effect = (name) => async () => {
	state.effects.push(name);
	if (state.failReward === name) throw new Error('Synthetic reward interruption.');
};
export const sendCriticalAdminAlert = effect('alert');
export const maybeVoidSuperActivationOnRefund = effect('activation');
export const reconcileAffiliateSales = effect('sales');
export const voidUnvestedRewardsForOrder = effect('void');
export const reverseVestedRegularRewardForOrder = effect('reverse');
export const reconcileRegularRewardForOrder = effect('partial');
export const maybeClawbackSpendMilestones = effect('milestones');
