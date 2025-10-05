const productGrid = document.getElementById('productGrid');
const productModal = document.getElementById('productModal');
const productModalBody = document.getElementById('productModalBody');
const productModalClose = productModal ? productModal.querySelector('.modal-close') : null;
const cartActionModal = document.getElementById('cartActionModal');
const cartActionClose = cartActionModal ? cartActionModal.querySelector('.modal-close') : null;
const cartActionMessage = document.getElementById('cartActionMessage');
const cartActionGoToCart = document.getElementById('cartActionGoToCart');
const cartActionContinue = document.getElementById('cartActionContinue');
const PRODUCT_DAY_LABELS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const PRODUCT_DAY_ABBREVIATIONS = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
const MAX_AVAILABILITY_TILES = 6;
const PAGE_TRANSITION_DURATION = 350;

let categoryRevealObserver = null;
let pageIntroScheduled = false;
let pageTransitionsInitialized = false;

let lastFocusedElement = null;
let lastCartActionFocusedElement = null;

if (productGrid) {
  productGrid.classList.remove('product-grid');
  productGrid.classList.add('category-container');
}

if (productModalClose) {
  productModalClose.addEventListener('click', closeProductModal);
}

if (cartActionClose) {
  cartActionClose.addEventListener('click', closeCartActionModal);
}

if (productModal) {
  productModal.addEventListener('click', (event) => {
    if (event.target === productModal) {
      closeProductModal();
    }
  });
}

if (cartActionModal) {
  cartActionModal.addEventListener('click', (event) => {
    if (event.target === cartActionModal) {
      closeCartActionModal();
    }
  });
}

if (cartActionGoToCart) {
  cartActionGoToCart.addEventListener('click', () => {
    closeCartActionModal();
    window.location.href = '/cart';
  });
}

if (cartActionContinue) {
  cartActionContinue.addEventListener('click', closeCartActionModal);
}

if (typeof document !== 'undefined') {
  setupPageTransitions();
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (cartActionModal && cartActionModal.classList.contains('open')) {
        event.preventDefault();
        closeCartActionModal();
        return;
      }
      if (productModal && productModal.classList.contains('open')) {
        event.preventDefault();
        closeProductModal();
      }
    }
  });
}

let cart = [];

function readStoredCart() {
  try {
    const raw = sessionStorage.getItem('cart');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Nie można odczytać koszyka z pamięci sesji:', err);
    return [];
  }
}

cart = readStoredCart();
const cartCount = document.getElementById('cartCount');
const orderLayout = document.querySelector('.order-layout');

if (orderLayout && document.body && !document.body.classList.contains('page-intro-active')) {
  document.body.classList.add('page-intro-active');
}

const PRODUCTS_CACHE_KEY = 'chachor.productsCache';
const PRODUCTS_CACHE_TTL = 5 * 60 * 1000;

let productsDataPromise = null;
let cachedProductsData = readProductsCache();

function ensureProductsData(forceRefresh = false) {
  if (forceRefresh) {
    productsDataPromise = null;
    cachedProductsData = null;
    try {
      sessionStorage.removeItem(PRODUCTS_CACHE_KEY);
    } catch (err) {
      // ignore storage errors
    }
  }

  if (!productsDataPromise) {
    if (cachedProductsData) {
      productsDataPromise = Promise.resolve(cachedProductsData);
    } else {
      productsDataPromise = loadProductsData().catch((error) => {
        productsDataPromise = null;
        throw error;
      });
    }
  }

  return productsDataPromise;
}

async function loadProductsData() {
  const [categories, products] = await Promise.all([
    requestJson('/api/categories', 'kategorie'),
    requestJson('/api/products', 'produkty')
  ]);

  const payload = { categories, products };
  cachedProductsData = payload;
  writeProductsCache(payload);
  return payload;
}

async function requestJson(url, label) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Błąd odpowiedzi serwera dla zasobu: ${label || url}`);
  }

  return response.json();
}

ensureProductsData().catch(() => {});

function readProductsCache() {
  try {
    const raw = sessionStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (typeof parsed.timestamp !== 'number' || !Array.isArray(parsed.categories) || !Array.isArray(parsed.products)) {
      return null;
    }
    if (Date.now() - parsed.timestamp > PRODUCTS_CACHE_TTL) {
      sessionStorage.removeItem(PRODUCTS_CACHE_KEY);
      return null;
    }
    return { categories: parsed.categories, products: parsed.products };
  } catch (err) {
    return null;
  }
}

function writeProductsCache(data) {
  try {
    const payload = {
      timestamp: Date.now(),
      categories: data.categories,
      products: data.products
    };
    sessionStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(payload));
  } catch (err) {
    // ignore storage errors
  }
}

function parseAvailabilityValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (/^(all|daily|codziennie)$/i.test(trimmed)) {
      return PRODUCT_DAY_ABBREVIATIONS.map((_, index) => index);
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      // ignore JSON parse errors and fallback to comma-separated string
    }
    return trimmed.split(',');
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function normalizeAvailabilityDaysForRender(days) {
  const source = parseAvailabilityValue(days);
  const normalized = source
    .map((item) => Number(item))
    .filter((num) => Number.isInteger(num) && num >= 0 && num < PRODUCT_DAY_ABBREVIATIONS.length);
  const unique = Array.from(new Set(normalized)).sort((a, b) => a - b);
  const daily = unique.length === PRODUCT_DAY_ABBREVIATIONS.length;
  return { daily, days: unique };
}

function buildAvailabilityTiles(days) {
  const data = normalizeAvailabilityDaysForRender(days);
  const tiles = [];

  if (data.daily) {
    tiles.push({ abbr: 'codziennie', label: 'Dostępne codziennie', modifier: 'daily' });
  } else if (data.days.length) {
    data.days.forEach((index) => {
      tiles.push({
        abbr: PRODUCT_DAY_ABBREVIATIONS[index] || '?',
        label: `Dostępne w ${PRODUCT_DAY_LABELS[index] || ''}`.trim()
      });
    });
  } else {
    tiles.push({ abbr: '--', label: 'Brak określonych dni', modifier: 'muted' });
  }

  const container = document.createElement('div');
  container.classList.add('product-availability-grid');
  container.setAttribute('aria-label', 'Dni dostępności');

  tiles.slice(0, MAX_AVAILABILITY_TILES).forEach((tile) => {
    const badge = document.createElement('span');
    badge.classList.add('product-availability-tile');
    if (tile.modifier) {
      badge.classList.add(`product-availability-tile--${tile.modifier}`);
    }
    badge.textContent = tile.abbr;
    badge.setAttribute('aria-label', tile.label);
    badge.title = tile.label;
    container.appendChild(badge);
  });

  return container;
}

async function fetchProducts(forceRefresh = false) {
  if (!productGrid) {
    return;
  }

  const hasWarmCache = !forceRefresh && Boolean(cachedProductsData);
  const shouldShowSkeleton = !hasWarmCache && productGrid.childElementCount === 0;
  const hideSkeleton = shouldShowSkeleton ? showProductSkeleton() : null;

  try {
    const { categories, products } = await ensureProductsData(forceRefresh);
    if (hideSkeleton) {
      hideSkeleton();
    }
    renderProductsByCategory(categories, products);
  } catch (err) {
    if (hideSkeleton) {
      hideSkeleton();
    }
    console.error('Błąd pobierania produktów:', err);
    productGrid.innerHTML = '<p class="error-message">Nie udało się załadować produktów.</p>';
  }
}

function renderProductsByCategory(categories, products) {
  if (!productGrid) {
    return;
  }

  productGrid.classList.remove('is-loading');
  productGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  let appended = false;

  const categorized = new Map();
  categories.forEach((category) => {
    categorized.set(category.name, []);
  });

  const uncategorized = [];

  products.forEach((product) => {
    const bucket = categorized.get(product.category);
    if (bucket) {
      bucket.push(product);
    } else {
      uncategorized.push(product);
    }
  });

  categories.forEach((category) => {
    const items = categorized.get(category.name) || [];
    if (!items.length) {
      return;
    }
    fragment.appendChild(createCategorySection(category.name, items));
    appended = true;
  });

  if (uncategorized.length) {
    fragment.appendChild(createCategorySection('Pozostałe', uncategorized));
    appended = true;
  }

  if (!appended) {
    productGrid.innerHTML = '<p class="empty-state">Brak produktów do wyświetlenia.</p>';
    return;
  }

  productGrid.appendChild(fragment);
  applyCategoryFadeIn();
}

function createCategorySection(title, items) {
  const section = document.createElement('section');
  section.classList.add('category-group', 'category-group--pending');

  const heading = document.createElement('h3');
  heading.classList.add('category-title');
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement('div');
  list.classList.add('category-products');
  const cardsFragment = document.createDocumentFragment();
  items.forEach((product, index) => {
    const card = createProductCard(product);
    card.classList.add('product-card--animated', 'product-card--pending');
    card.style.setProperty('--card-delay', `${index * 110}ms`);
    cardsFragment.appendChild(card);
  });
  list.appendChild(cardsFragment);

  section.appendChild(list);
  return section;
}

function showProductSkeleton(sectionCount = 2, cardsPerSection = 3) {
  if (!productGrid) {
    return null;
  }

  productGrid.classList.add('is-loading');
  productGrid.innerHTML = '';

  const fragment = document.createDocumentFragment();
  let cardCounter = 0;
  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const section = document.createElement('section');
    section.classList.add('category-group', 'category-group--skeleton', 'category-group--pending');

    const heading = document.createElement('div');
    heading.classList.add('category-title', 'skeleton-box', 'skeleton-box--heading');
    section.appendChild(heading);

    const list = document.createElement('div');
    list.classList.add('category-products', 'category-products--skeleton');
    for (let cardIndex = 0; cardIndex < cardsPerSection; cardIndex += 1) {
      list.appendChild(createSkeletonCard(cardCounter));
      cardCounter += 1;
    }
    section.appendChild(list);

    fragment.appendChild(section);
  }

  productGrid.appendChild(fragment);

  requestAnimationFrame(() => {
    const skeletonSections = Array.from(productGrid.querySelectorAll('.category-group--skeleton.category-group--pending'));
    skeletonSections.forEach((section, index) => {
      section.style.setProperty('--fade-delay', `${index * 80}ms`);
      section.classList.remove('category-group--pending');
      section.classList.add('category-group--visible');
      triggerCardAnimations(section);
    });
  });

  return () => {
    if (!productGrid) {
      return;
    }
    productGrid.classList.remove('is-loading');
  };
}

function createSkeletonCard(globalIndex) {
  const card = document.createElement('div');
  card.classList.add('product-card', 'product-card--skeleton', 'product-card--animated', 'product-card--pending');
  card.style.setProperty('--card-delay', `${globalIndex * 90}ms`);

  const thumb = document.createElement('div');
  thumb.classList.add('product-card__skeleton-thumb', 'skeleton-box');
  card.appendChild(thumb);

  const info = document.createElement('div');
  info.classList.add('product-info', 'product-info--skeleton');

  const title = document.createElement('div');
  title.classList.add('skeleton-box', 'skeleton-box--line', 'skeleton-box--title');
  info.appendChild(title);

  const textLine = document.createElement('div');
  textLine.classList.add('skeleton-box', 'skeleton-box--line');
  info.appendChild(textLine);

  const price = document.createElement('div');
  price.classList.add('skeleton-box', 'skeleton-box--line', 'skeleton-box--price');
  info.appendChild(price);

  const button = document.createElement('div');
  button.classList.add('skeleton-box', 'skeleton-box--button');
  info.appendChild(button);

  card.appendChild(info);

  const availability = document.createElement('div');
  availability.classList.add('product-availability-grid', 'product-availability-grid--skeleton');
  for (let i = 0; i < 3; i += 1) {
    const badge = document.createElement('span');
    badge.classList.add('skeleton-box', 'skeleton-box--badge');
    availability.appendChild(badge);
  }
  card.appendChild(availability);

  return card;
}

function applyCategoryFadeIn() {
  if (!productGrid) {
    return;
  }

  const pendingSections = Array.from(productGrid.querySelectorAll('.category-group--pending'));
  if (!pendingSections.length) {
    return;
  }

  pendingSections.forEach((section, index) => {
    section.style.setProperty('--fade-delay', `${index * 60}ms`);
  });

  const observer = ensureCategoryRevealObserver();
  if (observer) {
    pendingSections.forEach((section) => observer.observe(section));

    setTimeout(() => {
      pendingSections.forEach((section) => {
        if (section.classList.contains('category-group--pending')) {
          revealCategorySection(section);
        }
      });
    }, 800);
    return;
  }

  requestAnimationFrame(() => {
    pendingSections.forEach((section) => {
      revealCategorySection(section);
    });
  });
}

function ensureCategoryRevealObserver() {
  if (categoryRevealObserver || typeof window === 'undefined') {
    return categoryRevealObserver;
  }

  if (!('IntersectionObserver' in window)) {
    return null;
  }

  categoryRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const section = entry.target;
      revealCategorySection(section);
      categoryRevealObserver.unobserve(section);
    });
  }, {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.1
  });

  return categoryRevealObserver;
}

function triggerCardAnimations(section) {
  const cards = section.querySelectorAll('.product-card--pending');
  if (!cards.length) {
    return;
  }

  requestAnimationFrame(() => {
    cards.forEach((card) => {
      card.classList.remove('product-card--pending');
      card.classList.add('product-card--visible');
    });
  });
}

function revealCategorySection(section) {
  section.classList.remove('category-group--pending');
  section.classList.add('category-group--visible');
  triggerCardAnimations(section);
}

function schedulePageIntroReveal() {
  if (!orderLayout || pageIntroScheduled) {
    return;
  }
  pageIntroScheduled = true;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (document.body) {
        document.body.classList.add('page-intro-ready');
      }
    });
  });
}

function setupPageTransitions() {
  if (pageTransitionsInitialized || !document.body) {
    return;
  }
  pageTransitionsInitialized = true;

  document.body.classList.remove('page-transition-leave');
  document.body.classList.add('page-transition-ready');

  const activate = () => {
    requestAnimationFrame(() => {
      document.body.classList.add('page-transition-enter');
    });
  };

  activate();

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      document.body.classList.remove('page-transition-enter');
      document.body.classList.remove('page-transition-leave');
      activate();
    }
  });

  document.addEventListener('click', handleLinkTransition, true);
}

function handleLinkTransition(event) {
  if (event.defaultPrevented) {
    return;
  }

  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!anchor) {
    return;
  }

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return;
  }

  if (anchor.target && anchor.target !== '_self') {
    return;
  }

  const destination = new URL(href, window.location.href);
  if (destination.origin !== window.location.origin) {
    return;
  }

  const samePage = destination.pathname === window.location.pathname
    && destination.search === window.location.search
    && destination.hash === window.location.hash;
  if (samePage) {
    return;
  }

  event.preventDefault();
  startPageLeave(() => {
    window.location.href = destination.href;
  });
}

function startPageLeave(callback) {
  if (!document.body) {
    callback();
    return;
  }

  if (document.body.classList.contains('page-transition-leave')) {
    callback();
    return;
  }

  document.body.classList.remove('page-transition-enter');
  document.body.classList.add('page-transition-leave');

  window.setTimeout(callback, PAGE_TRANSITION_DURATION);
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.classList.add('product-card');
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Zobacz szczegóły produktu ${product.name || ''}`);

  const imageSrc = product.imageData || product.imageUrl;
  if (imageSrc) {
    card.classList.add('product-card--with-image');
    const image = document.createElement('img');
    image.src = imageSrc;
    image.alt = product.name || '';
    image.classList.add('product-thumb');
    card.appendChild(image);
  } else {
    card.classList.add('product-card--no-image');
  }

  const content = document.createElement('div');
  content.classList.add('product-info');

  const title = document.createElement('h3');
  title.textContent = product.name;

  const desc = document.createElement('p');
  const descText = (product.desc || '').trim();
  desc.classList.add('product-desc');
  desc.textContent = descText;

  const price = document.createElement('p');
  price.innerHTML = `<strong>${product.price} zł</strong>`;

  const button = document.createElement('button');
  button.textContent = 'Dodaj do koszyka';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    addToCart(product._id, product.price, product.name);
  });

  content.append(title, desc, price, button);
  const availability = buildAvailabilityTiles(product.availabilityDays);
  card.appendChild(content);
  scheduleDescriptionTruncation(desc, descText);
  card.appendChild(availability);

  card.addEventListener('click', () => openProductModal(product));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProductModal(product);
    }
  });

  return card;
}

function scheduleDescriptionTruncation(element, fullText) {
  const ellipsis = '...';
  const maxAttempts = 4;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);

  function applyTruncation(attemptsLeft) {
    if (!element.isConnected) {
      if (attemptsLeft <= 0) {
        return;
      }
      raf(() => applyTruncation(attemptsLeft - 1));
      return;
    }

    element.textContent = fullText;

    if (element.scrollHeight <= element.clientHeight + 1) {
      element.removeAttribute('title');
      return;
    }

    let low = 0;
    let high = fullText.length;
    let result = fullText;
    let truncated = false;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${fullText.slice(0, mid).trimEnd()}${ellipsis}`;
      element.textContent = candidate;

      if (element.scrollHeight > element.clientHeight + 1) {
        high = mid - 1;
      } else {
        result = candidate;
        truncated = mid < fullText.length;
        low = mid + 1;
      }
    }

    if (!truncated) {
      element.textContent = fullText;
      element.removeAttribute('title');
      return;
    }

    element.textContent = result;
    element.setAttribute('title', fullText);
  }

  raf(() => applyTruncation(maxAttempts));
}

function openProductModal(product) {
  if (!productModal || !productModalBody) {
    return;
  }

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  productModalBody.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.classList.add('modal-product');

  const imageSrc = product.imageData || product.imageUrl;
  if (imageSrc) {
    const image = document.createElement('img');
    image.src = imageSrc;
    image.alt = product.name || '';
    wrapper.appendChild(image);
  }

  const info = document.createElement('div');
  info.classList.add('modal-product-info');

  const title = document.createElement('h3');
  title.textContent = product.name;
  info.appendChild(title);

  if (product.desc) {
    const desc = document.createElement('p');
    desc.textContent = product.desc;
    info.appendChild(desc);
  }

  const availability = buildAvailabilityTiles(product.availabilityDays);
  info.appendChild(availability);

  const price = document.createElement('p');
  price.innerHTML = `<strong>${product.price} zł</strong>`;
  info.appendChild(price);

  const button = document.createElement('button');
  button.textContent = 'Dodaj do koszyka';
  button.addEventListener('click', () => {
    closeProductModal();
    addToCart(product._id, product.price, product.name);
  });
  info.appendChild(button);

  wrapper.appendChild(info);
  productModalBody.appendChild(wrapper);

  productModal.classList.add('open');
  productModal.setAttribute('aria-hidden', 'false');

  if (productModalClose) {
    productModalClose.focus();
  }
}

function closeProductModal() {
  if (!productModal) {
    return;
  }

  if (!productModal.classList.contains('open')) {
    return;
  }

  if (productModalBody) {
    productModalBody.innerHTML = '';
  }

  productModal.classList.remove('open');
  productModal.setAttribute('aria-hidden', 'true');

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }

  lastFocusedElement = null;
}

function addToCart(id, price, name) {
  const existing = cart.find((item) => item.id === id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id, price, name, quantity: 1 });
  }
  saveCart();
  openCartActionModal(name);
}

function saveCart() {
  try {
    sessionStorage.setItem('cart', JSON.stringify(cart));
  } catch (err) {
    console.warn('Nie można zapisać koszyka w pamięci sesji:', err);
  }
  updateCartCount();
}

function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) {
    cartCount.textContent = totalItems;
  }
}

function openCartActionModal(productName) {
  if (!cartActionModal) {
    return;
  }

  lastCartActionFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (cartActionMessage) {
    cartActionMessage.textContent = productName
      ? `Dodano do koszyka: ${productName}.`
      : 'Produkt został dodany do koszyka.';
  }

  cartActionModal.classList.add('open');
  cartActionModal.setAttribute('aria-hidden', 'false');

  const focusTarget = cartActionGoToCart || cartActionContinue || cartActionClose;
  if (focusTarget) {
    focusTarget.focus();
  }
}

function closeCartActionModal() {
  if (!cartActionModal || !cartActionModal.classList.contains('open')) {
    return;
  }

  cartActionModal.classList.remove('open');
  cartActionModal.setAttribute('aria-hidden', 'true');

  if (lastCartActionFocusedElement && typeof lastCartActionFocusedElement.focus === 'function') {
    lastCartActionFocusedElement.focus();
  }

  lastCartActionFocusedElement = null;
}

let storefrontInitialized = false;

function initializeStorefront() {
  if (storefrontInitialized) {
    return;
  }
  storefrontInitialized = true;

  if (productGrid) {
    fetchProducts();
  }

  updateCartCount();
  schedulePageIntroReveal();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initializeStorefront, { once: true });
} else {
  initializeStorefront();
}
