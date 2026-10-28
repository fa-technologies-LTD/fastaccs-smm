<script lang="ts">
	/**
	 * One person, one place: an affiliate is also a customer, so their customer page and affiliate
	 * page read as two tabs of the same profile.
	 */
	let {
		userId,
		active,
		showAffiliate = true
	}: { userId: string; active: 'customer' | 'affiliate'; showAffiliate?: boolean } = $props();
</script>

{#if showAffiliate}
	<nav aria-label="This person" class="person-tabs">
		<a href={`/admin/users/${userId}`} aria-current={active === 'customer' ? 'page' : undefined}
			>As a customer</a
		>
		<a
			href={`/admin/affiliates/${userId}`}
			aria-current={active === 'affiliate' ? 'page' : undefined}>As an affiliate</a
		>
	</nav>
{/if}

<style>
	.person-tabs {
		display: inline-flex;
		gap: 4px;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
	}
	a {
		padding: 4px 10px;
		border-radius: 7px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	a[aria-current='page'] {
		background: var(--surface);
		color: var(--text);
	}
</style>
