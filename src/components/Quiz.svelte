<script lang="ts">
  import { onMount } from 'svelte';
  import { subjects, type SubjectId } from '../subjects';

  type Option = { text: string; isCorrect: boolean };
  type Question = { id: string; question: string; comment?: string; options: Option[] };
  type Bank = { subject: string; lang: string; version: number; questions: Question[] };

  let bank: Bank | null = null;
  let idx = 0;
  let shuffledOptions: Option[] = [];
  let showHint = false; // legacy flag; not used for text hint anymore
  let currentSubjectId: SubjectId = '01-vazduhoplovni-propisi';
  let loadError = '';
  let selectedIndex: number | null = null;
  let autoNextHandle: number | null = null;

  const STORAGE_KEY_INDEX = 'ppl.index.'; // suffix with subject id
  const STORAGE_KEY_SUBJECT = 'ppl.subject';

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function isValidSubject(id: string | null): id is SubjectId {
    return !!id && subjects.some(s => s.id === id);
  }

  function getSubjectTitle(id: SubjectId): string {
    const found = subjects.find(s => s.id === id);
    return found ? found.title : 'PPL';
  }

  async function loadBank(subjectOverride?: SubjectId) {
    // support hash route: #/quiz?s=<id>
    const hash = location.hash || '';
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    const params = new URLSearchParams(location.search);
    const candidate = subjectOverride || hashParams.get('s') || params.get('s') || localStorage.getItem(STORAGE_KEY_SUBJECT) || subjects[0].id;
    currentSubjectId = isValidSubject(candidate) ? candidate : subjects[0].id;
    loadError = '';
    try {
      const cacheBust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
      const res = await fetch(`${import.meta.env.BASE_URL}data/${currentSubjectId}.json${cacheBust}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bank = (await res.json()) as Bank;
    } catch (err) {
      // Try fallback to default subject if not already
      if (currentSubjectId !== subjects[0].id) {
        currentSubjectId = subjects[0].id;
        try {
          const cacheBust2 = import.meta.env.DEV ? `?t=${Date.now()}` : '';
          const res2 = await fetch(`${import.meta.env.BASE_URL}data/${currentSubjectId}.json${cacheBust2}`, { cache: 'no-store' });
          if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
          bank = (await res2.json()) as Bank;
          loadError = 'Није нађен сет за претходни предмет. Учитан је подразумевани предмет.';
        } catch (err2) {
          loadError = 'Није нађен ниједан сет питања.';
          bank = { subject: getSubjectTitle(currentSubjectId), lang: 'sr', version: 1, questions: [] } as Bank;
        }
      } else {
        loadError = 'Није нађен сет питања за изабрани предмет.';
        bank = { subject: getSubjectTitle(currentSubjectId), lang: 'sr', version: 1, questions: [] } as Bank;
      }
    }
    const saved = Number(localStorage.getItem(STORAGE_KEY_INDEX + currentSubjectId) || '0');
    idx = Number.isFinite(saved) && saved >= 0 && saved < bank.questions.length ? saved : 0;
    prepareQuestion();
  }

  function prepareQuestion() {
    showHint = false;
    if (!bank) return;
    const q = bank.questions[idx];
    shuffledOptions = shuffle(q.options || []);
    selectedIndex = null;
    if (autoNextHandle !== null) {
      clearTimeout(autoNextHandle);
      autoNextHandle = null;
    }
    localStorage.setItem(STORAGE_KEY_INDEX + currentSubjectId, String(idx));
    localStorage.setItem(STORAGE_KEY_SUBJECT, currentSubjectId);
    const url = new URL(location.href);
    // write to hash for routing
    url.hash = `#/quiz?s=${currentSubjectId}`;
    history.replaceState(null, '', url);
  }

  function next() {
    if (!bank) return;
    idx = (idx + 1) % bank.questions.length;
    prepareQuestion();
  }

  function prev() {
    if (!bank) return;
    idx = (idx - 1 + bank.questions.length) % bank.questions.length;
    prepareQuestion();
  }

  function randomQ() {
    if (!bank) return;
    idx = Math.floor(Math.random() * bank.questions.length);
    prepareQuestion();
  }

  function buildChatPrompt(q: Question) {
    const subject = bank?.subject ?? 'PPL';
    const opts = q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text}`).join('\n');
    // Prompt must be Serbian per requirement
    return `Објасни зашто је тачан одговор за предмет ${subject} (PPL).\nПитање: ${q.question}\nПонудени одговори:\n${opts}`;
  }

  function openChatGPT(q: Question) {
    const prompt = buildChatPrompt(q);
    const url = `https://chat.openai.com/?q=${encodeURIComponent(prompt)}`;
    window.open(url, '_blank');
  }

  function changeSubject(newId: SubjectId) {
    if (currentSubjectId === newId) return;
    currentSubjectId = newId;
    // Reset to the first question when switching subjects
    idx = 0;
    localStorage.setItem(STORAGE_KEY_INDEX + currentSubjectId, '0');
    showHint = false;
    loadBank(currentSubjectId);
  }

  function handleSubjectChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    changeSubject(select.value as SubjectId);
  }

  function handleQuestionChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const newIdx = Number(select.value);
    if (Number.isFinite(newIdx)) {
      idx = Math.min(Math.max(newIdx, 0), (bank?.questions.length ?? 1) - 1);
      prepareQuestion();
    }
  }

  function goToSubjects() {
    location.hash = '#/';
  }

  function selectOption(i: number) {
    selectedIndex = i;
    if (shuffledOptions[i]?.isCorrect) {
      if (autoNextHandle !== null) clearTimeout(autoNextHandle);
      autoNextHandle = window.setTimeout(() => {
        autoNextHandle = null;
        next();
      }, 1000);
    }
  }

  function selectCorrect() {
    const i = shuffledOptions.findIndex(o => o.isCorrect);
    if (i !== -1) {
      selectedIndex = i;
      if (autoNextHandle !== null) clearTimeout(autoNextHandle);
      autoNextHandle = window.setTimeout(() => {
        autoNextHandle = null;
        next();
      }, 1000);
    }
  }

  onMount(() => loadBank());
</script>

{#if !bank}
  <div class="page">
    <header>
      <h1>Priprema PPL</h1>
    </header>
    <main>
      <p>Učitavanje…</p>
    </main>
  </div>
{:else}
  {#if bank.questions.length === 0}
    <div class="page">
      <header>
        <h1>{bank.subject}</h1>
        <div class="toolbar">
          <label for="subject">Predmet</label>
          <select id="subject" bind:value={currentSubjectId} on:change={handleSubjectChange}>
            {#each subjects as s}
              <option value={s.id}>{s.title}</option>
            {/each}
          </select>
        </div>
      </header>
      <main>
        {#if loadError}
          <div class="errorBox">{loadError}</div>
        {/if}
        <p>Nема питања у сету.</p>
      </main>
    </div>
  {:else}
    {#key idx}
      <div class="page">
        <header>
          <h1>{bank.subject}</h1>
          <div class="toolbar">
            <button class="back" on:click={goToSubjects}>← Predmeti</button>
            <small>#{bank.lang} · {idx + 1}/{bank.questions.length}</small>
          </div>
        </header>
        <main>
          <div class="card">
            <div class="question">
              {bank.questions[idx].question}
            </div>
            <div class="qnav">
              <label for="qselect">Питање</label>
              <select id="qselect" on:change={handleQuestionChange} bind:value={idx}>
                {#each bank.questions as _q, i}
                  <option value={i}>{i + 1}</option>
                {/each}
              </select>
              <small>од {bank.questions.length}</small>
            </div>
            <div class="options">
              {#each shuffledOptions as opt, i}
                <button
                  class="option {selectedIndex !== null && opt.isCorrect ? 'correct' : ''} {selectedIndex === i && !opt.isCorrect ? 'wrong' : ''}"
                  on:click={() => { selectOption(i); showHint = true; }}
                >
                  {opt.text}
                </button>
              {/each}
            </div>
            <nav class="card-nav">
              <button on:click={prev}>← Nazad</button>
              <button on:click={randomQ}>Slučajno</button>
              <button on:click={next}>Sledeće →</button>
            </nav>
            {#if bank.questions[idx].comment}
              <div class="comment">{bank.questions[idx].comment}</div>
            {/if}
          </div>
          <div class="actions below-card">
            <button class="hint" on:click={selectCorrect}>Prikaži tačan odgovor</button>
            <button class="chat" on:click={() => openChatGPT(bank.questions[idx])}>Pitaj AI</button>
          </div>
        </main>
      </div>
    {/key}
  {/if}
{/if}

<style>
  :root { color-scheme: light dark; }
  .page { min-height: 100dvh; display: flex; flex-direction: column; }
  header { padding: 12px 16px; position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); }
  h1 { margin: 0; font-size: 18px; }
  .toolbar { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .back { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
  label { font-size: 12px; color: var(--muted); }
  select { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
  small { color: var(--muted); margin-left: auto; }
  main { padding: 12px; flex: 1; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .question { font-size: 18px; margin-bottom: 12px; }
  .qnav { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .qnav label { font-size: 12px; color: var(--muted); }
  .qnav select { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
  .qnav small { color: var(--muted); }
  .options { display: grid; gap: 10px; }
  .option { text-align: left; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--option-bg); color: var(--text); }
  .option.correct { background: #ecfdf5; border-color: #10b981; color: #065f46; }
  .option.wrong { background: #fef2f2; border-color: #ef4444; color: #991b1b; }
  .option:active { transform: scale(0.997); }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .hint, .chat { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
  .chat { background: var(--accent); color: var(--accent-contrast); border-color: var(--accent); }
  .hintBox { margin-top: 10px; padding: 10px; background: var(--hint-bg); border: 1px solid var(--hint-border); border-radius: 8px; color: var(--hint-text); }
  .comment { margin-top: 8px; color: var(--muted); font-size: 13px; }
  nav { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 0; }
  .below-card { margin-top: 10px; }
  nav > button { padding: 12px; border-radius: 10px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
  @media (min-width: 640px) { .page { max-width: 640px; margin: 0 auto; } }
  .errorBox { margin: 12px 0; padding: 12px; background: #fef2f2; border: 1px solid #ef4444; color: #991b1b; border-radius: 8px; }
</style>
