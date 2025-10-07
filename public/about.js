const aboutHero = document.getElementById('aboutHero');
const aboutDescription = document.getElementById('aboutDescription');
const aboutGallery = document.getElementById('aboutGallery');
const aboutGalleryModal = document.getElementById('aboutGalleryModal');
const aboutGalleryModalGrid = document.getElementById('aboutGalleryModalGrid');
const aboutGalleryModalClose = aboutGalleryModal ? aboutGalleryModal.querySelector('.about-gallery-modal__close') : null;
const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';
let aboutGalleryData = [];

function applyAboutContent(content) {
  const galleryItems = content && Array.isArray(content.gallery) ? content.gallery : [];
  renderAboutGallery(galleryItems);
  renderAboutGalleryModal(galleryItems);

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

function renderAboutGallery(items) {
  if (!aboutGallery) {
    return;
  }

  aboutGalleryData = Array.isArray(items) ? items.filter((item) => item && item.imageData) : [];
  aboutGallery.innerHTML = '';

  if (!aboutGalleryData.length) {
    const empty = document.createElement('p');
    empty.classList.add('about-gallery__empty');
    empty.textContent = 'Galeria w przygotowaniu.';
    aboutGallery.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const previewLimit = 7;
  const previewItems = aboutGalleryData.slice(0, previewLimit);

  previewItems.forEach((item, index) => {
    const figure = document.createElement('figure');
    figure.classList.add('about-gallery__item');

    const image = document.createElement('img');
    image.src = item.imageData;
    image.alt = `Galeria Chachor Piecze zdjęcie ${index + 1}`;
    figure.appendChild(image);

    fragment.appendChild(figure);
  });

  if (aboutGalleryData.length > previewLimit) {
    const moreTile = document.createElement('button');
    moreTile.type = 'button';
    moreTile.classList.add('about-gallery__item', 'about-gallery__more');
    moreTile.dataset.role = 'gallery-see-more';
    moreTile.setAttribute('aria-label', 'Zobacz więcej zdjęć');
    moreTile.innerHTML = `
      <span class="about-gallery__more-label">Zobacz więcej</span>
      <span class="about-gallery__more-count">(${aboutGalleryData.length})</span>
    `;
    fragment.appendChild(moreTile);
  }

  aboutGallery.appendChild(fragment);
}

function renderAboutGalleryModal(items) {
  if (!aboutGalleryModalGrid) {
    return;
  }
  aboutGalleryModalGrid.innerHTML = '';
  const list = Array.isArray(items) ? items.filter((item) => item && item.imageData) : [];
  if (!list.length) {
    const empty = document.createElement('p');
    empty.classList.add('about-gallery-modal__empty');
    empty.textContent = 'Galeria w przygotowaniu.';
    aboutGalleryModalGrid.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((item, index) => {
    const figure = document.createElement('figure');
    figure.classList.add('about-gallery-modal__item');
    const image = document.createElement('img');
    image.src = item.imageData;
    image.alt = `Zdjęcie ${index + 1} z pełnej galerii`;
    figure.appendChild(image);
    fragment.appendChild(figure);
  });
  aboutGalleryModalGrid.appendChild(fragment);
}

function openAboutGalleryModal() {
  if (!aboutGalleryModal) {
    return;
  }
  aboutGalleryModal.classList.add('open');
  aboutGalleryModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('about-gallery-modal-open');
}

function closeAboutGalleryModal() {
  if (!aboutGalleryModal) {
    return;
  }
  aboutGalleryModal.classList.remove('open');
  aboutGalleryModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('about-gallery-modal-open');
}

if (aboutGallery) {
  aboutGallery.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest('[data-role="gallery-see-more"]')
      : null;
    if (!button) {
      return;
    }
    if (!aboutGalleryData.length) {
      return;
    }
    renderAboutGalleryModal(aboutGalleryData);
    openAboutGalleryModal();
  });
}

if (aboutGalleryModal) {
  aboutGalleryModal.addEventListener('click', (event) => {
    if (event.target === aboutGalleryModal) {
      closeAboutGalleryModal();
    }
  });
}

if (aboutGalleryModalClose) {
  aboutGalleryModalClose.addEventListener('click', closeAboutGalleryModal);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && aboutGalleryModal && aboutGalleryModal.classList.contains('open')) {
    closeAboutGalleryModal();
  }
});

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
