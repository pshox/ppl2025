import './styles.css';
import App from './App.svelte';
import { initTheme } from './theme';

initTheme();

const app = new App({
  target: document.getElementById('app') as HTMLElement
});

export default app;
