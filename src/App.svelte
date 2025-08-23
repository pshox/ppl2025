<script lang="ts">
  import { onMount } from 'svelte';
  import Quiz from './components/Quiz.svelte';
  import SubjectSelect from './components/SubjectSelect.svelte';

  let route = '#/';
  function parseRoute() {
    route = location.hash || '#/';
  }

  onMount(() => {
    parseRoute();
    window.addEventListener('hashchange', parseRoute);
  });
</script>

{#if route.startsWith('#/quiz')}
  <Quiz />
{:else}
  <SubjectSelect />
{/if}
