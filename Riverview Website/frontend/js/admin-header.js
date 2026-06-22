const hamburger = document.querySelector('.hamburger');
const nav = document.querySelector('nav');
const overlay = document.querySelector('.overlay');
const closeBtn = document.querySelector('.close-btn');

function openNav() {
  nav.classList.add('active');
  overlay.classList.add('active');
  hamburger.setAttribute('aria-expanded', true);
}

function closeNav() {
  nav.classList.remove('active');
  overlay.classList.remove('active');
  hamburger.setAttribute('aria-expanded', false);
}

// Event listeners
hamburger.addEventListener('click', openNav);
overlay.addEventListener('click', closeNav);
closeBtn.addEventListener('click', closeNav);