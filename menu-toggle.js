// menu-toggle.js

document.addEventListener('DOMContentLoaded', function() {
  const btn    = document.querySelector('.menu-toggle');
  const header = document.querySelector('header');

  if (!btn || !header) return;  // safeguard

  btn.addEventListener('click', function() {
    header.classList.toggle('nav-open');
  });
});
