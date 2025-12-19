<script>
	import { MediaQuery } from 'svelte/reactivity';

	const large = new MediaQuery('min-width: 800px');
</script>


<div>
  <h2>Life in the city</h2>
  <h1>{large.current ? 'large screen' : 'small screen'}</h1>
</div>