const aboutHero = document.getElementById('aboutHero');
const aboutDescription = document.getElementById('aboutDescription');
const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';

function applyAboutContent(content) {
  if (!aboutHero || !aboutDescription) {
    return;
  }

  const text = content && typeof content.heroText === 'string' && content.heroText.trim()
    ? content.heroText.trim()
    : DEFAULT_ABOUT_TEXT;
  aboutDescription.textContent = text;

  const imageData = content && typeof content.heroImageData === 'string' ? content.heroImageData : '';
  if (imageData) {
    aboutHero.style.setProperty('--about-hero-image', `url("${imageData}")`);
    aboutHero.classList.add('about-hero--with-image');
  } else {
    aboutHero.style.removeProperty('--about-hero-image');
    aboutHero.classList.remove('about-hero--with-image');
  }
}

async function loadAboutContent() {
  try {
    const res = await fetch('/api/about');
    if (!res.ok) {
      throw new Error('Request failed');
    }
    const data = await res.json();
    applyAboutContent(data);
  } catch (err) {
    console.error('Błąd pobierania sekcji O nas:', err);
    applyAboutContent(null);
  }
}

loadAboutContent();
