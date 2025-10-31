<script lang="ts">
  import { onMount } from 'svelte';
  import { subjects, type SubjectId } from '../subjects';
  import ThemeToggle from './ThemeToggle.svelte';
  import { addError, removeError, getAllErrors, getErrorsBySubject, ERRORS_SUBJECT_ID } from '../errors';

  type Option = { text: string; isCorrect: boolean };
  type Question = { id: string; question: string; comment?: string; image?: string; options: Option[] };
  type Bank = { subject: string; lang: string; version: number; questions: Question[] };

  let bank: Bank | null = null;
  let idx = 0;
  let shuffledOptions: Option[] = [];
  let showHint = false; // legacy flag; not used for text hint anymore
  let currentSubjectId: SubjectId | typeof ERRORS_SUBJECT_ID = '01-vazduhoplovni-propisi';
  let loadError = '';
  let selectedIndex: number | null = null;
  let autoNextHandle: number | null = null;
  let showImageModal = false;
  let modalImageUrl = '';

  // Exam mode state
  let examMode = false; // whether exam simulation is active
  let examOrder: number[] = []; // indices of questions in current exam session
  let examPos = 0; // position within examOrder
  let examAnswers: (boolean | null)[] = []; // first-attempt correctness per exam question
  let examFinished = false; // whether user has finished the exam

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

  function isValidSubject(id: string | null): id is SubjectId | typeof ERRORS_SUBJECT_ID {
    return !!id && (id === ERRORS_SUBJECT_ID || subjects.some(s => s.id === id));
  }

  function getSubjectTitle(id: SubjectId | typeof ERRORS_SUBJECT_ID): string {
    const found = subjects.find(s => s.id === id);
    if (id === ERRORS_SUBJECT_ID) return 'Greške';
    return found ? found.title : 'PPL';
  }

  async function loadBank(subjectOverride?: SubjectId | typeof ERRORS_SUBJECT_ID) {
    // support hash route: #/quiz?s=<id>
    const hash = location.hash || '';
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    const params = new URLSearchParams(location.search);
    const candidate = subjectOverride || hashParams.get('s') || params.get('s') || localStorage.getItem(STORAGE_KEY_SUBJECT) || subjects[0].id;
    currentSubjectId = isValidSubject(candidate) ? candidate : subjects[0].id;
    loadError = '';
    if (currentSubjectId === ERRORS_SUBJECT_ID) {
      // Build pseudo-bank from stored errors across subjects
      const bySubject = getErrorsBySubject();
      const questions: Question[] = [];
      for (const [sid, qids] of bySubject.entries()) {
        try {
          const cacheBust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
          const res = await fetch(`${import.meta.env.BASE_URL}data/${sid}.json${cacheBust}`, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = (await res.json()) as Bank;
          for (const q of data.questions) {
            if (qids.has(q.id)) {
              questions.push({ ...q });
            }
          }
        } catch {
          // skip subject if load fails
        }
      }
      bank = { subject: getSubjectTitle(ERRORS_SUBJECT_ID), lang: 'sr', version: 1, questions } as Bank;
      idx = 0;
      prepareQuestion();
      return;
    } else {
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
  }

  function getImageUrl(filename: string | undefined): string {
    if (!filename) return '';
    const base = import.meta.env.BASE_URL;
    const baseUrl = base.endsWith('/') ? base : base + '/';
    return `${baseUrl}images/${filename}`;
  }

  function openImageModal(imagePath: string | undefined) {
    if (imagePath) {
      modalImageUrl = getImageUrl(imagePath);
      showImageModal = true;
    }
  }

  function closeImageModal() {
    showImageModal = false;
    modalImageUrl = '';
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
    // Avoid persisting index while in exam mode
    if (!examMode) {
      localStorage.setItem(STORAGE_KEY_INDEX + currentSubjectId, String(idx));
    }
    localStorage.setItem(STORAGE_KEY_SUBJECT, currentSubjectId);
    const url = new URL(location.href);
    // write to hash for routing
    url.hash = `#/quiz?s=${currentSubjectId}`;
    history.replaceState(null, '', url);
  }

  function next() {
    if (!bank) return;
    if (examMode && examOrder.length > 0) {
      examPos = Math.min(examPos + 1, examOrder.length - 1);
      idx = examOrder[examPos];
    } else {
      idx = (idx + 1) % bank.questions.length;
    }
    prepareQuestion();
  }

  function prev() {
    if (!bank) return;
    if (examMode && examOrder.length > 0) {
      examPos = Math.max(examPos - 1, 0);
      idx = examOrder[examPos];
    } else {
      idx = (idx - 1 + bank.questions.length) % bank.questions.length;
    }
    prepareQuestion();
  }

  function randomQ() {
    if (!bank) return;
    if (examMode && examOrder.length > 0) {
      return; // disabled in exam mode
    }
    if (currentSubjectId === ERRORS_SUBJECT_ID) {
      idx = Math.floor(Math.random() * bank.questions.length);
      prepareQuestion();
      return;
    }
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

  function changeSubject(newId: SubjectId | typeof ERRORS_SUBJECT_ID) {
    if (currentSubjectId === newId) return;
    currentSubjectId = newId;
    // Reset to the first question when switching subjects
    idx = 0;
    if (newId !== ERRORS_SUBJECT_ID) {
      localStorage.setItem(STORAGE_KEY_INDEX + currentSubjectId, '0');
    }
    showHint = false;
    // Leave exam mode when subject changes
    stopExam();
    loadBank(currentSubjectId);
  }

  function handleSubjectChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const val = select.value as SubjectId;
    changeSubject(val);
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
    const isCorrect = !!shuffledOptions[i]?.isCorrect;
    if (examMode && !examFinished && examOrder.length > 0) {
      // Record only the first attempt for current exam question
      if (examAnswers[examPos] === null || examAnswers[examPos] === undefined) {
        examAnswers[examPos] = isCorrect;
      }
      // Do not auto-advance in exam mode to avoid biasing attempts
    } else {
      if (isCorrect) {
        if (autoNextHandle !== null) clearTimeout(autoNextHandle);
        autoNextHandle = null;
        // When answering correctly in Errors mode, remove from errors list
        if (currentSubjectId === ERRORS_SUBJECT_ID) {
          const q = bank!.questions[idx];
          // Need to find original subject of this question; we only have question id
          // We will attempt removal across all subjects containing this id
          const bySubject = getErrorsBySubject();
          for (const [sid, set] of bySubject.entries()) {
            if (set.has(q.id)) removeError(sid, q.id);
          }
          // Rebuild bank after removal
          loadBank(ERRORS_SUBJECT_ID);
        } else {
          next(); // immediate advance on correct answer
        }
      }
    }
    // Add wrong attempt to errors if not in Errors mode and not in exam mode
    if (!isCorrect && currentSubjectId !== ERRORS_SUBJECT_ID && !examMode) {
      const qid = bank!.questions[idx].id;
      addError(currentSubjectId as SubjectId, qid);
    }
  }

  function selectCorrect() {
    const i = shuffledOptions.findIndex(o => o.isCorrect);
    if (i !== -1) {
      selectedIndex = i;
      // Do not auto-advance when revealing the correct answer
      if (autoNextHandle !== null) {
        clearTimeout(autoNextHandle);
        autoNextHandle = null;
      }
    }
  }

  function openChatForCurrent() {
    if (!bank) return;
    openChatGPT(bank.questions[idx]);
  }

  onMount(() => loadBank());

  // Exam mode helpers
  function startExam() {
    if (!bank) return;
    const total = Math.min(20, bank.questions.length);
    const order = shuffle(Array.from({ length: bank.questions.length }, (_, i) => i)).slice(0, total);
    examOrder = order;
    examAnswers = Array.from({ length: total }, () => null);
    examPos = 0;
    examFinished = false;
    examMode = true;
    idx = examOrder[0];
    prepareQuestion();
  }

  function stopExam() {
    examMode = false;
    examFinished = false;
    examOrder = [];
    examAnswers = [];
    examPos = 0;
  }

  function toggleExam(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) startExam(); else stopExam();
  }

  function finishExam() {
    if (!examMode) return;
    examFinished = true;
    // Persist wrong answers from exam: take questions with false
    const wrongIndices = examAnswers
      .map((ok, i) => (ok === false ? examOrder[i] : null))
      .filter((x) => x !== null) as number[];
    if (currentSubjectId !== ERRORS_SUBJECT_ID) {
      for (const qi of wrongIndices) {
        const qid = bank!.questions[qi].id;
        addError(currentSubjectId as SubjectId, qid);
      }
    }
  }

  function restartExam() {
    startExam();
  }

  // Derived values for exam result
  $: examTotal = examOrder.length;
  $: examCorrect = examAnswers.filter(a => a === true).length;
  $: examPercent = examTotal > 0 ? Math.round((examCorrect / examTotal) * 100) : 0;
  $: examPassed = examCorrect >= Math.ceil(0.75 * examTotal);
  $: isErrorsMode = currentSubjectId === ERRORS_SUBJECT_ID;
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
          {#if isErrorsMode}
            <button class="back" on:click={goToSubjects}>← Predmeti</button>
            <ThemeToggle />
          {:else}
            <label for="subject">Predmet</label>
            <select id="subject" bind:value={currentSubjectId} on:change={handleSubjectChange}>
              {#each subjects as s}
                <option value={s.id}>{s.title}</option>
              {/each}
            </select>
            <ThemeToggle />
          {/if}
        </div>
      </header>
      <main>
        {#if loadError}
          <div class="errorBox">{loadError}</div>
        {/if}
        <p>Nema pitanja u setu.</p>
      </main>
    </div>
  {:else}
    {#key idx}
      <div class="page">
        <header>
          <h1>{bank.subject}</h1>
          <div class="toolbar">
            <button class="back" on:click={goToSubjects}>← Predmeti</button>
            <small>
              #{bank.lang} ·
              {#if examMode}
                {examPos + 1}/{examOrder.length}
              {:else}
                {idx + 1}/{bank.questions.length}
              {/if}
            </small>
            <ThemeToggle />
            {#if !isErrorsMode}
              <label class="exam-toggle">
                <input type="checkbox" on:change={toggleExam} checked={examMode} />
                <span class="label-text">Simuliraj ispit</span>
              </label>
            {/if}
          </div>
        </header>
        <main>
          <div class="question-container {bank.questions[idx].image ? 'has-image' : 'no-image'}">
            <div class="card">
              <div class="question">
                {bank.questions[idx].question}
              </div>
              {#if !examMode}
                <div class="qnav">
                  <label for="qselect">Питање</label>
                  <select id="qselect" on:change={handleQuestionChange} bind:value={idx}>
                    {#each bank.questions as _q, i}
                      <option value={i}>{i + 1}</option>
                    {/each}
                  </select>
                  <small>од {bank.questions.length}</small>
                </div>
              {/if}
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

              {#if bank.questions[idx].comment && !examMode}
                <div class="comment">{bank.questions[idx].comment}</div>
              {/if}
            </div>
            {#if bank.questions[idx].image}
              {@const imgPath = bank.questions[idx].image}
              <div class="question-image">
                <button class="image-button" on:click={() => openImageModal(imgPath)} aria-label="Click to enlarge image">
                  <img src="{getImageUrl(imgPath)}" alt="" role="presentation" />
                </button>
              </div>
            {/if}
          </div>


          {#if examMode && examFinished}
            <div class="exam-result">
              {#if examTotal > 0}
                <div class="exam-summary">
                  <h2>Rezultat ispita</h2>
                  <p><strong>{examCorrect}</strong> / {examTotal} ({examPercent}%)</p>
                  {#if examPassed}
                    <p class="pass">Položili ste ispit.</p>
                  {:else}
                    <p class="fail">Niste položili ispit.</p>
                  {/if}
                  <div class="actions">
                    <button on:click={restartExam}>Ponovi ispit</button>
                    <button on:click={stopExam}>Izađi iz ispita</button>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="bottomBar">
            {#if !examMode}
              <div class="bottomActions">
                <button class="btn btn-success-outline" on:click={selectCorrect}>Prikaži tačan odgovor</button>
                <button class="btn btn-info" on:click={openChatForCurrent}>Pitaj AI</button>
              </div>
            {/if}
            <nav class="bottomNav">
              <button class="btn btn-neutral" on:click={prev}>← Nazad</button>
              {#if !examMode}
                <button class="btn btn-secondary" on:click={randomQ}>Slučajno</button>
              {:else}
                <button class="btn btn-warning" on:click={finishExam}>Završi ispit</button>
              {/if}
              <button class="btn btn-primary" on:click={next}>Sledeće →</button>
            </nav>
          </div>
        </main>
      </div>
    {/key}
  {/if}
{/if}

{#if showImageModal}
  <div class="image-modal" role="dialog" aria-modal="true" aria-label="Enlarged image" tabindex="-1" on:click={closeImageModal} on:keydown={(e) => e.key === 'Escape' && closeImageModal()}>
    <div class="image-modal-content" on:click|stopPropagation role="none">
      <img src={modalImageUrl} alt="" role="presentation" />
    </div>
  </div>
{/if}

<style>
  :root { color-scheme: light dark; }
  .page { min-height: 100dvh; display: flex; flex-direction: column; }
  header { padding: 12px 16px; position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  h1 { margin: 0; font-size: 18px; }
  .toolbar { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .back { padding: 8px 10px; border-radius: 0; border: none; background: var(--btn-bg); color: var(--text); }
  label { font-size: 12px; color: var(--muted); }
  select { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text); }
  small { color: var(--muted); margin-left: auto; }
  main { padding: 12px; flex: 1; }
  .question-container { display: flex; gap: 16px; align-items: flex-start; width: 100%; }
  .question-container.has-image { justify-content: flex-start; }
  .question-container.no-image { justify-content: center; }
  .card { background: var(--card); border: none; border-radius: 0; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); }
  .question-container.has-image .card { flex: 1; }
  .question-container.no-image .card { max-width: 800px; margin: 0 auto; }
  .question-image { flex-shrink: 0; width: 400px; }
  .image-button { background: none; border: none; padding: 0; cursor: pointer; display: block; width: 100%; }
  .question-image img { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,.1); transition: transform 0.2s; display: block; }
  .image-button:hover .question-image img { transform: scale(1.02); }
  .image-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.9); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
  .image-modal-content { position: relative; max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center; }
  .image-modal-content img { max-width: 100%; max-height: 90vh; object-fit: contain; border-radius: 8px; }
  .question { font-size: 22px; line-height: 1.4; margin-bottom: 16px; }
  @media (max-width: 768px) {
    .question-container { flex-direction: column; }
    .question-image { width: 100%; }
  }
  .qnav { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .qnav label { font-size: 12px; color: var(--muted); }
  .qnav select { padding: 6px 8px; border-radius: 0; border: none; background: var(--btn-bg); color: var(--text); }
  .qnav small { color: var(--muted); }
  .options { display: grid; gap: 12px; }
  .option { text-align: left; padding: 14px; border-radius: 0; border: none; background: var(--option-bg); color: var(--text); font-size: 16px; box-shadow: 0 1px 1px rgba(0,0,0,.04); }
  .option:hover { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(37,99,235,.12); }
  .option:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .option.correct { background: #ecfdf5; color: #065f46; }
  .option.wrong { background: #fef2f2; color: #991b1b; }
  .option:active { transform: scale(0.997); }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .comment { margin-top: 8px; color: var(--muted); font-size: 13px; }
  nav { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 0; }
  nav > button { padding: 14px; border-radius: 0; border: none; background: var(--btn-bg); color: var(--text); font-size: 15px; }
  @media (min-width: 640px) { .page { max-width: 1200px; margin: 0 auto; } }
  .errorBox { margin: 12px 0; padding: 12px; background: #fef2f2; color: #991b1b; }
  .exam-toggle { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; font-size: 13px; }
  .exam-toggle .label-text { color: #b91c1c; font-weight: 600; }
  .exam-result { margin-top: 12px; }
  .exam-summary { background: var(--card); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); }
  .exam-summary h2 { margin: 0 0 8px 0; font-size: 18px; }
  .exam-summary .pass { color: #065f46; }
  .exam-summary .fail { color: #991b1b; }
  .bottomBar { position: relative; margin-top: 50px; bottom: 0; left: 0; width: 100%;background: var(--bg); padding: 12px; display: grid; gap: 10px; box-shadow: 0 -2px 6px rgba(0,0,0,.06); }
  .bottomActions { display: flex; gap: 8px; }
  .bottomNav { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

  /* Buttons palette */
  .btn { padding: 14px; border-radius: 0; border: none; background: var(--btn-bg); color: var(--text); font-size: 15px; }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,.06); }
  .btn:active { transform: translateY(0); }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
  .btn-primary:hover { box-shadow: 0 0 0 2px rgba(37,99,235,.2); }
  .btn-secondary { background: #e2e8f0; border-color: #cbd5e1; color: #0b1324; }
  .btn-secondary:hover { background: #cbd5e1; }
  .btn-neutral { background: var(--btn-bg); border-color: var(--btn-border); color: var(--text); }
  .btn-neutral:hover { border-color: var(--accent); }
  .btn-warning { background: #fef3c7; border-color: #f59e0b; color: #92400e; }
  .btn-warning:hover { background: #fde68a; border-color: #d97706; }
  .btn-success-outline { background: transparent; border-color: #10b981; color: #065f46; }
  .btn-success-outline:hover { background: var(--hint-bg); border-color: var(--hint-border); color: var(--hint-text); }
  .btn-info { background: #e0f2fe; border-color: #7dd3fc; color: #075985; }
  .btn-info:hover { background: #bae6fd; border-color: #38bdf8; }
  .back:hover { border-color: var(--accent); }
</style>
