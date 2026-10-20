import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import React from 'react';
import ReactDOM from 'react-dom/client';

import '../../src/ui/base.css';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Side panel root element is missing.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
