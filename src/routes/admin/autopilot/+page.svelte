<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { formatPrice } from '$lib/helpers/utils';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();

	const s = $derived(data.settings);
	const ownerOnly = $derived(!data.isOwner);

	const statusLabel: Record<string, string> = {
		discovered: 'Found',
		contacted: 'Messaged',
		negotiating: 'Countered',
		agreed: 'Price OK, waiting for bank details',
		awaiting_payment: 'Waiting for your approval',
		paid: 'Paid, waiting for the post',
		posted: 'Live, measuring views',
		done: 'Finished',
		declined: 'Too expensive',
		refused: 'They said no',
		no_reply: 'No reply',
		skipped: 'Skipped'
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

	const card = 'background: var(--bg-elev-1); border: 1px solid var(--border);';
	const inner = 'border: 1px solid var(--border); background: var(--bg);';
	const input =
		'background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);';
	const secondary = 'border: 1px solid var(--border-2); color: var(--text);';
	const primary = (disabled: boolean) =>
		`background: var(--btn-primary-gradient); color: #04140C; opacity: ${disabled ? 0.5 : 1};`;

	const bindLink = $derived((form && 'bindLink' in form && form.bindLink) || data.bindLink);
	const bindCode = $derived(bindLink ? (bindLink.split('start=')[1] ?? '') : '');

	const readiness = $derived([
		{ ok: data.ready.bot, label: 'Bot token (TELEGRAM_BOT_TOKEN)' },
		{
			ok: data.ready.telegramAccount,
			label: 'Telegram account (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION)'
		},
		{ ok: data.ready.ownerConnected, label: 'Your chat connected to the bot' },
		{ ok: data.ready.claude, label: 'Claude for unclear replies (optional: ANTHROPIC_API_KEY)' }
	]);
</script>

<svelte:head><title>Telegram autopilot · Admin</title></svelte:head>

<div class="space-y-6">
	<header>
		<h1 class="text-2xl font-bold" style="color: var(--text); font-family: var(--font-head);">
			Telegram autopilot
		</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Through the day it finds Nigerian Telegram channels in your niches and messages their admins.
			It answers their replies within about 1–3 minutes and agrees a price inside your limits. It
			never pays: each payment comes to your bot as a one-tap card with the deal and what to expect,
			and nothing is paid unless you approve it.
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
		<div
			class="rounded-lg p-3 text-sm"
			style="border: 1px solid var(--primary); color: var(--text);"
		>
			<p>{form.message}</p>
		</div>
	{/if}

	{#if bindLink}
		<div
			class="rounded-lg p-4 text-sm"
			style="border: 1px solid var(--primary); color: var(--text);"
		>
			<p class="font-semibold">Connect your chat to the bot</p>
			<ol class="mt-2 list-decimal space-y-1 pl-5">
				<li>
					On your phone, open
					<a href={bindLink} target="_blank" rel="noreferrer" class="font-semibold underline"
						>{bindLink}</a
					>
					and press <strong>Start</strong>.
				</li>
				<li>The bot replies “✅ Connected”. Then refresh this page.</li>
				<li>
					No reply? In the bot chat, send exactly:
					<code class="rounded px-1" style="background: var(--bg-elev-2);">/start {bindCode}</code>
				</li>
			</ol>
			<p class="mt-2 text-xs" style="color: var(--text-muted);">
				This link stays the same until it's used, so pressing Connect bot again is safe.
			</p>
		</div>
	{/if}

	<!-- ============================== Status ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold" style="color: var(--text);">Status</h2>
				<p class="text-xs" style="color: var(--text-muted);">
					Last check: {when(data.state.lastRunAt)} · last full run: {when(
						data.state.lastFullRunAt
					)}{data.state.pausedUntil && new Date(data.state.pausedUntil) > new Date()
						? ` · Telegram asked us to slow down, resuming ${when(data.state.pausedUntil)}`
						: ''}
				</p>
				<p class="mt-1 text-xs" style="color: var(--text-muted);">
					{data.search.line}{data.search.queued ? ` · ${data.search.queued} more lined up` : ''}
				</p>
				{#if data.state.lastError}
					<p class="mt-1 text-xs" style="color: var(--danger, #e5484d);">
						Last problem: {data.state.lastError}
					</p>
				{/if}
			</div>
			<span
				class="rounded-full px-3 py-1 text-xs font-semibold"
				style="background: var(--bg-elev-2); color: {s.enabled
					? 'var(--primary)'
					: 'var(--text-muted)'};"
			>
				{s.enabled ? 'ON' : 'OFF'}{s.testMode ? ' · test mode' : ''}
			</span>
		</div>

		<div class="mt-4 grid gap-3 sm:grid-cols-3">
			<div class="rounded-lg p-4 text-sm" style={inner}>
				<p style="color: var(--text-muted);">Paid so far</p>
				<p class="text-lg font-semibold" style="color: var(--text);">
					{formatPrice(data.money.spent)}
				</p>
			</div>
			<div class="rounded-lg p-4 text-sm" style={inner}>
				<p style="color: var(--text-muted);">Agreed or paid (counts against the budget)</p>
				<p class="text-lg font-semibold" style="color: var(--text);">
					{formatPrice(data.money.committed)}
				</p>
			</div>
			<div class="rounded-lg p-4 text-sm" style={inner}>
				<p style="color: var(--text-muted);">Budget</p>
				<p class="text-lg font-semibold" style="color: var(--text);">
					{formatPrice(data.money.budget)}
				</p>
			</div>
		</div>

		<div class="mt-4 rounded-lg p-4 text-sm" style={inner}>
			<p class="font-semibold" style="color: var(--text);">Set-up checklist</p>
			<ul class="mt-2 space-y-1 text-xs" style="color: var(--text);">
				{#each readiness as item (item.label)}
					<li>{item.ok ? '✅' : '⬜'} {item.label}</li>
				{/each}
				{#if data.webhook}
					{#if !data.webhook.pointsHere}
						<li>⬜ Telegram is not sending the bot's messages here yet: press Connect bot</li>
					{:else if data.webhook.recentError}
						<li style="color: var(--danger, #e5484d);">
							⚠ Telegram can't reach the site: {data.webhook.lastError} ({when(
								data.webhook.lastErrorAt
							)})
						</li>
					{:else}
						<li>✅ Telegram can reach the site</li>
					{/if}
				{/if}
			</ul>
			<p class="mt-2 text-xs" style="color: var(--text-muted);">
				Secrets go in Vercel → Project → Settings → Environment Variables. They are never shown
				here.
			</p>
		</div>

		<div class="mt-4 flex flex-wrap gap-3">
			<form method="POST" action="?/connectBot">
				<button
					type="submit"
					disabled={ownerOnly || !data.ready.bot}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={secondary}
				>
					{data.ready.ownerConnected ? 'Reconnect bot' : 'Connect bot'}
				</button>
			</form>
			<form method="POST" action="?/toggle">
				<input type="hidden" name="field" value="testMode" />
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={secondary}
				>
					{s.testMode ? 'Leave test mode (message real admins)' : 'Back to test mode'}
				</button>
			</form>
			<form method="POST" action="?/toggle">
				<input type="hidden" name="field" value="enabled" />
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={s.enabled ? secondary : primary(ownerOnly)}
				>
					{s.enabled ? 'Switch off' : 'Switch on'}
				</button>
			</form>
		</div>
		{#if s.testMode}
			<p class="mt-2 text-xs" style="color: var(--text-muted);">
				Test mode: it still searches and reads channels, but only messages the test contacts below
				(for example your own Telegram username, posing as a channel admin).
			</p>
		{/if}
	</section>

	<!-- ============================== Rules ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">Your limits</h2>
		<p class="text-xs" style="color: var(--text-muted);">
			It only says a price is “within budget” when it fits all of these. Above that it counters once
			(up to 1.5× the limit) or politely declines.
		</p>
		<form method="POST" action="?/saveRules" class="mt-4 grid gap-3 sm:grid-cols-2">
			<label class="text-sm" style="color: var(--text-muted);">
				Total budget (₦)
				<input
					name="budgetNgn"
					type="number"
					min="0"
					value={s.budgetNgn}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Most for one post (₦)
				<input
					name="maxPerPostNgn"
					type="number"
					min="500"
					value={s.maxPerPostNgn}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Most per 1,000 real views (₦)
				<input
					name="maxPer1kViewsNgn"
					type="number"
					min="100"
					value={s.maxPer1kViewsNgn}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Fewest views per post to consider a channel
				<input
					name="minAvgViews"
					type="number"
					min="50"
					value={s.minAvgViews}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				New admins to message per day (max 15)
				<input
					name="dailyNewContacts"
					type="number"
					min="0"
					max="15"
					value={s.dailyNewContacts}
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Reader discount code: % off, and days it lasts
				<span class="mt-1 flex gap-2">
					<input
						name="codePercent"
						type="number"
						min="0"
						max="30"
						value={s.codePercent}
						disabled={ownerOnly}
						class="w-full rounded-lg px-3 py-2"
						style={input}
					/>
					<input
						name="codeDays"
						type="number"
						min="1"
						max="60"
						value={s.codeDays}
						disabled={ownerOnly}
						class="w-full rounded-lg px-3 py-2"
						style={input}
					/>
				</span>
			</label>
			<label class="text-sm sm:col-span-2" style="color: var(--text-muted);">
				Search words (one per line)
				<textarea
					name="keywords"
					rows="5"
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}>{s.keywords.join('\n')}</textarea
				>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Test contacts (Telegram usernames, one per line)
				<textarea
					name="testContacts"
					rows="3"
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}>{s.testContacts.join('\n')}</textarea
				>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Claude model for unclear replies
				<select
					name="llmModel"
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				>
					{#each data.models as model (model)}
						<option value={model} selected={model === s.llmModel}>
							{model === 'claude-opus-5-5'
								? 'Claude Opus 5.5 (best reading)'
								: 'Claude Haiku 5.5 (cheapest)'}
						</option>
					{/each}
				</select>
			</label>
			<div class="sm:col-span-2">
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={primary(ownerOnly)}>Save limits</button
				>
			</div>
		</form>
	</section>

	<!-- ============================== Channels to try ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">Channels to try</h2>
		<p class="text-xs" style="color: var(--text-muted);">
			Paste channel links or @usernames, one per line. The autopilot finds who sells ads from each
			channel's description, runs the checks (as warnings, since you chose them), follows group
			chats to their channel, and looks at similar channels next. Your bot gets a summary.
		</p>
		{#if data.picksQueued.length}
			<p class="mt-2 text-xs" style="color: var(--text);">
				Waiting to be checked: {data.picksQueued.map((u) => `@${u}`).join(', ')}
			</p>
		{/if}
		<form method="POST" action="?/tryChannels" class="mt-4 space-y-3">
			<textarea
				name="channels"
				rows="5"
				placeholder="https://t.me/somechannel  @anotherchannel"
				disabled={ownerOnly}
				class="w-full rounded-lg px-3 py-2 text-sm"
				style={input}
			></textarea>
			<button
				type="submit"
				disabled={ownerOnly}
				class="rounded-lg px-4 py-2 text-sm font-semibold"
				style={primary(ownerOnly)}>Try these channels</button
			>
		</form>
	</section>

	<!-- ============================== Add a channel ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">Add a channel yourself</h2>
		<p class="text-xs" style="color: var(--text-muted);">
			Know a good channel? Add it and the autopilot messages its admin on the next run (test mode
			still applies).
		</p>
		<form method="POST" action="?/addChannel" class="mt-4 grid gap-3 sm:grid-cols-2">
			<label class="text-sm" style="color: var(--text-muted);">
				Channel @username
				<input
					name="username"
					required
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Admin @username to message
				<input
					name="contact"
					required
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Channel name (optional)
				<input
					name="title"
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<label class="text-sm" style="color: var(--text-muted);">
				Most you'd pay for one post (₦)
				<input
					name="maxPriceNgn"
					type="number"
					min="500"
					max={s.maxPerPostNgn}
					value="1000"
					disabled={ownerOnly}
					class="mt-1 w-full rounded-lg px-3 py-2"
					style={input}
				/>
			</label>
			<div class="sm:col-span-2">
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={secondary}>Add channel</button
				>
			</div>
		</form>
	</section>

	<!-- ============================== Pipeline ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">
			Channels ({data.channels.length})
		</h2>
		{#if data.channels.length === 0}
			<p class="mt-2 text-sm" style="color: var(--text-muted);">
				Nothing yet. Channels appear after the first daily search.
			</p>
		{:else}
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-xs" style="color: var(--text);">
					<thead style="color: var(--text-muted);">
						<tr class="text-left">
							<th class="py-1 pr-3">Channel</th>
							<th class="py-1 pr-3">Status</th>
							<th class="py-1 pr-3">Members</th>
							<th class="py-1 pr-3">Views/post</th>
							<th class="py-1 pr-3">Limit</th>
							<th class="py-1 pr-3">Quoted</th>
							<th class="py-1 pr-3">Agreed</th>
							<th class="py-1 pr-3">Code</th>
							<th class="py-1 pr-3">Views (48h)</th>
							<th class="py-1 pr-3">Checks</th>
							<th class="py-1 pr-3">Latest</th>
							<th class="py-1"></th>
						</tr>
					</thead>
					<tbody>
						{#each data.channels as row (row.username)}
							<tr style="border-top: 1px solid var(--border);">
								<td class="py-1 pr-3">
									<a
										href={`https://t.me/${row.username}`}
										target="_blank"
										rel="noreferrer"
										class="underline">{row.title}</a
									>
								</td>
								<td class="py-1 pr-3">
									{statusLabel[row.status] ?? row.status}{row.waitingOwner
										? ' · needs your reply'
										: ''}
								</td>
								<td class="py-1 pr-3">{row.members.toLocaleString('en-NG')}</td>
								<td class="py-1 pr-3">{row.avgViews.toLocaleString('en-NG')}</td>
								<td class="py-1 pr-3">{row.maxPriceNgn ? formatPrice(row.maxPriceNgn) : '—'}</td>
								<td class="py-1 pr-3">{row.quotedNgn ? formatPrice(row.quotedNgn) : '—'}</td>
								<td class="py-1 pr-3">{row.agreedNgn ? formatPrice(row.agreedNgn) : '—'}</td>
								<td class="py-1 pr-3">{row.code ?? '—'}</td>
								<td class="py-1 pr-3">{row.views48h?.toLocaleString('en-NG') ?? '—'}</td>
								<td class="py-1 pr-3">
									{#if !row.checked}
										—
									{:else if row.warnings.length === 0}
										✅
									{:else}
										<details>
											<summary class="cursor-pointer">⚠ {row.warnings.length}</summary>
											<ul class="mt-1 list-disc pl-4" style="color: var(--text-muted);">
												{#each row.warnings as warning (warning)}<li>{warning}</li>{/each}
											</ul>
										</details>
									{/if}
								</td>
								<td class="py-1 pr-3" style="color: var(--text-muted);">{row.lastNote}</td>
								<td class="py-1">
									{#if !ownerOnly && !['paid', 'posted', 'done', 'skipped'].includes(row.status)}
										<form method="POST" action="?/skip">
											<input type="hidden" name="username" value={row.username} />
											<button type="submit" class="underline">Skip</button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- ============================== Activity ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">Recent activity</h2>
		{#if data.actions.length === 0}
			<p class="mt-2 text-sm" style="color: var(--text-muted);">No activity yet.</p>
		{:else}
			<ul class="mt-2 space-y-1 text-xs" style="color: var(--text);">
				{#each data.actions as item, i (i)}
					<li>
						<span style="color: var(--text-muted);">{when(item.at)}</span> · {item.action.replace(
							/_/g,
							' '
						)}{item.channel ? ` · @${item.channel}` : ''}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
