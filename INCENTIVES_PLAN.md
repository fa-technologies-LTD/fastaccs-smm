# Simple incentives for Numbers and Boosting

## Recommendation: automatic store-credit cashback

Use one sentence everywhere:

> Earn store credit when a Numbers or Boosting order is completed.

No points, levels, streaks, coupons to copy, or separate reward wallet. The existing store-credit balance is the reward and checkout already knows how to use it.

## Why this is the simplest option

- Customers immediately understand naira store credit.
- Nothing has to be activated or claimed.
- The reward appears in the existing wallet and automatically helps with a later purchase.
- One system works for both Numbers and Boosting.
- Refunds and reversals can use the existing financial integrity patterns.

## Proposed rule

Start with a configurable cashback percentage rather than promising a rate now.

- Calculate it from the **cash actually paid**, after discounts and store credit.
- Award it only after successful fulfilment:
  - Numbers: the one-time code was received.
  - Boosting: the service was marked completed.
- Do not award cashback on refunded, rejected, free, or fully store-credit-funded orders.
- Cap the reward per order and per customer each month.
- Reverse unspent cashback if the underlying order is later refunded.
- Never let cashback make an order fall below the configured margin floor.

The percentage and caps should be chosen from real margin data before launch. They must be independently configurable for Numbers and Boosting because their costs differ.

## Customer UI

Keep it to three small moments:

1. Service card: `Earn ₦X store credit` when the exact amount can be calculated.
2. Success state: `₦X store credit added`.
3. Wallet/history: one transaction named `Numbers reward` or `Boosting reward`.

Do not add a large loyalty dashboard in phase one.

## Admin controls

- Master on/off switch
- Numbers cashback rate
- Boosting cashback rate
- Per-order and monthly caps
- Minimum cash spend
- Margin floor
- Start/end dates
- Reward cost, repeat-purchase rate, and net margin reporting

## Integrity rules

- One reward per order item, protected by a unique reference.
- Use a database transaction when creating the wallet credit.
- Save the policy and cost snapshot used for each reward.
- Recheck fulfilment status immediately before awarding.
- Record every award, suppression, adjustment, and reversal in the audit trail.
- Exclude admins, test orders, suspicious self-referrals, and locally blocked production data paths.

## Rollout

1. Analyse the last 30–60 days of net margins by service.
2. Run a dry report showing what cashback would have cost without crediting anyone.
3. Choose conservative rates and caps.
4. Launch to a small percentage of eligible customers.
5. Compare repeat purchase rate, reward cost, refunds, and contribution margin.
6. Expand only if the extra retained margin is greater than the reward cost.

## Options intentionally deferred

- Points and levels: harder to explain and maintain.
- Daily streaks: encourage low-quality behaviour and notification fatigue.
- Buy-five-get-one-free: awkward when supplier costs and country availability vary.
- Public leaderboards: unnecessary privacy and abuse risk.
- Random rewards: less trustworthy than a clear guaranteed rule.
