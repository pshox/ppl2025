import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import sveltePreprocess from 'svelte-preprocess';

// NOTE: Set "base" for GitHub Pages from repo name
const repoName = 'ppl2025';

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess()
    })
  ],
  base: `/${repoName}/`,
  publicDir: 'public'
});
