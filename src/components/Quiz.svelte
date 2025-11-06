<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { marked } from 'marked';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
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

  // ChatGPT explanation state
  const STORAGE_KEY_OPENAI_API_KEY = 'ppl.usr_pref_01';
  const STORAGE_KEY_AUTO_EXPLANATION = 'ppl.auto_explanation';
  const STORAGE_KEY_EXPLANATION_LANG = 'ppl.explanation_lang';
  type ExplanationLanguage = 'sr' | 'ru' | 'en';

  // Simple encryption/decryption for API key obfuscation
  const ENCRYPTION_KEY = 'ppl2025_secure_key_obfuscation';

  function encrypt(text: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return btoa(result);
  }

  function decrypt(encrypted: string): string {
    try {
      const decoded = atob(encrypted);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
        result += String.fromCharCode(charCode);
      }
      return result;
    } catch {
      return '';
    }
  }

  function getStoredApiKey(): string {
    const stored = localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY);
    if (!stored) return '';
    try {
      return decrypt(stored);
    } catch {
      return '';
    }
  }

  function setStoredApiKey(key: string): void {
    if (key) {
      localStorage.setItem(STORAGE_KEY_OPENAI_API_KEY, encrypt(key));
    } else {
      localStorage.removeItem(STORAGE_KEY_OPENAI_API_KEY);
    }
  }

  let openaiApiKey = getStoredApiKey();
  let autoExplanation = localStorage.getItem(STORAGE_KEY_AUTO_EXPLANATION) !== 'false'; // default true
  let explanationLang: ExplanationLanguage = (localStorage.getItem(STORAGE_KEY_EXPLANATION_LANG) || 'sr') as ExplanationLanguage;
  let showApiKeyModal = false;
  let explanationLoading = false;
  let explanationText = '';
  let explanationError = '';
  let explanationQuestionId: string | null = null;

  // Function to process LaTeX formulas in HTML
  function processMathFormulas(html: string): string {
    if (!html) return '';

    // Handle standard LaTeX syntax: \[ ... \] for display math
    html = html.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return match;
      }
    });

    // Handle inline math: \( ... \)
    html = html.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return match;
      }
    });

    // Handle formulas in format [ ... ] (simple brackets, may contain LaTeX)
    // Match [ followed by optional space, then content (may include newlines), then ]
    // Only process if content contains LaTeX commands (backslashes followed by letters)
    // This avoids matching regular brackets in text
    html = html.replace(/\[\s*([\s\S]*?)\s*\]/g, (match, content) => {
      const trimmed = content.trim();
      // Check if it looks like a LaTeX formula: contains backslash commands like \text, \frac, etc.
      // Or contains math operators in a pattern that suggests a formula
      const hasLatexCommands = /\\[a-zA-Z]/.test(trimmed);
      const looksLikeFormula = hasLatexCommands || (
        trimmed.includes('=') &&
        (trimmed.includes('\\') || /[+\-*/^_]/.test(trimmed))
      );

      if (looksLikeFormula) {
        try {
          return katex.renderToString(trimmed, { displayMode: true, throwOnError: false });
        } catch {
          return match; // Return original if rendering fails
        }
      }
      return match; // Not a formula, return as is
    });

    return html;
  }

  // Reactive computed for markdown HTML with math processing
  $: explanationHtml = explanationText ? processMathFormulas(marked.parse(explanationText)) : '';

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
    explanationText = '';
    explanationError = '';
    explanationQuestionId = null;
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

  function buildExplanationPrompt(q: Question, selectedOptionText: string) {
    const subject = bank?.subject ?? 'PPL';
    const correctOption = q.options.find(o => o.isCorrect);
    const opts = q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text}${o.isCorrect ? ' (тачан)' : ''}`).join('\n');

    const prompts = {
      sr: {
        intro: `Објасни детаљно на српском језику зашто је тачан одговор правилан за предмет ${subject} (PPL теорија ваздухопловства).`,
        sections: {
          correct: 'ОБРАЗЛОЖЕЊЕ ТАЧНОГ ОДГОВОРА:',
          examples: 'ПРАКТИЧНИ ПРИМЕРИ:',
          context: 'ДОДАТНИ КОНТЕКСТ:'
        },
        instructions: 'Напиши објашњење у Markdown формату (користи **за жирни текст**, *за курзив*, ## за заглавља, - за спискове). Објашњење треба да буде разумљиво, корисно и образложено на практичним примерима.'
      },
      ru: {
        intro: `Подробно объясни на русском языке, почему правильный ответ верен для предмета ${subject} (теория PPL авиации).`,
        sections: {
          translation: 'ПЕРЕВОД НА РУССКИЙ:',
          correct: 'ОБОСНОВАНИЕ ПРАВИЛЬНОГО ОТВЕТА:',
          examples: 'ПРАКТИЧЕСКИЕ ПРИМЕРЫ:',
          memorization: 'КАК ПРОЩЕ ЗАПОМНИТЬ:'
        },
        instructions: 'Напиши объяснение в формате Markdown (используй **для жирного текста**, *для курсива*, ## для заголовков, - для списков). Объяснение должно быть понятным, полезным и обоснованным практическими примерами.'
      },
      en: {
        intro: `Explain in detail in English why the correct answer is right for the subject ${subject} (PPL aviation theory).`,
        sections: {
          correct: 'EXPLANATION OF CORRECT ANSWER:',
          examples: 'PRACTICAL EXAMPLES:',
          context: 'ADDITIONAL CONTEXT:'
        },
        instructions: 'Write the explanation in Markdown format (use ** for bold text, * for italic, ## for headings, - for lists). The explanation should be clear, useful, and supported by practical examples.'
      }
    };

    const p = prompts[explanationLang];

    const instructions = {
      sr: {
        question: 'Питање:',
        options: 'Понудени одговори:',
        correct: 'Тачан одговор:',
        intro: 'Направи детаљно и разумљиво објашњење које укључује:',
        correctList: [
          'Детаљно објасни зашто је тачан одговор правилан',
          'Наведи конкретне факте, правила или принципе из теорије ваздухопловства',
          'Објасни како се тачан одговор примењује у стварним ситуацијама'
        ],
        examples: [
          'Наведи конкретан пример из праве летења или ситуацију која илуструје правилно разумевање',
          'Објасни предности и важност правилног разумевања'
        ],
        context: [
          'Ако је релевантно, објасни повезаност са другим концептима из ваздухопловства',
          'Наведи корисне напомене за запамћивање'
        ]
      },
      ru: {
        question: 'Вопрос:',
        options: 'Предложенные ответы:',
        correct: 'Правильный ответ:',
        intro: 'Сделай детальное и понятное объяснение, которое включает:',
        translation: [
          'Переведи вопрос на русский язык',
          'Переведи правильный ответ на русский язык'
        ],
        correctList: [
          'Подробно объясни, почему правильный ответ верен',
          'Приведи конкретные факты, правила или принципы из теории авиации, которые подтверждают правильность ответа',
          'Объясни, как правильный ответ применяется в реальных ситуациях полёта'
        ],
        examples: [
          'Приведи конкретный пример из реального полёта или ситуацию, которая иллюстрирует правильное понимание',
          'Объясни преимущества и важность правильного понимания в практических условиях'
        ],
        memorization: [
          'Предложи простой способ запомнить эту информацию (мнемоника, ассоциация, логическая связь)',
          'Если релевантно, объясни связь с другими концепциями из авиации для лучшего понимания'
        ]
      },
      en: {
        question: 'Question:',
        options: 'Provided options:',
        correct: 'Correct answer:',
        intro: 'Make a detailed and clear explanation that includes:',
        correctList: [
          'Explain in detail why the correct answer is right',
          'Provide specific facts, rules or principles from aviation theory',
          'Explain how the correct answer applies in real situations'
        ],
        examples: [
          'Give a specific example from real flight or a situation that illustrates correct understanding',
          'Explain the advantages and importance of correct understanding'
        ],
        context: [
          'If relevant, explain the connection with other aviation concepts',
          'Provide useful notes for memorization'
        ]
      }
    };

    const inst = instructions[explanationLang];

    if (explanationLang === 'ru') {
      return `${p.intro}

${inst.question} ${q.question}

${inst.options}
${opts}

${inst.correct} ${correctOption?.text || 'Неизвестен'}

${inst.intro}

1. ${p.sections.translation}
   - ${inst.translation[0]}
   - ${inst.translation[1]}

2. ${p.sections.correct}
   - ${inst.correctList[0]}
   - ${inst.correctList[1]}
   - ${inst.correctList[2]}

3. ${p.sections.examples}
   - ${inst.examples[0]}
   - ${inst.examples[1]}

4. ${p.sections.memorization}
   - ${inst.memorization[0]}
   - ${inst.memorization[1]}

${p.instructions}`;
    }

    return `${p.intro}

${inst.question} ${q.question}

${inst.options}
${opts}

${inst.correct} ${correctOption?.text || (explanationLang === 'sr' ? 'Непознат' : 'Unknown')}

${inst.intro}

1. ${p.sections.correct}
   - ${inst.correctList[0]}
   - ${inst.correctList[1]}
   - ${inst.correctList[2]}

2. ${p.sections.examples}
   - ${inst.examples[0]}
   - ${inst.examples[1]}

3. ${p.sections.context}
   - ${inst.context[0]}
   - ${inst.context[1]}

${p.instructions}`;
  }

  function getSystemMessage(lang: ExplanationLanguage): string {
    const messages = {
      sr: 'Ти си стручни асистент за теорију ваздухопловства (PPL) на српском језику. Дајеш детаљна, разумљива и практична објашњења са конкретним примерима из ваздухопловства. Увек наводиш практичне примере, ситуације из стварног летења и конкретне последице. Ако видиш слику, детаљно објасни шта она показује и како се то односи на питање. Твоја објашњења су структурирана, образовална и фокусирана на разумевање, а не само на запамћивање. Увек користиш Markdown форматирање за структурирање одговора (заглавља, спискове, жирни текст, курзив).',
      ru: 'Ты — профессиональный ассистент по теории авиации (PPL) на русском языке. Ты даёшь детальные, понятные и практичные объяснения с конкретными примерами из авиации. ВСЕГДА начинаешь с перевода вопроса и правильного ответа на русский язык. Затем подробно объясняешь, почему ответ верен, приводя конкретные факты и правила из теории авиации. Всегда приводишь практические примеры из реальных полётов и конкретные последствия. Предлагаешь простые способы запоминания информации (мнемоники, ассоциации, логические связи). Если видишь изображение, подробно объясни, что оно показывает и как это относится к вопросу. Твои объяснения структурированы, образовательны и сфокусированы на понимание, а не только на запоминание. Всегда используешь форматирование Markdown для структурирования ответа (заголовки, списки, жирный текст, курсив).',
      en: 'You are a professional assistant for aviation theory (PPL) in English. You provide detailed, clear, and practical explanations with specific examples from aviation. You always include practical examples, situations from real flights, and specific consequences. If you see an image, explain in detail what it shows and how it relates to the question. Your explanations are structured, educational, and focused on understanding, not just memorization. You always use Markdown formatting to structure your responses (headings, lists, bold text, italic).'
    };
    return messages[lang];
  }

  async function imageToBase64(imageUrl: string): Promise<string> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data:image/...;base64, prefix if present
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      throw new Error('Не могу да учитам слику.');
    }
  }

  async function fetchExplanation(q: Question, selectedOptionText: string) {
    if (!openaiApiKey) {
      explanationError = 'API кључ није подешен. Молимо унесите OpenAI API кључ у подешавањима.';
      return;
    }

    explanationLoading = true;
    explanationError = '';
    explanationText = '';
    explanationQuestionId = q.id;

    try {
      const prompt = buildExplanationPrompt(q, selectedOptionText);
      const hasImage = !!q.image;

      // Prepare user message content for Vision API
      type ContentItem =
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } };

      const userContent: ContentItem[] = [
        { type: 'text', text: prompt }
      ];

      // Add image if available
      if (hasImage && q.image) {
        try {
          const imageUrl = getImageUrl(q.image);
          const base64Image = await imageToBase64(imageUrl);
          const mimeType = imageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          userContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          });
        } catch (imgErr) {
          // If image loading fails, continue without image
          console.warn('Failed to load image for explanation:', imgErr);
        }
      }

      // Use gpt-4o model (supports both text and images)
      const imageIncluded = userContent.length > 1;
      const model = 'gpt-4o';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: getSystemMessage(explanationLang)
            },
            {
              role: 'user',
              content: userContent
            }
          ],
          max_tokens: imageIncluded ? 800 : 600,
          temperature: 0,
          stream: true
        })
      });

      if (!response.ok) {
        // Try to read error message from stream or fallback to status
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorText = await response.text();
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          // If parsing fails, use status code
        }
        throw new Error(errorMessage);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get response stream');
      }

      explanationText = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === '') continue;

            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                continue;
              }

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;

                if (delta) {
                  // Update text immediately for real-time display
                  explanationText = explanationText + delta;
                }
              } catch (e) {
                // Skip invalid JSON lines (might be empty or malformed)
                if (data.trim() !== '') {
                  console.warn('Failed to parse SSE data:', data);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      explanationError = err instanceof Error ? err.message : 'Грешка приликом генерисања објашњења.';
    } finally {
      explanationLoading = false;
    }
  }

  function saveApiKey() {
    setStoredApiKey(openaiApiKey);
    localStorage.setItem(STORAGE_KEY_AUTO_EXPLANATION, String(autoExplanation));
    localStorage.setItem(STORAGE_KEY_EXPLANATION_LANG, explanationLang);
    showApiKeyModal = false;
  }

  function clearApiKey() {
    openaiApiKey = '';
    setStoredApiKey('');
    showApiKeyModal = false;
  }

  function toggleAutoExplanation() {
    autoExplanation = !autoExplanation;
    localStorage.setItem(STORAGE_KEY_AUTO_EXPLANATION, String(autoExplanation));
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
    const selectedOption = shuffledOptions[i];

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
      } else {
        // Fetch explanation for wrong answer if API key is set and auto-explanation is enabled
        if (!examMode && bank && selectedOption && autoExplanation) {
          fetchExplanation(bank.questions[idx], selectedOption.text);
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
            {#if openaiApiKey}
              <button class="ai-badge ai-enabled" title="AI објашњења су укључена" on:click={() => showApiKeyModal = true} type="button">AI ✓</button>
            {:else}
              <button class="ai-badge ai-disabled" title="Подесите API кључ за AI објашњења" on:click={() => showApiKeyModal = true} type="button">Enable AI</button>
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

              {#if !examMode && selectedIndex !== null && !shuffledOptions[selectedIndex]?.isCorrect}
                {#if explanationQuestionId === bank.questions[idx].id}
                  {#if explanationError}
                    <div class="explanation-error">
                      <p>{explanationError}</p>
                      {#if !openaiApiKey}
                        <button class="btn btn-info" on:click={() => showApiKeyModal = true}>Подеси API кључ</button>
                      {/if}
                    </div>
                  {:else if explanationText || explanationLoading}
                    <div class="explanation">
                      <div class="explanation-header">
                        Објашњење:
                        {#if explanationLoading}
                          <span class="loading-indicator"> (генеришем...)</span>
                        {/if}
                      </div>
                      {#if explanationText}
                        <div class="explanation-text">{@html explanationHtml}</div>
                      {:else}
                        <div class="explanation-loading">Генеришем објашњење...</div>
                      {/if}
                    </div>
                  {/if}
                {/if}
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

{#if showApiKeyModal}
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="API Key Settings" tabindex="-1" on:click={() => showApiKeyModal = false} on:keydown={(e) => e.key === 'Escape' && (showApiKeyModal = false)}>
    <div class="modal-content" on:click|stopPropagation role="none">
      <div class="modal-header">
        <h2>Подешавања ChatGPT објашњења</h2>
        <button class="modal-close" on:click={() => showApiKeyModal = false} aria-label="Затвори">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-info">
          За генерисање објашњења неправилних одговора потребан је OpenAI API кључ.
          Кључ се чува локално у вашем претраживачу и не шаље се на сервер.
        </p>
        <label for="api-key-input">OpenAI API кључ:</label>
        <input
          id="api-key-input"
          type="password"
          class="api-key-input"
          placeholder="sk-..."
          bind:value={openaiApiKey}
          on:keydown={(e) => e.key === 'Enter' && saveApiKey()}
        />
        <div class="setting-toggle">
          <label class="toggle-label" for="auto-explanation-toggle">
            <input
              id="auto-explanation-toggle"
              type="checkbox"
              checked={autoExplanation}
              on:change={toggleAutoExplanation}
            />
            <span class="toggle-text">Аутоматски генериши објашњење за неправилне одговоре</span>
          </label>
          <p class="setting-hint">Ако је искључено, објашњење ће се генерисати само када кликнете на дугме "Објасни одговор".</p>
        </div>
        <div class="setting-group">
          <label for="explanation-lang-select">Језик објашњења:</label>
          <select id="explanation-lang-select" class="lang-select" bind:value={explanationLang}>
            <option value="sr">Српски</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
          <p class="setting-hint">Изаберите језик на коме ће AI генерисати објашњења.</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" on:click={saveApiKey}>Сачувај</button>
          <button class="btn btn-neutral" on:click={() => showApiKeyModal = false}>Откажи</button>
          {#if openaiApiKey}
            <button class="btn btn-warning" on:click={clearApiKey}>Обриши кључ</button>
          {/if}
        </div>
        <p class="modal-help">
          Можете добити API кључ на <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a>
        </p>
      </div>
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
  .ai-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; transition: background 0.2s; }
  .ai-badge.ai-enabled { background: #10b981; color: white; }
  .ai-badge.ai-enabled:hover { background: #059669; }
  .ai-badge.ai-disabled { background: #64748b; color: white; }
  .ai-badge.ai-disabled:hover { background: #475569; }

  /* Explanation styles */
  .explanation-loading { padding: 12px; background: #f0f9ff; color: #075985; border-radius: 4px; font-size: 14px; }
  .loading-indicator { font-size: 12px; font-weight: normal; color: #64748b; }
  .explanation-error { padding: 12px; background: #fef2f2; color: #991b1b; border-radius: 4px; font-size: 14px; }
  .explanation-error p { margin: 0 0 8px 0; }
  .explanation { padding: 0; padding-left: 16px; background: transparent; border-left: 4px solid #eab308; border-radius: 0; margin-top: 16px; }
  .explanation-header { font-weight: 600; color: #eab308; margin-bottom: 8px; font-size: 14px; }
  .explanation-text { color: var(--text); font-size: 14px; line-height: 1.6; }
  .explanation-text :global(h1), .explanation-text :global(h2), .explanation-text :global(h3) { color: var(--text); font-weight: 600; margin-top: 12px; margin-bottom: 8px; }
  .explanation-text :global(h1) { font-size: 18px; }
  .explanation-text :global(h2) { font-size: 16px; }
  .explanation-text :global(h3) { font-size: 15px; }
  .explanation-text :global(p) { margin: 8px 0; }
  .explanation-text :global(ul), .explanation-text :global(ol) { margin: 8px 0; padding-left: 24px; }
  .explanation-text :global(li) { margin: 4px 0; }
  .explanation-text :global(strong) { font-weight: 600; color: var(--text); }
  .explanation-text :global(em) { font-style: italic; }
  .explanation-text :global(code) { background: var(--btn-bg); padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 13px; }
  .explanation-text :global(.katex) { font-size: 1.1em; }
  .explanation-text :global(.katex-display) { margin: 1em 0; overflow-x: auto; overflow-y: hidden; }
  .explanation-text :global(.katex-display > .katex) { display: inline-block; text-align: initial; }

  /* Modal styles */
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
  .modal-content { background: var(--card); border-radius: 8px; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,.2); }
  .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
  .modal-header h2 { margin: 0; font-size: 18px; }
  .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text); padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
  .modal-close:hover { background: var(--btn-bg); border-radius: 4px; }
  .modal-body { padding: 20px; }
  .modal-info { margin: 0 0 16px 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .modal-body label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; }
  .api-key-input { width: 100%; padding: 10px; border: 1px solid var(--btn-border); border-radius: 4px; background: var(--btn-bg); color: var(--text); font-size: 14px; font-family: monospace; margin-bottom: 16px; }
  .api-key-input:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
  .setting-toggle { margin: 20px 0; padding: 16px; background: var(--btn-bg); border-radius: 4px; border: 1px solid var(--btn-border); }
  .setting-toggle .toggle-label { display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 8px; }
  .setting-toggle input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
  .setting-toggle .toggle-text { font-size: 14px; font-weight: 500; color: var(--text); }
  .setting-group { margin: 20px 0; padding: 16px; background: var(--btn-bg); border-radius: 4px; border: 1px solid var(--btn-border); }
  .setting-group label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; }
  .lang-select { width: 100%; padding: 10px; border: 1px solid var(--btn-border); border-radius: 4px; background: var(--bg); color: var(--text); font-size: 14px; margin-bottom: 8px; }
  .lang-select:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
  .setting-hint { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4; }
  .modal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .modal-help { margin-top: 16px; font-size: 12px; color: var(--muted); }
  .modal-help a { color: var(--accent); text-decoration: underline; }
</style>
