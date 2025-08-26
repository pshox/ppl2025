// Theme management utilities
// Comments in English per project requirement

import { writable, type Writable } from 'svelte/store';

type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'ppl.theme.mode';

function getSystemScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeClass(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  const effective = mode === 'system' ? getSystemScheme() : mode;
  root.classList.add(effective === 'dark' ? 'theme-dark' : 'theme-light');

  // Update meta theme-color to match background for better PWA feel
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  try {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (meta && bg) meta.content = bg;
  } catch {
    // ignore errors reading computed styles
  }
}

export const themeMode: Writable<ThemeMode> = writable('system');

let mediaQueryList: MediaQueryList | null = null;

function handleSystemChange() {
  // Re-apply only if current mode is system
  let current: ThemeMode;
  const unsubscribe = themeMode.subscribe((m) => (current = m));
  unsubscribe();
  if (current === 'system') applyThemeClass('system');
}

export function initTheme() {
  if (typeof window === 'undefined') return;
  const saved = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) || 'system';
  themeMode.set(saved);
  applyThemeClass(saved);

  // Subscribe to store changes
  themeMode.subscribe((m) => {
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
    applyThemeClass(m);
  });

  // Listen to system changes when in system mode
  if (window.matchMedia) {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQueryList.addEventListener?.('change', handleSystemChange);
  }
}

export function setTheme(mode: ThemeMode) {
  themeMode.set(mode);
}

export function getEffectiveTheme(): 'light' | 'dark' {
  let current: ThemeMode = 'system';
  const unsubscribe = themeMode.subscribe((m) => (current = m));
  unsubscribe();
  return current === 'system' ? getSystemScheme() : current;
}
