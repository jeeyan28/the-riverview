const hamburger = document.getElementById('hamburger');
const nav = document.querySelector('nav');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active'); // Animate hamburger to X
    nav.classList.toggle('active');       // Show/hide menu
});