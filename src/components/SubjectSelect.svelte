<script lang="ts">
  import { subjects } from '../subjects';
  import ThemeToggle from './ThemeToggle.svelte';

  function goTo(id: string) {
    const url = new URL(location.href);
    url.hash = `#/quiz?s=${encodeURIComponent(id)}`;
    location.href = url.toString();
  }
</script>

<div class="page">
  <header>
    <h1>Izaberi predmet</h1>
    <ThemeToggle />
  </header>
  <main>
    <div class="grid">
      {#each subjects as s}
        <button class="tile" on:click={() => goTo(s.id)}>
          <div class="title">{s.title}</div>
          <div class="id">{s.id}</div>
        </button>
      {/each}
    </div>
  </main>
</div>

<style>
  .page { min-height: 100dvh; display: flex; flex-direction: column; }
  header { padding: 12px 16px; position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); }
  h1 { margin: 0; font-size: 18px; }
  main { padding: 12px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .tile { text-align: left; padding: 14px; border-radius: 12px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
  .title { font-weight: 600; }
  .id { margin-top: 4px; color: var(--muted); font-size: 12px; }
  @media (min-width: 640px) { .page { max-width: 640px; margin: 0 auto; } }
</style>
