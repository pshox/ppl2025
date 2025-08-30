// Utilities for tracking wrong answers across subjects
// Stored in localStorage; resilient to duplicates

import type { SubjectId } from './subjects';

export const ERRORS_SUBJECT_ID = '__errors__' as const;

const STORAGE_KEY = 'ppl.errors.v1';

export type ErrorItem = {
  subjectId: SubjectId;
  questionId: string;
};

function loadRaw(): ErrorItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x === 'object' && 'subjectId' in x && 'questionId' in x) as ErrorItem[];
  } catch {
    return [];
  }
}

function saveRaw(items: ErrorItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

export function getAllErrors(): ErrorItem[] {
  const items = loadRaw();
  // Deduplicate by subjectId+questionId
  const seen = new Set<string>();
  const uniq: ErrorItem[] = [];
  for (const it of items) {
    const key = `${it.subjectId}::${it.questionId}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push(it);
    }
  }
  if (uniq.length !== items.length) saveRaw(uniq);
  return uniq;
}

export function addError(subjectId: SubjectId, questionId: string) {
  const items = getAllErrors();
  const key = `${subjectId}::${questionId}`;
  const exists = items.some((i) => `${i.subjectId}::${i.questionId}` === key);
  if (!exists) {
    items.push({ subjectId, questionId });
    saveRaw(items);
  }
}

export function removeError(subjectId: SubjectId, questionId: string) {
  const items = getAllErrors();
  const filtered = items.filter((i) => !(i.subjectId === subjectId && i.questionId === questionId));
  saveRaw(filtered);
}

export function clearAllErrors() {
  saveRaw([]);
}

export function getErrorsCount(): number {
  return getAllErrors().length;
}

export function getErrorsBySubject(): Map<SubjectId, Set<string>> {
  const map = new Map<SubjectId, Set<string>>();
  for (const { subjectId, questionId } of getAllErrors()) {
    if (!map.has(subjectId)) map.set(subjectId, new Set());
    map.get(subjectId)!.add(questionId);
  }
  return map;
}
