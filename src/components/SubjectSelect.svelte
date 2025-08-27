<script lang="ts">
  import { onMount } from 'svelte';
  import { subjects } from '../subjects';
  import ThemeToggle from './ThemeToggle.svelte';

  function goTo(id: string) {
    const url = new URL(location.href);
    url.hash = `#/quiz?s=${encodeURIComponent(id)}`;
    location.href = url.toString();
  }

  type BankMeta = { verified?: boolean };
  let verifiedMap: Record<string, boolean> = {};

  async function loadVerified() {
    const cacheBust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
    await Promise.all(subjects.map(async (s) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/${s.id}.json${cacheBust}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as BankMeta;
        verifiedMap = { ...verifiedMap, [s.id]: !!data.verified };
      } catch {
        verifiedMap = { ...verifiedMap, [s.id]: false };
      }
    }));
  }

  onMount(loadVerified);
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
          <div class="titleRow">
            <div class="title">{s.title}</div>
            {#if verifiedMap[s.id]}
              <span class="badge" aria-label="Verified questions" title="Verified questions">Verified questions</span>
            {/if}
          </div>
          <div class="id">{s.id}</div>
        </button>
      {/each}
    </div>
  </main>
</div>

<style>
  .page { min-height: 100dvh; display: flex; flex-direction: column; }
  header { padding: 12px 16px; position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  h1 { margin: 0; font-size: 18px; }
  main { padding: 12px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .tile { text-align: left; padding: 14px; border-radius: 0; border: none; background: var(--btn-bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); }
  .title { font-weight: 600; }
  .id { margin-top: 4px; color: var(--muted); font-size: 12px; }
  @media (min-width: 640px) { .page { max-width: 640px; margin: 0 auto; } }
  .titleRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .badge { display: inline-block; padding: 2px 6px; font-size: 11px; background: #ecfdf5; color: #065f46; font-weight: 600; }
</style>
