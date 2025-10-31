<script lang="ts">
  import { themeMode, setTheme } from '../theme';
  let value: 'system' | 'light' | 'dark';
  $: themeMode.subscribe((m) => (value = m));
  function onChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    setTheme(select.value as typeof value);
  }
</script>

<div class="themeToggle">
  <button class="btn" aria-label="Light" on:click={() => setTheme('light')} data-active={value === 'light'}>☀️</button>
  <button class="btn" aria-label="Dark" on:click={() => setTheme('dark')} data-active={value === 'dark'}>🌙</button>
  <button class="btn" aria-label="System" on:click={() => setTheme('system')} data-active={value === 'system'}>🖥️</button>
</div>

<style>
  .themeToggle { display: inline-flex; align-items: center; gap: 6px; }
  .btn { padding: 6px 8px; border: none; border-radius: 0; background: var(--btn-bg); color: var(--text); }
  .btn[data-active="true"] { background: var(--accent); color: var(--accent-contrast); }
</style>
