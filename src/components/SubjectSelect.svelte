<script lang="ts">
  import { onMount } from 'svelte';
  import { subjects, type SubjectId } from '../subjects';
  import ThemeToggle from './ThemeToggle.svelte';
  import { getErrorsCount, getErrorsBySubject, clearAllErrors } from '../errors';

  const STORAGE_KEY_PASSED = 'ppl.passed.v1';

  function loadPassedSubjects(): Set<SubjectId> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PASSED);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((id): id is SubjectId => typeof id === 'string'));
    } catch {
      return new Set();
    }
  }

  function savePassedSubjects(passed: Set<SubjectId>) {
    try {
      localStorage.setItem(STORAGE_KEY_PASSED, JSON.stringify(Array.from(passed)));
    } catch {
      // ignore quota errors
    }
  }

  let passedSubjects: Set<SubjectId> = loadPassedSubjects();

  function togglePassed(subjectId: SubjectId, event: Event) {
    event.stopPropagation();
    if (passedSubjects.has(subjectId)) {
      passedSubjects.delete(subjectId);
    } else {
      passedSubjects.add(subjectId);
    }
    passedSubjects = passedSubjects; // trigger reactivity
    savePassedSubjects(passedSubjects);
  }

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

  let errorsCount = 0;
  let errorsBySubject: Map<string, number> = new Map();
  let subjectWithMostErrors: { title: string; count: number } | null = null;

  function loadErrorsStats() {
    errorsCount = getErrorsCount();
    const bySubject = getErrorsBySubject();
    errorsBySubject = new Map();

    for (const [subjectId, questionIds] of bySubject.entries()) {
      errorsBySubject.set(subjectId, questionIds.size);
    }

    // Find subject with most errors
    let maxCount = 0;
    let maxSubjectId: string | null = null;
    for (const [subjectId, count] of errorsBySubject.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxSubjectId = subjectId;
      }
    }

    if (maxSubjectId && maxCount > 0) {
      const subject = subjects.find(s => s.id === maxSubjectId);
      if (subject) {
        subjectWithMostErrors = { title: subject.title, count: maxCount };
      }
    } else {
      subjectWithMostErrors = null;
    }
  }

  function handleClearErrors() {
    if (confirm('Da li ste sigurni da zelite da obrisete sve greske?')) {
      clearAllErrors();
      loadErrorsStats();
    }
  }

  onMount(() => {
    loadErrorsStats();
    const i = setInterval(loadErrorsStats, 1000);
    return () => clearInterval(i);
  });

  function getSubjectTitle(subjectId: string): string {
    const subject = subjects.find(s => s.id === subjectId);
    return subject ? subject.title : subjectId;
  }
</script>

<div class="page">
  <header>
    <h1>Izaberi predmet</h1>
    <ThemeToggle />
  </header>
  <main>
    <div class="grid">
      <div class="errors-container">
        <button class="tile tile-errors" on:click={() => goTo('__errors__')}>
          <div class="titleRow">
            <div class="title">MOJE GREŠKE</div>
            <span class="badge badge-error" aria-label="Greške" title="Pitanja na kojima ste pogrešili">{errorsCount}</span>
          </div>
          <div class="id">Poseban režim gde se pojavljuju pitanja na kojima ste pogrešili. Kad tacno odgovorite ovde, pitanje se briše sa liste grešaka.</div>
        </button>
        {#if errorsCount > 0}
          <button class="clear-errors-btn" on:click={handleClearErrors} title="Obrisi sve greske">
            Izbriši sve moje greške
          </button>
        {/if}
      </div>
      <div class="subjects-grid">
        {#each subjects as s}
          <div class="tile-wrapper">
            <div class="toggle-container">
              <label class="toggle-label">
                <span class="toggle-text">Polozen</span>
                <div class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={passedSubjects.has(s.id)}
                    on:change={(e) => togglePassed(s.id, e)}
                  />
                  <span class="toggle-slider"></span>
                </div>
              </label>
            </div>
            <button class="tile tile-subject {passedSubjects.has(s.id) ? 'passed' : ''}" on:click={() => goTo(s.id)}>
              <div class="titleRow">
                <div class="title">{s.title}</div>
                <div class="badges-row">
                  {#if passedSubjects.has(s.id)}
                    <span class="badge badge-passed" aria-label="Passed" title="Predmet polozen">✓</span>
                  {/if}
                </div>
              </div>
              <div class="id">{s.id}</div>
            </button>
          </div>
        {/each}
      </div>
      {#if errorsCount > 0}
        <div class="stats-section">
          <h2>Statistika gresaka</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Ukupno gresaka</div>
              <div class="stat-value">{errorsCount}</div>
            </div>
            {#if subjectWithMostErrors}
              <div class="stat-card">
                <div class="stat-label">Najvise gresaka</div>
                <div class="stat-value">{subjectWithMostErrors.count}</div>
                <div class="stat-subtitle">{subjectWithMostErrors.title}</div>
              </div>
            {/if}
            {#if errorsBySubject.size > 0}
              <div class="stat-card stat-card-full">
                <div class="stat-label">Po predmetima</div>
                <div class="errors-list">
                  {#each Array.from(errorsBySubject.entries()).sort((a, b) => b[1] - a[1]) as [subjectId, count]}
                    <div class="error-item">
                      <span class="error-subject">{getSubjectTitle(subjectId)}</span>
                      <span class="error-count">{count}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </main>
</div>

<style>
  .page { min-height: 100dvh; display: flex; flex-direction: column; }
  header { padding: 12px 16px; position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  h1 { margin: 0; font-size: 18px; }
  main { padding: 12px; }
  .grid { display: flex; flex-direction: column; gap: 16px; }
  .subjects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .tile-wrapper { display: flex; flex-direction: column; gap: 8px; }
  .toggle-container { display: flex; justify-content: flex-end; padding: 0 4px; }
  .toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
  .toggle-text { font-size: 12px; color: var(--muted); font-weight: 500; }
  .tile { text-align: left; padding: 14px; border-radius: 0; border: none; background: var(--btn-bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); }
  .tile-subject { padding: 20px; min-height: 140px; display: flex; flex-direction: column; justify-content: space-between; }
  .tile-subject.passed { background: #ecfdf5; border: 2px solid #10b981; }
  .titleRow { display: flex; align-items: flex-start; gap: 8px; flex-direction: column; justify-content: space-between; width: 100%; }
  .title { font-weight: 600; font-size: 16px; }
  .id { margin-top: 8px; color: var(--muted); font-size: 12px; }
  @media (min-width: 640px) {
    .page { max-width: 1200px; margin: 0 auto; }
    .subjects-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
    .tile-subject { padding: 24px; min-height: 160px; }
    .title { font-size: 18px; }
  }
  .badges-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .badge { display: inline-block; padding: 4px 8px; font-size: 11px; background: #ecfdf5; color: #065f46; font-weight: 600; border-radius: 4px; }
  .badge-passed { background: #10b981; color: white; }
  .toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; cursor: pointer; }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: 0.3s; border-radius: 24px; }
  .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
  .toggle-switch input:checked + .toggle-slider { background-color: #10b981; }
  .toggle-switch input:checked + .toggle-slider:before { transform: translateX(20px); }
  .toggle-label:hover .toggle-slider { box-shadow: 0 0 0 2px rgba(16,185,129,.2); }
  .toggle-label:hover .toggle-text { color: var(--text); }
  .errors-container { display: flex; gap: 0; align-items: stretch; }
  .tile-errors { background: #fef2f2; color: #7f1d1d; flex: 1; }
  .badge-error { background: #fee2e2; color: #991b1b; }
  .clear-errors-btn { padding: 14px 16px; border: none; background: #991b1b; color: white; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 0; white-space: nowrap; }
  .clear-errors-btn:hover { background: #7f1d1d; }
  .clear-errors-btn:active { background: #991b1b; }
  .stats-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border); }
  .stats-section h2 { margin: 0 0 16px 0; font-size: 18px; font-weight: 600; }
  .stats-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 640px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .stat-card { background: var(--card); padding: 16px; border-radius: 0; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); }
  .stat-card-full { grid-column: 1 / -1; }
  .stat-label { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
  .stat-value { font-size: 24px; font-weight: 700; color: var(--text); }
  .stat-subtitle { font-size: 14px; color: var(--muted); margin-top: 4px; }
  .errors-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .error-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .error-item:last-child { border-bottom: none; }
  .error-subject { font-size: 14px; color: var(--text); }
  .error-count { font-size: 16px; font-weight: 600; color: #991b1b; }
</style>
