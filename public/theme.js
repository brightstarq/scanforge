'use strict';


const STORAGE_KEY = 'scandrift-theme';
const ROOT = document.documentElement;

function applyTheme(theme) {
  ROOT.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);

  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const isDark = theme === 'dark';
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
  btn.querySelector('.theme-txt').textContent  = isDark ? 'Light' : 'Dark';
}

function toggleTheme() {
  const current = ROOT.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Anti-flash — runs before DOMContentLoaded
(function() {
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  ROOT.setAttribute('data-theme', saved);
})();

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(saved);
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
});