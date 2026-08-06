import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const container = document.getElementById('viz-root');
if (!container) {
  throw new Error('Mount point #viz-root is missing from index.html');
}

// Remove the pre-hydration splash before React takes over the container.
container.replaceChildren();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
