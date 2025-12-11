
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
const fallbackLoader = document.getElementById('fallback-loader');

// Global error handler to ensure the loader doesn't get stuck infinitely
// if the app crashes on deployment (Netlify) due to missing environment variables or build errors.
window.addEventListener('error', (event) => {
  if (fallbackLoader && !fallbackLoader.classList.contains('hidden')) {
    fallbackLoader.innerHTML = `
      <div style="color: #ef4444; text-align: center; padding: 20px;">
        <p style="font-family: monospace; font-size: 12px;">CRITICAL SYSTEM FAILURE</p>
        <p style="font-size: 10px; margin-top: 5px; opacity: 0.7;">${event.message}</p>
      </div>
    `;
    // Optionally hide it after a delay or keep it for debug
  }
});

if (!rootElement) {
  console.error("Critical Failure: Root element not found.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    
    // Smoothly remove loader once React initializes
    if (fallbackLoader) {
      setTimeout(() => {
        fallbackLoader.classList.add('hidden');
      }, 500);
    }
  } catch (error) {
    console.error("Runtime Exception during hydration:", error);
    if (fallbackLoader) fallbackLoader.style.display = 'none';
  }
}
