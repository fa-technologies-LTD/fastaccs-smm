# Boosting supplier automation plan

## Goal

Send paid boosting orders to a supplier automatically, track delivery, and keep manual control when anything is unclear.

Checkout must stay independent of the supplier. A slow or unavailable supplier must never delay payment confirmation or create duplicate supplier orders.

## Customer experience

The customer flow stays exactly as it is:

1. Pick a service and quantity.
2. Paste the profile or post link.
3. Pay.
4. Track the order from the existing order page.

No supplier names, IDs, balances, or technical errors should be shown to customers.

## Recommended architecture

### 1. Provider adapter

Create one internal interface with these operations:

- `placeOrder(serviceRef, targetUrl, quantity, idempotencyKey)`
- `getOrder(providerReference)`
- `requestRefill(providerReference)` when supported
- `cancelOrder(providerReference)` when supported
- `getBalance()`
- `listServices()` for admin mapping only

The first supplier implements this interface. Adding a second supplier later should not change checkout or customer pages.

### 2. Explicit service mapping

Each Fast Accounts boosting service maps to an exact supplier service ID with:

- Provider
- Supplier service ID and current name
- Minimum, maximum, and allowed quantity step
- Supplier cost and currency
- Refill/cancel support
- Enabled/disabled state
- Last successful sync time

Never match services by name at order time. Names change and can send a paid order to the wrong service.

### 3. Durable fulfilment record

Add a dedicated boosting fulfilment record instead of putting the whole integration into `OrderItem.boostProviderReference`. It should store:

- Order item ID
- Provider and service ID
- Customer target URL and quantity snapshot
- Idempotency key
- Provider reference
- Internal status and raw provider status
- Cost snapshot
- Attempt count and next retry time
- Last error category and safe admin message
- Submitted, started, completed, and last-checked timestamps

Keep append-only order events for the history visible to admins.

### 4. Asynchronous submission

After payment is confirmed:

1. Save the paid order normally.
2. Queue the order item for supplier submission.
3. A worker claims the item with a short lease.
4. It validates the saved mapping, margin, quantity, and target link again.
5. It submits once using the order item ID as the idempotency key.
6. It stores the supplier reference before any further work.

Never call the supplier directly inside checkout, Monnify verification, or webhook handling.

### 5. Status updates without high compute

Prefer provider webhooks when trustworthy. Keep a bounded polling worker as a fallback:

- New orders: check more frequently for a short period.
- Running orders: check less often.
- Old or unchanged orders: back off further.
- Completed, cancelled, or rejected orders: stop polling.
- Process a capped batch per run and use one distributed lease.

This preserves timely feedback without repeatedly scanning every historical order.

## Status rules

Use a small customer-facing set:

- `pending`: paid and waiting to submit
- `in_progress`: accepted by the supplier
- `needs_link`: customer must correct the link
- `completed`: supplier confirmed completion
- `rejected`: admin reviewed and rejected it

Provider-only states such as partial, cancelled, refill, or API error remain internal until mapped deliberately.

Do not auto-refund merely because a supplier times out or returns an unknown response. Move the order to admin review first so a delayed supplier response cannot produce both a refund and a completed boost.

## Admin controls

Extend the existing Boosting Orders screen with:

- Automation status and supplier reference
- Supplier cost and expected margin for revenue-authorized admins
- Retry submission
- Refresh supplier status
- Request refill/cancel when supported
- Switch to manual handling
- Correct service mapping without editing the paid order
- Provider balance and last successful API call
- Clear failure reason and complete event timeline

Every mutation must be audited and idempotent.

## Safety requirements

- Supplier keys live only in encrypted server environment variables.
- Redact keys and full API responses from logs.
- Validate the target URL before submission, but retain the existing customer correction path.
- Enforce a configurable minimum margin before a service can be automated.
- Stop new submissions if the balance is low, mappings are stale, or error rates spike.
- Rate-limit supplier calls and use timeouts with bounded retries.
- Reconcile paid-but-unsubmitted items independently of the webhook path.

## Rollout

1. **Read-only:** connect to the supplier, sync services/balance, and compare mappings. Place no orders.
2. **Shadow:** build the exact payload and show it to admins while orders remain manual.
3. **Pilot:** automate one low-risk service with a strict quantity cap.
4. **Expand:** add services only after completed pilot orders reconcile exactly.
5. **Failover later:** consider a second supplier only after the first adapter is stable.

## Information needed before implementation

- Supplier name and official API documentation
- API key/authentication method
- Service catalogue and current rates
- Supported order-status values
- Refill, cancellation, and webhook behaviour
- Whether its order endpoint supports an idempotency/client reference
- Balance endpoint and rate limits
- Refund/partial-delivery rules
