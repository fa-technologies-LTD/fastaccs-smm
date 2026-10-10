<div class="upgrade-art" aria-hidden="true">
	<div class="upgrade-orbit"></div>
	<div class="upgrade-core">
		<svg width="42" height="42" viewBox="0 0 24 24" fill="none">
			<path
				d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</div>
	<span class="upgrade-spark spark-one"></span>
	<span class="upgrade-spark spark-two"></span>
</div>

<style>
	.upgrade-art {
		position: relative;
		width: 144px;
		height: 144px;
		margin: 2rem auto 3rem;
		color: var(--primary);
	}
	.upgrade-core {
		position: absolute;
		inset: 30px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(16, 185, 129, 0.25);
		border-radius: 26px;
		background: rgba(16, 185, 129, 0.07);
		animation: breathe 3.5s ease-in-out infinite;
	}
	.upgrade-orbit {
		position: absolute;
		inset: 0;
		border: 1px dashed rgba(16, 185, 129, 0.22);
		border-radius: 50%;
		animation: orbit 24s linear infinite;
	}
	.upgrade-spark {
		position: absolute;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--primary);
		animation: breathe 3.5s ease-in-out infinite;
	}
	.spark-one {
		top: 9px;
		left: 32px;
	}
	.spark-two {
		right: 13px;
		bottom: 22px;
		width: 5px;
		height: 5px;
		animation-delay: 1.5s;
	}
	@keyframes orbit {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes breathe {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.65;
		}
		50% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.upgrade-core,
		.upgrade-orbit,
		.upgrade-spark {
			animation: none;
		}
	}
</style>
