/**
 * Entry point. Everything else is an ES module imported from here, so there is
 * no build step and no bundler.
 */
import { startApp } from '../assets/js/app.js';

startApp().catch((error) => {
  const main = document.getElementById('main');
  if (main) {
    main.textContent = 'FORKSPACE could not start in this browser. Check the browser console for details.';
  }
  // eslint-disable-next-line no-console
  console.error('FORKSPACE failed to start:', error);
});
