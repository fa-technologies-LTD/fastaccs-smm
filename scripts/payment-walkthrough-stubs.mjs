// Used only by the explicitly invoked staging walkthrough, never application code.
const state = globalThis.__paymentWalkthrough;
if (!state) throw new Error('Staging walkthrough context missing.');
export const prisma = state.db;
const record =
	(name) =>
	async (...args) => {
		state.effects.push({ name, orderId: typeof args[0] === 'string' ? args[0] : args[0]?.orderId });
	};
const forbidden = (name) => async () => {
	throw new Error(`External/fulfillment side effect prohibited: ${name}`);
};
export const allocateAccountsForOrder = forbidden('account allocation');
export const confirmPhonePaymentAndInitializeRental = forbidden('phone initialization');
export const initPhoneOrder = forbidden('phone order');
export const queuePaidBoostFulfillments = forbidden('supplier submission');
export const sendGa4MeasurementProtocolEvents = async (input) => {
	if (!state.analyticsConfigured || typeof state.analyticsHandler !== 'function')
		return forbidden('analytics dispatch')();
	for (const event of input.events || []) {
		if (!state.analyticsOrders.has(event.params?.transaction_id))
			throw new Error('Analytics test attempted a non-fixture transaction.');
	}
	// In-memory transport only. Never call Google or any other external endpoint.
	state.analyticsEvents.push(structuredClone(input));
	return state.analyticsHandler(input);
};
export const isGa4MeasurementProtocolConfigured = () => state.analyticsConfigured === true;
export const isAutoDeliveryPausedSetting = async () => true;
export const isBoostingOrder = async (id) => state.boostingOrders.has(id);
export const isManualHandoverOrder = async () => false;
export const isPhoneOrder = async () => false;
export const invalidateAdminStatsCache = () => undefined;
export const sendCriticalAdminAlert = record('admin alert');
export const sendLowStockAdminAlertIfNeeded = record('stock alert suppressed');
export const createUserNotification = record('notification suppressed');
export const maybeSendAffiliateUnlockInvite = record('affiliate invite');
export const recordAffiliateStoreCreditForOrder = record('affiliate reward');
export const sendOrderConfirmationEmailIfNeeded = record('confirmation email suppressed');
export const notifyManualHandoverOrderPaid = record('manual notification suppressed');
export const notifyBoostingOrderPaid = record('boost notification suppressed');
export const logOrderStatusTransition = record('transition');
export const releaseOrderReservations = record('reservations');
export const maybeGrantSpendMilestones = record('milestones');
export const recordPromotionRedemption = record('promotion');
export const maybeVoidSuperActivationOnRefund = record('activation void suppressed');
export const reconcileAffiliateSales = record('affiliate sales suppressed');
export const voidUnvestedRewardsForOrder = record('unvested rewards suppressed');
export const reverseVestedRegularRewardForOrder = record('vested rewards suppressed');
export const maybeClawbackSpendMilestones = record('milestone reversal suppressed');
export const recordOrderEvent = record('order event suppressed');
export const recordOrderEventBestEffort = record('order event suppressed');
export const enqueueRefundRecovery = record('refund recovery enqueue suppressed');
export class HubmanError extends Error {}
export const getPhonePricingConfig = forbidden('phone pricing lookup');
export const computeProcurementCeilingCents = forbidden('phone procurement');
export const acquireRateToken = forbidden('phone rate token');
export const pvapinsRateSpec = {};
export const PVAPINS_GET_NUMBER_BUCKET = 'fixture-only';
export const recordPhoneAttempt = record('phone attempt suppressed');
export const recordAttemptOtpReceived = record('phone telemetry suppressed');
export const recordAttemptOtpTimeout = record('phone telemetry suppressed');
export const recordAttemptRejection = record('phone telemetry suppressed');
export const classifyRentFailure = forbidden('phone failure classification');
export const providerForRental = forbidden('phone provider');
export const refForRental = forbidden('phone reference');
export const getProvider = forbidden('phone provider');
export const buildLiveCandidatePool = forbidden('phone supplier catalogue');
export const candidateKeyFromRental = forbidden('phone supplier candidate');
