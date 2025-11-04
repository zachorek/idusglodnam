const aboutHero = document.getElementById('aboutHero');
const aboutDescription = document.getElementById('aboutDescription');
const galleryPreview = document.getElementById('aboutGalleryPreview');
const galleryModal = document.getElementById('aboutGalleryModal');
const galleryModalGrid = galleryModal ? galleryModal.querySelector('#aboutGalleryModalGrid') : null;
const galleryModalClose = galleryModal ? galleryModal.querySelector('.about-gallery-modal__close') : null;
const zoom = document.getElementById('aboutGalleryZoom');
const zoomImage = zoom ? zoom.querySelector('.about-gallery-zoom__image') : null;
const zoomClose = zoom ? zoom.querySelector('.about-gallery-zoom__close') : null;
const socialFeed = document.getElementById('aboutSocialFeed');

const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';
const GALLERY_PREVIEW_LIMIT = 3;
const SOCIAL_FEED_LIMIT = 3;

let galleryData = [];
let lastPreviewTrigger = null;
let lastModalTrigger = null;
let activeGalleryIndex = -1;
let modalRendered = false;
let previewRemainderHandle = null;
let previewRemainderScheduled = false;
let previewRemainderUsesIdle = false;

function toggleModal(modal, isOpen, bodyClass, clearMediaOnClose = false) {
  if (!modal) {
    return;
  }

  const open = Boolean(isOpen);
  modal.classList.toggle('open', open);
  modal.setAttribute('aria-hidden', open ? 'false' : 'true');

  if (bodyClass) {
    document.body.classList.toggle(bodyClass, open);
  }

  if (!open && clearMediaOnClose) {
    const media = modal.querySelectorAll('img');
    media.forEach((img) => {
      img.classList.remove('is-active');
      img.removeAttribute('src');
      img.removeAttribute('alt');
    });
  }
}

function cancelScheduledPreviewRemainder() {
  if (!previewRemainderScheduled || previewRemainderHandle === null) {
    return;
  }

  if (previewRemainderUsesIdle && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(previewRemainderHandle);
  } else {
    clearTimeout(previewRemainderHandle);
  }

  previewRemainderHandle = null;
  previewRemainderScheduled = false;
  previewRemainderUsesIdle = false;
}

function schedulePreviewRemainder(previewLimit) {
  if (previewRemainderScheduled || !galleryPreview) {
    return;
  }

  const renderRemaining = () => {
    previewRemainderHandle = null;
    previewRemainderScheduled = false;
    previewRemainderUsesIdle = false;

    if (!galleryPreview) {
      return;
    }

    const existing = new Set(
      Array.from(galleryPreview.querySelectorAll('[data-role="about-gallery-item"]'))
        .map((node) => Number(node.getAttribute('data-gallery-index')))
    );

    const fragment = document.createDocumentFragment();
    const limit = Math.min(previewLimit, galleryData.length);
    for (let i = 1; i < limit; i += 1) {
      if (existing.has(i)) {
        continue;
      }
      const skeleton = galleryPreview.querySelector(`[data-role="about-gallery-item-skeleton"][data-gallery-index="${i}"]`);
      if (skeleton) {
        skeleton.remove();
      }
      fragment.appendChild(buildPreviewButton(galleryData[i], i));
    }

    if (fragment.childNodes.length) {
      galleryPreview.appendChild(fragment);
    }

    if (activeGalleryIndex >= 0) {
      setActivePreview(activeGalleryIndex);
    }
  };

  previewRemainderScheduled = true;

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    previewRemainderUsesIdle = true;
    previewRemainderHandle = window.requestIdleCallback(renderRemaining, { timeout: 500 });
  } else {
    previewRemainderUsesIdle = false;
    previewRemainderHandle = setTimeout(renderRemaining, 0);
  }
}

function resolveGalleryItemSrc(item) {
  if (!item) {
    return '';
  }
  if (typeof item.imageUrl === 'string' && item.imageUrl.trim()) {
    return item.imageUrl.trim();
  }
  if (typeof item.imageData === 'string' && item.imageData.trim()) {
    return item.imageData.trim();
  }
  return '';
}

function normalizeGallery(content) {
  const gallery = Array.isArray(content && content.gallery) ? content.gallery : [];
  return gallery
    .map((item, index) => {
      const src = resolveGalleryItemSrc(item);
      if (!src) {
        return null;
      }
      const caption = item && typeof item.caption === 'string' ? item.caption.trim() : '';
      let created = 0;
      if (item && item.createdAt) {
        const parsed = new Date(item.createdAt).getTime();
        if (Number.isFinite(parsed)) {
          created = parsed;
        }
      }
      return {
        id: item && item._id ? String(item._id) : `gallery-${index}`,
        imageSrc: src,
        caption,
        createdAt: created,
        order: index
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return b.createdAt - a.createdAt;
      }
      if (a.createdAt) {
        return -1;
      }
      if (b.createdAt) {
        return 1;
      }
      return b.order - a.order;
    });
}

function applyAboutContent(content) {
  const heroText = content && typeof content.heroText === 'string' && content.heroText.trim()
    ? content.heroText.trim()
    : DEFAULT_ABOUT_TEXT;

  if (aboutDescription) {
    aboutDescription.textContent = heroText;
  }

  const heroImage = (() => {
    if (!content) {
      return '';
    }
    if (typeof content.heroImageUrl === 'string' && content.heroImageUrl.trim()) {
      return content.heroImageUrl.trim();
    }
    if (typeof content.heroImageData === 'string' && content.heroImageData.trim()) {
      return content.heroImageData.trim();
    }
    return '';
  })();
  if (aboutHero) {
    if (heroImage) {
      const sanitizedImage = heroImage.replace(/"/g, '\\"');
      aboutHero.style.setProperty('--about-hero-image', `url("${sanitizedImage}")`);
      aboutHero.classList.add('about-hero--with-image');
    } else {
      aboutHero.style.removeProperty('--about-hero-image');
      aboutHero.classList.remove('about-hero--with-image');
    }
  }

  galleryData = normalizeGallery(content);
  if (galleryData.length === 0) {
    activeGalleryIndex = -1;
  } else if (!Number.isFinite(activeGalleryIndex) || activeGalleryIndex < 0) {
    activeGalleryIndex = -1;
  } else if (activeGalleryIndex >= galleryData.length) {
    activeGalleryIndex = galleryData.length - 1;
  }

  cancelScheduledPreviewRemainder();
  modalRendered = false;
  if (galleryModalGrid) {
    galleryModalGrid.innerHTML = '';
  }

  renderGalleryPreview();
}

function renderGallerySkeletons(count = GALLERY_PREVIEW_LIMIT) {
  if (!galleryPreview) {
    return;
  }
  cancelScheduledPreviewRemainder();
  const total = Math.max(0, Math.min(Number(count) || 0, GALLERY_PREVIEW_LIMIT));
  galleryPreview.innerHTML = '';
  for (let i = 0; i < total; i += 1) {
    const skeleton = document.createElement('div');
    skeleton.classList.add('about-gallery__item', 'about-gallery__item--skeleton');
    galleryPreview.appendChild(skeleton);
  }
}

function renderGalleryPreview() {
  if (!galleryPreview) {
    return;
  }

  cancelScheduledPreviewRemainder();
  galleryPreview.innerHTML = '';

  if (!galleryData.length) {
    const empty = document.createElement('p');
    empty.classList.add('about-gallery__empty');
    empty.textContent = 'Galeria w przygotowaniu.';
    galleryPreview.appendChild(empty);
    ensureSocialFeedLoaded();
    return;
  }

  const previewCount = Math.min(galleryData.length, GALLERY_PREVIEW_LIMIT);
  const firstButton = buildPreviewButton(galleryData[0], 0);
  galleryPreview.appendChild(firstButton);

  if (previewCount > 1) {
    for (let i = 1; i < previewCount; i += 1) {
      const skeleton = document.createElement('div');
      skeleton.classList.add('about-gallery__item', 'about-gallery__item--skeleton');
      skeleton.dataset.galleryIndex = String(i);
      skeleton.dataset.role = 'about-gallery-item-skeleton';
      galleryPreview.appendChild(skeleton);
    }
    schedulePreviewRemainder(previewCount);
  }

  if (activeGalleryIndex === 0) {
    setActivePreview(activeGalleryIndex);
  } else if (activeGalleryIndex < 0) {
    setActivePreview(-1);
  }

  ensureSocialFeedLoaded();
}

function renderGalleryModal() {
  if (!galleryModalGrid) {
    return;
  }

  modalRendered = true;
  galleryModalGrid.innerHTML = '';

  if (!galleryData.length) {
    galleryModalGrid.appendChild(buildModalMessage('Galeria w przygotowaniu.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  galleryData.forEach((item, index) => {
    fragment.appendChild(buildModalButton(item, index));
  });
  galleryModalGrid.appendChild(fragment);

  setActiveModal(activeGalleryIndex);
}

function renderGalleryError() {
  if (galleryPreview) {
    galleryPreview.innerHTML = '';
    const error = document.createElement('p');
    error.classList.add('about-gallery__empty');
    error.textContent = 'Nie udało się załadować galerii.';
    galleryPreview.appendChild(error);
  }
  if (galleryModalGrid) {
    galleryModalGrid.innerHTML = '';
    galleryModalGrid.appendChild(buildModalMessage('Nie udało się załadować galerii.'));
  }
  cancelScheduledPreviewRemainder();
  modalRendered = false;
  activeGalleryIndex = -1;
  setActivePreview(activeGalleryIndex);
  setActiveModal(activeGalleryIndex);
  ensureSocialFeedLoaded();
}

function buildPreviewButton(item, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('about-gallery__item');
  button.dataset.role = 'about-gallery-item';
  button.dataset.galleryIndex = String(index);
  button.style.setProperty('--gallery-index', index);

  if (index === activeGalleryIndex) {
    button.classList.add('is-active');
    button.setAttribute('aria-current', 'true');
  }

  const labelText = item.caption || `Zdjęcie ${index + 1} z galerii Chachor Piecze`;
  button.setAttribute('aria-label', `Otwórz galerię – ${labelText}`);

  const img = document.createElement('img');
  img.src = item.imageSrc;
  img.alt = labelText;
  img.decoding = 'async';

  if (index === 0) {
    img.loading = 'eager';
    img.fetchPriority = 'high';
  } else {
    img.loading = 'lazy';
    img.fetchPriority = 'low';
  }

  button.appendChild(img);

  return button;
}

function buildModalButton(item, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('about-gallery-modal__item');
  button.dataset.role = 'about-gallery-modal-item';
  button.dataset.galleryIndex = String(index);
  button.style.setProperty('--gallery-index', index);

  if (index === activeGalleryIndex) {
    button.classList.add('is-active');
    button.setAttribute('aria-current', 'true');
  }

  const caption = item.caption || `Zdjęcie ${index + 1} z galerii Chachor Piecze`;
  button.setAttribute('aria-label', `Powiększ zdjęcie: ${caption}`);

  const img = document.createElement('img');
  img.src = item.imageSrc;
  img.alt = caption;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.fetchPriority = 'low';
  button.appendChild(img);

  return button;
}

function buildModalMessage(text) {
  const message = document.createElement('p');
  message.classList.add('about-gallery-modal__empty');
  message.textContent = text;
  return message;
}

function renderSocialFeedSkeleton(count = SOCIAL_FEED_LIMIT) {
  if (!socialFeed) {
    return;
  }
  const total = Math.max(0, Math.min(Number(count) || 0, SOCIAL_FEED_LIMIT));
  socialFeed.innerHTML = '';
  for (let i = 0; i < total; i += 1) {
    const skeleton = document.createElement('div');
    skeleton.classList.add('about-social-feed__item', 'about-social-feed__item--skeleton');
    skeleton.setAttribute('aria-hidden', 'true');
    socialFeed.appendChild(skeleton);
  }
}

function renderSocialFeed() {
  if (!socialFeed) {
    return;
  }

  if (socialFeedLoading) {
    renderSocialFeedSkeleton();
    return;
  }

  socialFeed.innerHTML = '';

  if (!socialFeedData.length) {
    const empty = document.createElement('p');
    empty.classList.add('about-gallery__empty');
    empty.textContent = 'Brak zdjęć do wyświetlenia.';
    socialFeed.appendChild(empty);
    return;
  }

  socialFeedData.forEach((item, index) => {
    const link = document.createElement('a');
    link.classList.add('about-social-feed__item');
    link.href = item && item.permalink ? item.permalink : 'https://www.instagram.com/chachor_piecze/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const img = document.createElement('img');
    img.src = item && item.media_url ? item.media_url : '';
    img.alt = item && item.caption ? item.caption : `Instagram Chachor Piecze zdjęcie ${index + 1}`;
    img.loading = index === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';

    link.appendChild(img);
    socialFeed.appendChild(link);
  });
}

async function loadSocialFeed() {
  if (!socialFeed || socialFeedLoaded || socialFeedLoading) {
    return;
  }

  try {
    socialFeedLoading = true;
    renderSocialFeedSkeleton();
    const res = await fetch('/api/instagram-feed');
    if (!res.ok) {
      throw new Error('Request failed');
    }
    const data = await res.json();
    socialFeedData = Array.isArray(data)
      ? data.filter((item) => item && item.media_url).slice(0, SOCIAL_FEED_LIMIT)
      : [];
    socialFeedLoaded = true;
  } catch (err) {
    console.error('Błąd pobierania feedu social:', err);
    socialFeedData = [];
    socialFeedLoaded = true;
  } finally {
    socialFeedLoading = false;
    renderSocialFeed();
  }
}

function ensureSocialFeedLoaded() {
  if (!socialFeed) {
    return;
  }
  if (socialFeedLoaded) {
    renderSocialFeed();
    return;
  }
  if (socialFeedLoading) {
    renderSocialFeedSkeleton();
    return;
  }
  loadSocialFeed();
}

function setActivePreview(index) {
  if (!galleryPreview) {
    return;
  }

  const items = galleryPreview.querySelectorAll('[data-role="about-gallery-item"]');
  items.forEach((node) => {
    const isMatch = Number(node.getAttribute('data-gallery-index')) === index;
    node.classList.toggle('is-active', isMatch);
    if (isMatch) {
      node.setAttribute('aria-current', 'true');
    } else {
      node.removeAttribute('aria-current');
    }
  });
}

function setActiveModal(index) {
  if (!galleryModalGrid) {
    return;
  }

  const items = galleryModalGrid.querySelectorAll('[data-role="about-gallery-modal-item"]');
  items.forEach((node) => {
    const isMatch = Number(node.getAttribute('data-gallery-index')) === index;
    node.classList.toggle('is-active', isMatch);
    if (isMatch) {
      node.setAttribute('aria-current', 'true');
    } else {
      node.removeAttribute('aria-current');
    }
  });
}

function updateActiveIndex(index) {
  if (!Number.isFinite(index) || !galleryData[index]) {
    return;
  }
  activeGalleryIndex = index;
  setActivePreview(activeGalleryIndex);
  setActiveModal(activeGalleryIndex);
}

function openGalleryModal(trigger, initialIndex) {
  if (!galleryModal) {
    return;
  }

  lastPreviewTrigger = trigger || null;

  if (!modalRendered) {
    renderGalleryModal();
  }

  if (Number.isFinite(initialIndex) && galleryData[initialIndex]) {
    updateActiveIndex(initialIndex);
  } else if (activeGalleryIndex >= 0 && galleryData[activeGalleryIndex]) {
    setActivePreview(activeGalleryIndex);
    setActiveModal(activeGalleryIndex);
  }

  toggleModal(galleryModal, true, 'about-gallery-modal-open');

  if (galleryModalClose) {
    galleryModalClose.focus();
  }

  const targetIndex = Number.isFinite(initialIndex) && galleryData[initialIndex]
    ? initialIndex
    : (activeGalleryIndex >= 0 ? activeGalleryIndex : null);

  if (targetIndex !== null) {
    requestAnimationFrame(() => {
      const target = galleryModalGrid
        ? galleryModalGrid.querySelector(`[data-gallery-index="${targetIndex}"]`)
        : null;
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus({ preventScroll: true });
      }
    });
  }
}

function closeGalleryModal() {
  if (!galleryModal) {
    return;
  }

  if (zoom && zoom.classList.contains('open')) {
    lastModalTrigger = null;
    closeZoom();
  }

  toggleModal(galleryModal, false, 'about-gallery-modal-open');
  if (galleryModalGrid) {
    galleryModalGrid.scrollTop = 0;
  }

  if (lastPreviewTrigger) {
    lastPreviewTrigger.focus();
    lastPreviewTrigger = null;
  }
}

function openZoomByIndex(index) {
  if (!zoom || !zoomImage) {
    return;
  }

  if (!Number.isFinite(index) || !galleryData[index]) {
    return;
  }

  updateActiveIndex(index);

  const item = galleryData[index];
  const caption = item.caption || `Zdjęcie ${index + 1} z galerii Chachor Piecze`;

  zoomImage.src = item.imageSrc;
  zoomImage.alt = caption;
  zoomImage.dataset.galleryIndex = String(index);
  zoomImage.classList.add('is-active');

  toggleModal(zoom, true, 'about-gallery-zoom-open');

  if (zoomClose) {
    zoomClose.focus();
  }
}

function closeZoom() {
  if (!zoom) {
    return;
  }

  const wasOpen = zoom.classList.contains('open');
  toggleModal(zoom, false, 'about-gallery-zoom-open', true);

  if (zoomImage) {
    delete zoomImage.dataset.galleryIndex;
    zoomImage.classList.remove('is-active');
  }

  if (wasOpen && galleryModal && galleryModal.classList.contains('open') && lastModalTrigger) {
    lastModalTrigger.focus();
  }
  lastModalTrigger = null;
}

async function loadAboutContent() {
  if (galleryPreview) {
    renderGallerySkeletons();
  }

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
    renderGalleryError();
  }
}

if (galleryPreview) {
  galleryPreview.addEventListener('click', (event) => {
    const trigger = event.target instanceof HTMLElement
      ? event.target.closest('[data-role="about-gallery-item"]')
      : null;

    if (!trigger) {
      return;
    }

    const indexAttr = trigger.getAttribute('data-gallery-index');
    const galleryIndex = Number(indexAttr);
    openGalleryModal(trigger, galleryIndex);
  });
}

if (galleryModalGrid) {
  galleryModalGrid.addEventListener('click', (event) => {
    const trigger = event.target instanceof HTMLElement
      ? event.target.closest('[data-role="about-gallery-modal-item"]')
      : null;

    if (!trigger) {
      return;
    }

    const indexAttr = trigger.getAttribute('data-gallery-index');
    const galleryIndex = Number(indexAttr);
    lastModalTrigger = trigger;
    openZoomByIndex(galleryIndex);
  });
}

if (galleryModal) {
  galleryModal.addEventListener('click', (event) => {
    if (event.target === galleryModal) {
      closeGalleryModal();
    }
  });
}

if (galleryModalClose) {
  galleryModalClose.addEventListener('click', closeGalleryModal);
}

if (zoom) {
  zoom.addEventListener('click', (event) => {
    if (event.target === zoom) {
      closeZoom();
    }
  });
}

if (zoomClose) {
  zoomClose.addEventListener('click', closeZoom);
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }

  if (zoom && zoom.classList.contains('open')) {
    closeZoom();
  } else if (galleryModal && galleryModal.classList.contains('open')) {
    closeGalleryModal();
  }
});

loadAboutContent();
ensureSocialFeedLoaded();
