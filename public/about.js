const aboutHero = document.getElementById('aboutHero');
const aboutDescription = document.getElementById('aboutDescription');
const aboutGallery = document.getElementById('aboutGallery');
const aboutGalleryModal = document.getElementById('aboutGalleryModal');
const aboutGalleryModalGrid = document.getElementById('aboutGalleryModalGrid');
const aboutGalleryModalClose = aboutGalleryModal ? aboutGalleryModal.querySelector('.about-gallery-modal__close') : null;
const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';
const INITIAL_PREVIEW_COUNT = 1;
const PREVIEW_COUNT_AFTER_LOAD = 7;
let aboutGalleryData = [];
let aboutGalleryTotal = 0;
let aboutGalleryLoadedAll = false;
let aboutGalleryLoading = false;

function applyAboutContent(content) {
  updateGalleryState(content);
  renderAboutGallery();
  renderAboutGalleryModal();

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

function renderAboutGallery() {
  if (!aboutGallery) {
    return;
  }

  aboutGallery.innerHTML = '';

  if (!aboutGalleryData.length) {
    const empty = document.createElement('p');
    empty.classList.add('about-gallery__empty');
    empty.textContent = 'Galeria w przygotowaniu.';
    aboutGallery.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const previewLimit = aboutGalleryLoadedAll
    ? Math.min(PREVIEW_COUNT_AFTER_LOAD, aboutGalleryData.length)
    : Math.min(INITIAL_PREVIEW_COUNT, aboutGalleryData.length);
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

  const totalForPreview = aboutGalleryLoadedAll ? aboutGalleryData.length : aboutGalleryTotal;
  const remainingCount = aboutGalleryLoadedAll
    ? Math.max(aboutGalleryData.length - previewItems.length, 0)
    : Math.max(aboutGalleryTotal - previewItems.length, 0);

  if (!aboutGalleryLoadedAll) {
    const baseSkeletonLimit = Math.max(PREVIEW_COUNT_AFTER_LOAD - previewItems.length, 2);
    const skeletonCount = aboutGalleryLoading
      ? Math.min(Math.max(remainingCount, baseSkeletonLimit), 6)
      : Math.min(Math.max(remainingCount, 0), Math.min(baseSkeletonLimit, 3));
    appendGallerySkeletons(fragment, skeletonCount, 'about-gallery__item');
  }

  if (!aboutGalleryLoadedAll && !aboutGalleryLoading && totalForPreview > previewItems.length && remainingCount > 0) {
    const moreTile = document.createElement('button');
    moreTile.type = 'button';
    moreTile.classList.add('about-gallery__item', 'about-gallery__more');
    moreTile.dataset.role = 'gallery-see-more';
    moreTile.setAttribute('aria-label', 'Zobacz więcej zdjęć');
    moreTile.innerHTML = `
      <span class="about-gallery__more-label">Zobacz więcej</span>
      <span class="about-gallery__more-count">(+${remainingCount})</span>
    `;
    fragment.appendChild(moreTile);
  }

  aboutGallery.appendChild(fragment);
}

function renderAboutGalleryModal() {
  if (!aboutGalleryModalGrid) {
    return;
  }
  aboutGalleryModalGrid.innerHTML = '';
  const list = aboutGalleryData;
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

  if (!aboutGalleryLoadedAll) {
    appendGallerySkeletons(fragment, 4, 'about-gallery-modal__item');
  }

  aboutGalleryModalGrid.appendChild(fragment);
}

function updateGalleryState(content) {
  const items = buildGalleryItems(content);
  aboutGalleryData = items;
  const hasGalleryCount = content && typeof content.galleryCount === 'number';
  aboutGalleryTotal = hasGalleryCount ? content.galleryCount : items.length;
  const receivedGallery = content && Array.isArray(content.gallery) ? content.gallery : [];
  aboutGalleryLoadedAll = receivedGallery.length >= aboutGalleryTotal || aboutGalleryTotal <= items.length;
}

function buildGalleryItems(content) {
  const gallery = content && Array.isArray(content.gallery)
    ? content.gallery.filter((item) => item && item.imageData)
    : [];

  const list = gallery.slice();
  const heroImage = content && content.heroImageData ? content.heroImageData : '';

  if (heroImage) {
    const existingIndex = list.findIndex((item) => item && item.imageData === heroImage);
    if (existingIndex > 0) {
      const [heroItem] = list.splice(existingIndex, 1);
      list.unshift(heroItem);
    } else if (existingIndex === -1) {
      list.unshift({ _id: null, imageData: heroImage });
    }
  }

  return list;
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

async function handleGallerySeeMoreClick() {
  if (aboutGalleryLoading) {
    return;
  }

  let fetchFailed = false;

  if (!aboutGalleryLoadedAll) {
    try {
      aboutGalleryLoading = true;
      renderAboutGallery();
      const res = await fetch('/api/about?includeGallery=1');
      if (!res.ok) {
        throw new Error('Nie udało się załadować galerii');
      }
      const data = await res.json();
      updateGalleryState(data);
      renderAboutGallery();
      renderAboutGalleryModal();
    } catch (err) {
      console.error('Błąd ładowania pełnej galerii:', err);
      fetchFailed = true;
    } finally {
      aboutGalleryLoading = false;
    }
  }

  if (fetchFailed || !aboutGalleryData.length) {
    renderAboutGallery();
    return;
  }

  renderAboutGalleryModal();
  openAboutGalleryModal();

  if (!aboutGalleryLoadedAll) {
    renderAboutGallery();
  }
}

if (aboutGallery) {
  aboutGallery.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest('[data-role="gallery-see-more"]')
      : null;
    if (!button) {
      return;
    }
    handleGallerySeeMoreClick();
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
    const res = await fetch('/api/about?includeGallery=0');
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

function appendGallerySkeletons(target, count, baseClass = 'about-gallery__item') {
  const total = Number(count) || 0;
  const clamped = Math.max(Math.min(total, 6), 0);
  for (let i = 0; i < clamped; i += 1) {
    const skeleton = document.createElement('div');
    skeleton.classList.add(baseClass, `${baseClass}--skeleton`);
    target.appendChild(skeleton);
  }
}

loadAboutContent();
