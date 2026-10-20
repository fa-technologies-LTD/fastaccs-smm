<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { formatPrice } from '$lib/helpers/utils';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();

	const rw = $derived(data.referWin);
	const bs = $derived(data.bigSpender);
	const ownerOnly = $derived(!data.isOwner);

	const statusLabel: Record<string, string> = {
		issue: 'Due now',
		waiting: 'Waiting (24h after completion)',
		dropped_limit: 'Dropped (monthly limit reached)',
		held_identity: 'Held: identity match',
		super_excluded: 'Super excluded',
		issued: 'Issued',
		not_yet: 'Not yet'
	};

	const when = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleString('en-GB', {
					day: 'numeric',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit',
					timeZone: 'Africa/Lagos'
				}) + ' WAT'
			: '—';

	let rwCapInput = $state<number | null>(null);
	let bsCapInput = $state<number | null>(null);
	const rwCap = $derived(rwCapInput ?? rw.settings.capPercent);
	const bsCap = $derived(bsCapInput ?? bs.settings.capPercent);

	const card = 'background: var(--bg-elev-1); border: 1px solid var(--border);';
	const inner = 'border: 1px solid var(--border); background: var(--bg);';
	const input =
		'background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);';
</script>

<svelte:head><title>Campaigns · Admin</title></svelte:head>

<div class="space-y-6">
	<header>
		<h1 class="text-2xl font-bold" style="color: var(--text); font-family: var(--font-head);">
			Campaigns
		</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Refer & Win and BIGSPENDER pay promo store credit: spendable on anything, never withdrawable
			or transferable, and never counted as cash for any commission. Both are off until you switch
			them on.
			{#if ownerOnly}<strong>Only the owner can change these settings.</strong>{/if}
		</p>
	</header>

	{#if form?.error}
		<p
			class="rounded-lg p-3 text-sm"
			style="border: 1px solid var(--danger, #e5484d); color: var(--text);"
		>
			{form.error}
		</p>
	{:else if form?.message}
		<p class="rounded-lg p-3 text-sm" style="border: 1px solid var(--primary); color: var(--text);">
			{form.message}
		</p>
	{/if}

	<!-- ============================== Refer & Win ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold" style="color: var(--text);">Refer & Win</h2>
				<p class="text-xs" style="color: var(--text-muted);">
					{formatPrice(rw.settings.rewardNgn)} store credit to the referrer when a friend they referred
					reaches {formatPrice(rw.settings.qualifyingCashNgn)} cash spend (net of refunds), once per
					friend.
				</p>
			</div>
			<span
				class="rounded-full px-3 py-1 text-xs font-semibold"
				style="background: var(--bg-elev-2); color: {rw.live
					? 'var(--primary)'
					: 'var(--text-muted)'};"
			>
				{rw.live ? 'ON' : 'OFF'}{rw.startsAtWat
					? ` · started ${rw.startsAtWat.replace('T', ' ')}`
					: ''}
			</span>
		</div>

		<!-- Margin check: advice only, never blocks -->
		<div class="mt-4 rounded-lg p-4 text-sm" style={inner}>
			<p class="font-semibold" style="color: var(--text);">Margin check</p>
			{#if rw.margin.thinnestTier}
				<p class="mt-1" style="color: var(--text-muted);">
					Thinnest margin: {rw.margin.thinnestTier} at {rw.margin.thinnestMarginPercent}%. Profit on
					a
					{formatPrice(rw.settings.qualifyingCashNgn)} order there: {formatPrice(
						rw.margin.profitOnQualifyingOrder ?? 0
					)}; half is {formatPrice(rw.margin.halfProfit ?? 0)}.
				</p>
			{/if}
			{#if rw.warnings.length}
				<ul class="mt-2 space-y-1 text-xs" style="color: var(--text);">
					{#each rw.warnings as warning (warning)}
						<li class="rounded-md px-2 py-1" style="background: rgba(245, 166, 35, 0.12);">
							⚠ {warning}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-1 text-xs" style="color: var(--text-muted);">
					The reward is within half the profit on every costed tier.
				</p>
			{/if}
			{#if rw.margin.missing.length}
				<details class="mt-2">
					<summary class="cursor-pointer text-xs" style="color: var(--text-muted);">
						Tiers missing a cost ({rw.margin.missing.length})
					</summary>
					<ul class="mt-1 list-disc pl-5 text-xs" style="color: var(--text-muted);">
						{#each rw.margin.missing as name (name)}<li>{name}</li>{/each}
					</ul>
				</details>
			{/if}
		</div>

		<!-- Dry run -->
		<div class="mt-4 rounded-lg p-4 text-sm" style={inner}>
			<p class="font-semibold" style="color: var(--text);">Dry run — who, how much, when</p>
			{#if !rw.settings.startsAt}
				<p class="mt-1" style="color: var(--text-muted);">
					Launch-forward: if switched on now, only friends referred from that moment count, so
					nobody is paid on day one.
				</p>
			{:else}
				<p class="mt-1" style="color: var(--text-muted);">
					Due now: {rw.live_dry_run.summary.issueNow.count} ({formatPrice(
						rw.live_dry_run.summary.issueNow.amount
					)}) · waiting: {rw.live_dry_run.summary.waiting.count} · dropped (limit): {rw.live_dry_run
						.summary.dropped.count} · held: {rw.live_dry_run.summary.heldIdentity.count} · issued so
					far: {rw.live_dry_run.summary.issued.count}
					({formatPrice(rw.live_dry_run.summary.issued.amount)})
				</p>
				{#if rw.live_dry_run.rows.length}
					<div class="mt-2 overflow-x-auto">
						<table class="w-full text-xs" style="color: var(--text);">
							<thead style="color: var(--text-muted);">
								<tr class="text-left">
									<th class="py-1 pr-3">Referrer</th>
									<th class="py-1 pr-3">Friend</th>
									<th class="py-1 pr-3">Friend cash</th>
									<th class="py-1 pr-3">Status</th>
									<th class="py-1 pr-3">When</th>
									<th class="py-1"></th>
								</tr>
							</thead>
							<tbody>
								{#each rw.live_dry_run.rows as row (row.friendUserId)}
									<tr style="border-top: 1px solid var(--border);">
										<td class="py-1 pr-3"
											>{row.referrerEmail ?? '—'}{row.isSuperReferrer ? ' (Super)' : ''}</td
										>
										<td class="py-1 pr-3">{row.friendEmail ?? '—'}</td>
										<td class="py-1 pr-3">{formatPrice(row.settledCash)}</td>
										<td class="py-1 pr-3">
											{statusLabel[row.status]}{row.signals.length
												? ` (${row.signals.join(', ')})`
												: ''}
										</td>
										<td class="py-1 pr-3">{when(row.when)}</td>
										<td class="py-1">
											{#if row.status === 'held_identity' && !ownerOnly}
												<form method="POST" action="?/releaseReferWin">
													<input type="hidden" name="friendUserId" value={row.friendUserId} />
													<button type="submit" class="underline">Issue anyway</button>
												</form>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
			<p class="mt-3 text-xs" style="color: var(--text-muted);">
				For scale only (never paid — no backfill): if it counted friends referred before launch,
				{rw.illustrative.summary.issueNow.count} would be due now ({formatPrice(
					rw.illustrative.summary.issueNow.amount
				)}),
				{rw.illustrative.summary.waiting.count} soon, {rw.illustrative.summary.dropped.count} dropped
				by the monthly limit, {rw.illustrative.summary.heldIdentity.count} held for identity, and
				{rw.illustrative.summary.superExcluded.count} excluded as Super referrals ({formatPrice(
					rw.illustrative.summary.superExcluded.amount
				)}). Including Super:
				{rw.illustrative.withSuper.issueNow.count} due ({formatPrice(
					rw.illustrative.withSuper.issueNow.amount
				)}).
			</p>
		</div>

		<!-- Switch -->
		<form method="POST" action="?/switchReferWin" class="mt-4 rounded-lg p-4 text-sm" style={inner}>
			{#if rw.settings.enabled}
				<input type="hidden" name="to" value="off" />
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style="border: 1px solid var(--border-2); color: var(--text);"
					>Switch Refer & Win off</button
				>
			{:else}
				<input type="hidden" name="to" value="on" />
				<label class="mt-2 flex items-center gap-2" style="color: var(--text);">
					<input type="checkbox" name="reviewedDryRun" disabled={ownerOnly} />
					I reviewed the dry run above
				</label>
				<label class="mt-2 flex items-center gap-2" style="color: var(--text);">
					<input type="checkbox" name="announce" checked disabled={ownerOnly} />
					Also show it in the site announcement bar
				</label>
				{#if data.currentBanner}
					<p class="mt-1 text-xs" style="color: var(--text-muted);">
						This replaces the bar now showing: “{data.currentBanner}”
					</p>
				{/if}
				<button
					type="submit"
					disabled={ownerOnly}
					class="mt-2 rounded-lg px-4 py-2 text-sm font-semibold"
					style="background: var(--btn-primary-gradient); color: #04140C; opacity: {ownerOnly
						? 0.5
						: 1};">Switch Refer & Win on</button
				>
			{/if}
		</form>

		<!-- Settings -->
		<form method="POST" action="?/saveReferWin" class="mt-4 grid gap-3 sm:grid-cols-2">
			<label class="text-sm" style="color: var(--text-muted);">
				Reward (₦)
				<input
					name="rewardNgn"
					type="number"
					min="1"
					value={rw.settings.rewardNgn}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Friend's qualifying cash spend (₦)
				<input
					name="qualifyingCashNgn"
					type="number"
					min="1000"
					value={rw.settings.qualifyingCashNgn}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Credit expires after (days)
				<input
					name="expiryDays"
					type="number"
					min="1"
					max="365"
					value={rw.settings.expiryDays}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Rewards per referrer per month
				<input
					name="monthlyLimit"
					type="number"
					min="1"
					max="50"
					value={rw.settings.monthlyLimit}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Wait after the qualifying order completes (hours)
				<input
					name="waitHours"
					type="number"
					min="0"
					max="720"
					value={rw.settings.waitHours}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Ends (WAT, optional)
				<input
					name="endsAt"
					type="datetime-local"
					value={rw.endsAtWat}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Most of an order this credit may pay (%)
				<input
					name="capPercent"
					type="number"
					min="1"
					max="100"
					bind:value={rwCapInput}
					placeholder={String(rw.settings.capPercent)}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<div class="space-y-2 text-sm" style="color: var(--text);">
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						name="includeSuper"
						checked={rw.settings.includeSuper}
						disabled={ownerOnly}
					/>
					Include Super affiliates' referrals
				</label>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						name="allowAboveHalf"
						checked={rw.settings.allowAboveHalf}
						disabled={ownerOnly}
					/>
					Allow a cap above 50%
				</label>
				{#if rwCap > 50}
					<p class="text-xs" style="color: var(--text-muted);">
						Warning: above 50%, a customer can pay most of an order with free credit. Our cash on
						that order may not cover the goods.
					</p>
				{/if}
			</div>
			<div class="sm:col-span-2">
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style="background: var(--btn-primary-gradient); color: #04140C;"
				>
					Save Refer & Win settings
				</button>
			</div>
		</form>
	</section>

	<!-- ============================== BIGSPENDER ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold" style="color: var(--text);">BIGSPENDER</h2>
				<p class="text-xs" style="color: var(--text-muted);">
					{formatPrice(bs.settings.rewardNgn)} store credit, once, the moment a customer's lifetime spend
					(all services, net of refunds) reaches {formatPrice(bs.settings.thresholdNgn)}. Automatic,
					no code.
				</p>
			</div>
			<span
				class="rounded-full px-3 py-1 text-xs font-semibold"
				style="background: var(--bg-elev-2); color: {bs.live
					? 'var(--primary)'
					: 'var(--text-muted)'};"
			>
				{bs.live ? 'ON' : 'OFF'}{bs.startsAtWat
					? ` · started ${bs.startsAtWat.replace('T', ' ')}`
					: ''}
			</span>
		</div>

		<div class="mt-4 rounded-lg p-4 text-sm" style={inner}>
			<p class="font-semibold" style="color: var(--text);">Dry run — who gets it, and when</p>
			<p class="mt-1" style="color: var(--text-muted);">
				One {formatPrice(bs.settings.rewardNgn)} per customer, nobody paid on switch-on. While BIGSPENDER
				is on, the ₦70,000 gift stops for anyone who hasn't had it. Customers who never had that gift
				get BIGSPENDER at {formatPrice(bs.settings.thresholdNgn)}. The {bs.targets.length} customers
				below already had the gift or are already over {formatPrice(bs.settings.thresholdNgn)}, so
				theirs comes at their next round mark.
			</p>
			{#if bs.targets.length}
				<div class="mt-2 overflow-x-auto">
					<table class="w-full text-xs" style="color: var(--text);">
						<thead style="color: var(--text-muted);">
							<tr class="text-left">
								<th class="py-1 pr-3">Customer</th>
								<th class="py-1 pr-3">Spend now</th>
								<th class="py-1 pr-3">Gets {formatPrice(bs.settings.rewardNgn)} at</th>
								<th class="py-1">Still to spend</th>
							</tr>
						</thead>
						<tbody>
							{#each bs.targets as row (row.userId)}
								<tr style="border-top: 1px solid var(--border);">
									<td class="py-1 pr-3">{row.label}</td>
									<td class="py-1 pr-3">{formatPrice(row.spendNow)}</td>
									<td class="py-1 pr-3">{formatPrice(row.targetNgn)}</td>
									<td class="py-1">{row.alreadyGranted ? 'Paid' : formatPrice(row.toGo)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<form
			method="POST"
			action="?/switchBigSpender"
			class="mt-4 rounded-lg p-4 text-sm"
			style={inner}
		>
			{#if bs.settings.enabled}
				<input type="hidden" name="to" value="off" />
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style="border: 1px solid var(--border-2); color: var(--text);"
				>
					Switch BIGSPENDER off
				</button>
			{:else}
				<input type="hidden" name="to" value="on" />
				<label class="flex items-center gap-2" style="color: var(--text);">
					<input type="checkbox" name="reviewedDryRun" disabled={ownerOnly} />
					I reviewed the dry run above
				</label>
				<label class="mt-2 flex items-center gap-2" style="color: var(--text);">
					<input type="checkbox" name="announce" checked disabled={ownerOnly} />
					Also show it in the site announcement bar
				</label>
				{#if data.currentBanner}
					<p class="mt-1 text-xs" style="color: var(--text-muted);">
						This replaces the bar now showing: “{data.currentBanner}”
					</p>
				{/if}
				<button
					type="submit"
					disabled={ownerOnly}
					class="mt-2 rounded-lg px-4 py-2 text-sm font-semibold"
					style="background: var(--btn-primary-gradient); color: #04140C;"
				>
					Switch BIGSPENDER on
				</button>
			{/if}
		</form>

		<form method="POST" action="?/saveBigSpender" class="mt-4 grid gap-3 sm:grid-cols-2">
			<label class="text-sm" style="color: var(--text-muted);">
				Reward (₦)
				<input
					name="rewardNgn"
					type="number"
					min="1"
					value={bs.settings.rewardNgn}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Lifetime spend threshold (₦)
				<input
					name="thresholdNgn"
					type="number"
					min="1000"
					value={bs.settings.thresholdNgn}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Credit expires after (days)
				<input
					name="expiryDays"
					type="number"
					min="1"
					max="365"
					value={bs.settings.expiryDays}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Ends (WAT, optional)
				<input
					name="endsAt"
					type="datetime-local"
					value={bs.endsAtWat}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Most of an order this credit may pay (%)
				<input
					name="capPercent"
					type="number"
					min="1"
					max="100"
					bind:value={bsCapInput}
					placeholder={String(bs.settings.capPercent)}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Reminder before expiry (days)
				<input
					name="reminderDaysBefore"
					type="number"
					min="1"
					value={bs.settings.reminderDaysBefore}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<div class="space-y-2 text-sm sm:col-span-2" style="color: var(--text);">
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						name="remindersEnabled"
						checked={bs.settings.remindersEnabled}
						disabled={ownerOnly}
					/>
					Send an expiry reminder email before the credit runs out
				</label>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						name="allowAboveHalf"
						checked={bs.settings.allowAboveHalf}
						disabled={ownerOnly}
					/>
					Allow a cap above 50%
				</label>
				{#if bsCap > 50}
					<p class="text-xs" style="color: var(--text-muted);">
						Warning: above 50%, a customer can pay most of an order with free credit.
					</p>
				{/if}
			</div>
			<div class="sm:col-span-2">
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style="background: var(--btn-primary-gradient); color: #04140C;"
				>
					Save BIGSPENDER settings
				</button>
			</div>
		</form>
	</section>

	<!-- ============================== Report ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<form method="GET" class="flex flex-wrap items-end justify-between gap-3">
			<h2 class="text-lg font-semibold" style="color: var(--text);">Monthly report</h2>
			<label class="text-sm" style="color: var(--text-muted);">
				Month
				<input
					type="month"
					name="month"
					value={data.month}
					class="ml-2 rounded-lg px-3 py-1.5"
					style={input}
					onchange={(e) => (e.currentTarget as HTMLInputElement).form?.submit()}
				/>
			</label>
		</form>
		<div class="mt-4 grid gap-4 md:grid-cols-2">
			{#each [{ name: 'Refer & Win', r: rw.report }, { name: 'BIGSPENDER', r: bs.report }] as item (item.name)}
				<div class="rounded-lg p-4 text-sm" style={inner}>
					<p class="font-semibold" style="color: var(--text);">{item.name}</p>
					<dl
						class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs"
						style="color: var(--text-muted);"
					>
						<dt>Issued</dt>
						<dd style="color: var(--text);">
							{item.r.issued.count} · {formatPrice(item.r.issued.amount)}
						</dd>
						<dt>Spent</dt>
						<dd style="color: var(--text);">
							{formatPrice(item.r.spent.amount)} on {item.r.spent.orders} orders
						</dd>
						<dt>Expired</dt>
						<dd style="color: var(--text);">{formatPrice(item.r.expired.amount)}</dd>
						<dt>Reversed after refunds</dt>
						<dd style="color: var(--text);">{formatPrice(item.r.reversed.amount)}</dd>
						<dt>Spent before a refund (kept)</dt>
						<dd style="color: var(--text);">
							{item.r.refundedAfterSpendNotClawedBack.count} · {formatPrice(
								item.r.refundedAfterSpendNotClawedBack.amount
							)}
						</dd>
						<dt>Returned to wallets by refunds</dt>
						<dd style="color: var(--text);">{formatPrice(item.r.returnedAfterRefund.amount)}</dd>
						<dt>Unspent now (what we owe)</dt>
						<dd style="color: var(--text);">{formatPrice(item.r.outstandingNow)}</dd>
						<dt>Cash on promo orders</dt>
						<dd style="color: var(--text);">{formatPrice(item.r.cashOnPromoOrders)}</dd>
						<dt>Estimated net after goods</dt>
						<dd style="color: var(--text);">
							{item.r.estimatedNetAfterGoods === null
								? `Needs costs (${item.r.ordersMissingCost} orders)`
								: formatPrice(item.r.estimatedNetAfterGoods)}
						</dd>
					</dl>
				</div>
			{/each}
		</div>
		<p class="mt-3 text-xs" style="color: var(--text-muted);">
			“Estimated net after goods” is the cash customers paid on orders that used this credit, minus
			our goods cost for those orders. The credit itself is already left out of the cash.
		</p>
	</section>
</div>
