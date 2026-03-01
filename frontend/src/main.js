/**
 * Snowball — Main Application Entry Point
 *
 * Renders the landing page and connects to the backend API
 * to verify server health. This module acts as the central
 * orchestrator for the frontend application.
 */

import './style.css';

/**
 * Render the full application shell into the #app container.
 * Includes navigation, hero section, feature cards, and
 * a live backend status indicator.
 */
function renderApp() {
  const app = document.querySelector('#app');

  app.innerHTML = `
    <!-- Navigation -->
    <nav class="nav" id="main-nav">
      <div class="container">
        <div class="nav-brand">
          <span class="icon">❄️</span>
          <span>Snowball</span>
        </div>
        <ul class="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#status">Status</a></li>
          <li><a href="https://github.com" target="_blank" rel="noopener">GitHub</a></li>
        </ul>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="hero" id="hero">
      <div class="hero-content">
        <div class="hero-badge">✨ Project Initialized</div>
        <h1>Build Something Amazing with Snowball</h1>
        <p>
          A clean, production-ready full-stack scaffold with a modern frontend
          and a structured Express backend — ready for your next big idea.
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="btn-get-started">Get Started</button>
          <button class="btn btn-secondary" id="btn-learn-more">Learn More</button>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features" id="features">
      <div class="container">
        <div class="features-header">
          <h2>Built for Speed & Scale</h2>
          <p>A clean architecture that keeps your codebase maintainable as it grows.</p>
        </div>
        <div class="features-grid">
          <div class="card" id="card-frontend">
            <div class="feature-icon">⚡</div>
            <h3>Vite Frontend</h3>
            <p>Lightning-fast hot module replacement, optimized builds, and a modern developer experience powered by Vite.</p>
          </div>
          <div class="card" id="card-backend">
            <div class="feature-icon">🛡️</div>
            <h3>Express Backend</h3>
            <p>Structured API routes, middleware support, and ready-to-connect database layers for robust server logic.</p>
          </div>
          <div class="card" id="card-architecture">
            <div class="feature-icon">🏗️</div>
            <h3>Clean Architecture</h3>
            <p>Strict separation of frontend and backend with modular, well-organized code that scales with your team.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Status Section -->
    <section class="status" id="status">
      <div class="container">
        <div class="card status-card" id="status-card">
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>Checking backend...</span>
          </div>
          <h2>Backend Connection</h2>
          <p>API Status: <span id="api-status">Connecting...</span></p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer" id="main-footer">
      <div class="container">
        <p>&copy; ${new Date().getFullYear()} Snowball. Built with ❄️ and good architecture.</p>
      </div>
    </footer>
  `;

  // Bind event listeners after rendering
  bindEvents();

  // Check backend health
  checkBackendHealth();
}

/**
 * Set up interactive event listeners for buttons and navigation.
 */
function bindEvents() {
  const btnGetStarted = document.getElementById('btn-get-started');
  const btnLearnMore = document.getElementById('btn-learn-more');

  btnGetStarted?.addEventListener('click', () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  });

  btnLearnMore?.addEventListener('click', () => {
    document.getElementById('status')?.scrollIntoView({ behavior: 'smooth' });
  });
}

/**
 * Ping the backend /api/health endpoint and update the status indicator.
 * Gracefully handles the case where the backend is not running.
 */
async function checkBackendHealth() {
  const statusEl = document.getElementById('api-status');
  const indicatorEl = document.querySelector('.status-indicator');

  try {
    const response = await fetch('/api/health');
    const data = await response.json();

    if (response.ok && data.status === 'ok') {
      statusEl.textContent = '✅ Backend is running';
      statusEl.style.color = 'var(--color-success)';
      indicatorEl.innerHTML = '<span class="status-dot"></span><span>All systems operational</span>';
    } else {
      throw new Error('Unexpected response');
    }
  } catch {
    statusEl.textContent = '⏳ Backend not connected';
    statusEl.style.color = 'var(--color-warning)';
    indicatorEl.innerHTML =
      '<span class="status-dot" style="background: var(--color-warning);"></span>' +
      '<span style="color: var(--color-warning);">Start the backend to connect</span>';
  }
}

// --- Bootstrap the application ---
renderApp();
