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
  <label for="themeSelect">Tema</label>
  <select id="themeSelect" on:change={onChange} bind:value={value}>
    <option value="system">Sistem</option>
    <option value="light">Svetla</option>
    <option value="dark">Tamna</option>
  </select>
</div>

<style>
  .themeToggle { display: inline-flex; align-items: center; gap: 6px; }
  .themeToggle label { font-size: 12px; color: var(--muted); }
  .themeToggle select { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
</style>
