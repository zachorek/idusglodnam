const productGrid = document.getElementById('productGrid');
const categoryTileStrip = document.getElementById('categoryTileStrip');
const categoryTileList = document.getElementById('categoryTileList');
const menuPickupDateInput = document.getElementById('menuPickupDate');
const menuCalendarContainer = document.getElementById('menuCalendarContainer');
const menuPickupClearButton = document.getElementById('menuPickupClear');
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
const JS_DAY_TO_PRODUCT_DAY_INDEX = [6, 0, 1, 2, 3, 4, 5];
const STOCK_CHANNEL_NAME = 'chachor-stock';
const PRODUCT_DEEP_LINK_PARAM = 'product';

let categoryRevealObserver = null;
let pageIntroScheduled = false;
let pageTransitionsInitialized = false;

let lastFocusedElement = null;
let lastCartActionFocusedElement = null;
let lastLoadedCategories = [];
let lastLoadedProducts = [];
let menuPickupCalendar = null;
let menuInteractiveInput = null;
let activeMenuAvailabilityFilter = null;
let activeMenuDateString = null;
let activeMenuStockByProductId = new Map();
let activeMenuStockRequestId = 0;
let lastFetchedMenuStockDate = null;
let stockBroadcastChannel = null;
let stockBroadcastInitialized = false;
const pendingStockRefreshDates = new Set();

function buildProductSlug(value) {
  if (value === undefined || value === null) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  if (typeof text.normalize === 'function') {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeProductSlug(value) {
  return buildProductSlug(value);
}

function getProductSlugFromData(product) {
  if (!product) {
    return '';
  }
  return buildProductSlug(product.name || '');
}

function getProductAnchorIdForProduct(product) {
  if (!product) {
    return '';
  }
  const slug = getProductSlugFromData(product);
  if (slug) {
    return `product-${slug}`;
  }
  if (product._id) {
    return `product-${String(product._id).trim()}`;
  }
  return '';
}

const initialProductDeepLinkSlug = (() => {
  if (typeof window === 'undefined' || typeof window.location === 'undefined' || typeof URLSearchParams === 'undefined') {
    return null;
  }
  try {
    const params = new URLSearchParams(window.location.search || '');
    const requested = params.get(PRODUCT_DEEP_LINK_PARAM);
    const slug = normalizeProductSlug(requested);
    return slug || null;
  } catch (err) {
    return null;
  }
})();

let pendingProductDeepLinkSlug = initialProductDeepLinkSlug;

const bodyScrollLockState = {
  active: false,
  scrollY: 0
};

function lockBodyScroll() {
  if (bodyScrollLockState.active || typeof document === 'undefined' || !document.body) {
    return;
  }
  bodyScrollLockState.scrollY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add('modal-open');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${bodyScrollLockState.scrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  bodyScrollLockState.active = true;
}

function unlockBodyScroll() {
  if (!bodyScrollLockState.active || typeof document === 'undefined' || !document.body) {
    return;
  }
  const targetScroll = bodyScrollLockState.scrollY;
  document.body.classList.remove('modal-open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  bodyScrollLockState.scrollY = 0;
  bodyScrollLockState.active = false;
  window.scrollTo(0, targetScroll);
}

function safeFocus(element) {
  if (!element || typeof element.focus !== 'function') {
    return;
  }
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
}

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

if (menuPickupDateInput && typeof window !== 'undefined' && typeof window.flatpickr === 'function') {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 1);
  maxDate.setDate(maxDate.getDate() + 1);

  const baseLocale = window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.pl;
  const localeConfig = baseLocale
    ? { ...baseLocale, firstDayOfWeek: 1 }
    : { firstDayOfWeek: 1 };

  menuPickupCalendar = window.flatpickr(menuPickupDateInput, {
    minDate: tomorrow,
    maxDate,
    dateFormat: 'Y-m-d',
    altInput: true,
    altInputClass: 'order-filter__input',
    altFormat: 'd F Y',
    locale: localeConfig,
    inline: true,
    allowInput: false,
    clickOpens: false,
    appendTo: menuCalendarContainer || undefined,
    onChange: (selectedDates) => {
      const selectedDate = Array.isArray(selectedDates) && selectedDates.length ? selectedDates[0] : null;
      handleMenuDateChange(selectedDate instanceof Date ? selectedDate : null);
      hideMenuCalendar();
    }
  });

  const interactiveInput = menuPickupCalendar && menuPickupCalendar.altInput ? menuPickupCalendar.altInput : null;

  if (menuPickupDateInput) {
    menuPickupDateInput.setAttribute('aria-haspopup', 'dialog');
    menuPickupDateInput.setAttribute('aria-expanded', 'false');
  }

  if (interactiveInput) {
    menuInteractiveInput = interactiveInput;
    menuInteractiveInput.setAttribute('aria-haspopup', 'dialog');
    menuInteractiveInput.setAttribute('aria-expanded', 'false');
  } else {
    menuInteractiveInput = menuPickupDateInput;
  }

  const toggleTarget = interactiveInput || menuPickupDateInput;

  if (toggleTarget) {
    toggleTarget.addEventListener('click', (event) => {
      event.preventDefault();
      if (typeof toggleTarget.focus === 'function') {
        try {
          toggleTarget.focus({ preventScroll: true });
        } catch (err) {
          toggleTarget.focus();
        }
      }
      const expanded = menuCalendarContainer && !menuCalendarContainer.hidden;
      setMenuCalendarVisibility(!expanded);
    });
    toggleTarget.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const expanded = menuCalendarContainer && !menuCalendarContainer.hidden;
        setMenuCalendarVisibility(!expanded);
      }
    });
  }

  hideMenuCalendar();
}

if (menuPickupClearButton) {
  menuPickupClearButton.addEventListener('click', () => {
    handleMenuDateChange(null);
    if (menuPickupCalendar) {
      menuPickupCalendar.clear();
    } else if (menuPickupDateInput) {
      menuPickupDateInput.value = '';
    }
    hideMenuCalendar();
  });
}

updateMenuFilterControlsState();

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

function normalizeDateToYMD(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getActiveMenuStockInfo(productId) {
  if (!productId) {
    return null;
  }
  return activeMenuStockByProductId.get(String(productId)) || null;
}

async function fetchMenuStockForDate(dateString) {
  if (!dateString) {
    activeMenuStockByProductId = new Map();
    lastFetchedMenuStockDate = null;
    renderProductsByCategory(lastLoadedCategories, lastLoadedProducts);
    return;
  }
  const requestId = ++activeMenuStockRequestId;
  try {
    const response = await fetch(`/api/stock/date/${dateString}`);
    if (!response.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }
    const payload = await response.json();
    if (requestId !== activeMenuStockRequestId) {
      return;
    }
    const map = new Map();
    if (Array.isArray(payload)) {
      payload.forEach((item) => {
        const productId = item && item.productId ? String(item.productId) : '';
        if (!productId) {
          return;
        }
        const capacity = Math.max(0, Number(item.capacity) || 0);
        const reserved = Math.max(0, Number(item.reserved) || 0);
        const remaining = Math.max(0, Number(item.remaining) || Math.max(0, capacity - reserved));
        map.set(productId, { capacity, reserved, remaining });
      });
    }
    activeMenuStockByProductId = map;
    lastFetchedMenuStockDate = dateString;
    pendingStockRefreshDates.delete(dateString);
    renderProductsByCategory(lastLoadedCategories, lastLoadedProducts);
  } catch (err) {
    if (requestId !== activeMenuStockRequestId) {
      return;
    }
    console.error('Błąd pobierania stanów dla daty:', err);
    activeMenuStockByProductId = new Map();
    lastFetchedMenuStockDate = null;
    renderProductsByCategory(lastLoadedCategories, lastLoadedProducts);
  }
}

function deriveMenuAvailabilityIndexFromDate(date) {
  if (!(date instanceof Date)) {
    return null;
  }
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return null;
  }
  const jsDay = date.getDay();
  if (jsDay < 0 || jsDay >= JS_DAY_TO_PRODUCT_DAY_INDEX.length) {
    return null;
  }
  const mapped = JS_DAY_TO_PRODUCT_DAY_INDEX[jsDay];
  return typeof mapped === 'number' ? mapped : null;
}

function handleMenuDateChange(date) {
  const normalizedDate = date instanceof Date ? normalizeDateToYMD(date) : null;
  activeMenuDateString = normalizedDate;
  activeMenuAvailabilityFilter = deriveMenuAvailabilityIndexFromDate(date);
  if (!normalizedDate) {
    activeMenuStockByProductId = new Map();
    lastFetchedMenuStockDate = null;
    activeMenuStockRequestId += 1;
  }
  updateMenuFilterControlsState();
  renderProductsByCategory(lastLoadedCategories, lastLoadedProducts);
  if (normalizedDate) {
    fetchMenuStockForDate(normalizedDate);
  }
}

function updateMenuFilterControlsState() {
  if (!menuPickupClearButton) {
    return;
  }
  const hasFilter = Boolean(activeMenuDateString);
  menuPickupClearButton.disabled = !hasFilter;
}

function normalizeStockUpdatePayload(payload) {
  if (!payload) {
    return null;
  }

  let source = payload;
  if (typeof payload === 'string') {
    try {
      source = JSON.parse(payload);
    } catch (err) {
      return null;
    }
  }

  if (!source || typeof source !== 'object') {
    return null;
  }

  const dateStr = typeof source.date === 'string' ? source.date.trim() : '';
  if (!dateStr) {
    return null;
  }

  return {
    date: dateStr
  };
}

function handleExternalStockRefreshMessage(payload) {
  const normalized = normalizeStockUpdatePayload(payload);
  if (!normalized) {
    return;
  }
  const { date } = normalized;
  pendingStockRefreshDates.add(date);
  if (activeMenuDateString === date) {
    fetchMenuStockForDate(date);
  }
}

function setupExternalStockSync() {
  if (stockBroadcastInitialized) {
    return;
  }
  stockBroadcastInitialized = true;

  if (typeof BroadcastChannel === 'function') {
    try {
      stockBroadcastChannel = new BroadcastChannel(STOCK_CHANNEL_NAME);
      stockBroadcastChannel.addEventListener('message', (event) => {
        handleExternalStockRefreshMessage(event && event.data);
      });
    } catch (err) {
      stockBroadcastChannel = null;
    }
  }

  window.addEventListener('storage', (event) => {
    if (!event) {
      return;
    }
    if (event.key === 'chachor_stock_refresh_signal' && event.newValue) {
      handleExternalStockRefreshMessage(event.newValue);
    }
  });

  window.addEventListener('focus', () => {
    if (activeMenuDateString && pendingStockRefreshDates.has(activeMenuDateString)) {
      fetchMenuStockForDate(activeMenuDateString);
    }
  });

  try {
    const latestRaw = localStorage.getItem('chachor_stock_refresh_latest');
    if (latestRaw) {
      const normalized = normalizeStockUpdatePayload(latestRaw);
      if (normalized) {
        pendingStockRefreshDates.add(normalized.date);
      }
    }
  } catch (err) {
    // ignore storage access errors
  }
}

function filterProductsForMenu(products) {
  if (!Array.isArray(products)) {
    return [];
  }
  const visibleProducts = products.filter((product) => product && product.isBlocked !== true);
  if (typeof activeMenuAvailabilityFilter !== 'number') {
    return visibleProducts;
  }

  return visibleProducts.filter((product) => {
    const availability = normalizeAvailabilityDaysForRender(product.availabilityDays);
    if (availability.daily) {
      return true;
    }
    return availability.days.includes(activeMenuAvailabilityFilter);
  });
}

function getCategoryAnchorId(category) {
  if (!category) {
    return '';
  }
  const rawName = typeof category === 'string' ? category : category.name || '';
  const baseSlug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = typeof category === 'object' && category._id ? String(category._id).slice(-6) : '';
  const slug = [baseSlug || 'category', suffix].filter(Boolean).join('-');
  return `category-${slug}`;
}

function renderCategoryTiles(categories) {
  if (!categoryTileStrip || !categoryTileList) {
    return;
  }

  categoryTileList.innerHTML = '';
  const tiles = Array.isArray(categories)
    ? categories.filter((category) => category && (category.tileImageUrl || category.tileImageData))
    : [];
  if (!tiles.length) {
    categoryTileStrip.classList.add('hidden');
    return;
  }

  categoryTileStrip.classList.remove('hidden');

  tiles.forEach((category) => {
    const anchorId = getCategoryAnchorId(category);
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('category-tile');
    const label = category.name || 'Kategoria';
    button.setAttribute('aria-label', `Przejdź do kategorii ${label}`);
    button.title = `Przejdź do kategorii ${label}`;
    button.dataset.anchor = anchorId;

    const image = document.createElement('img');
    image.src = category.tileImageUrl || category.tileImageData;
    image.alt = category.tileImageAlt || category.name || '';
    image.classList.add('category-tile__image');

    const overlay = document.createElement('span');
    overlay.classList.add('category-tile__label');
    overlay.textContent = category.name || '';

    button.append(image, overlay);
    button.addEventListener('click', () => scrollToCategory(anchorId));
    categoryTileList.appendChild(button);
  });
}

function scrollToCategory(anchorId) {
  if (!anchorId) {
    return;
  }
  const target = document.getElementById(anchorId);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    lastLoadedCategories = Array.isArray(categories) ? categories : [];
    lastLoadedProducts = Array.isArray(products) ? products : [];
    renderProductsByCategory(categories, products);
    if (activeMenuDateString && lastFetchedMenuStockDate !== activeMenuDateString) {
      fetchMenuStockForDate(activeMenuDateString);
    }
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

  const categoryList = Array.isArray(categories) ? categories : [];
  const productListSource = Array.isArray(products) ? products : [];
  const productList = filterProductsForMenu(productListSource);

  const categorized = new Map();
  categoryList.forEach((category) => {
    categorized.set(category.name, []);
  });

  const uncategorized = [];
  productList.forEach((product) => {
    const bucket = categorized.get(product.category);
    if (bucket) {
      bucket.push(product);
    } else {
      uncategorized.push(product);
    }
  });

  categoryList.forEach((category) => {
    const items = categorized.get(category.name) || [];
    if (!items.length) {
      return;
    }
    fragment.appendChild(createCategorySection(category.name, items, getCategoryAnchorId(category)));
    appended = true;
  });
  const categoriesForTiles = categoryList.filter((category) => {
    const items = categorized.get(category.name) || [];
    return category && (category.tileImageUrl || category.tileImageData) && items.length;
  });
  renderCategoryTiles(categoriesForTiles);

  if (uncategorized.length) {
    fragment.appendChild(createCategorySection('Pozostałe', uncategorized, 'category-others'));
    appended = true;
  }

  if (!appended) {
    productGrid.innerHTML = '<p class="empty-state">Brak produktów do wyświetlenia.</p>';
    return;
  }

  productGrid.appendChild(fragment);
  applyCategoryFadeIn();
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
  raf(() => attemptResolveProductDeepLink());
}

function createCategorySection(title, items, anchorId) {
  const section = document.createElement('section');
  section.classList.add('category-group', 'category-group--pending');
  if (anchorId) {
    section.id = anchorId;
  }

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

function setMenuCalendarVisibility(visible) {
  const shouldShow = Boolean(visible);
  if (menuCalendarContainer) {
    menuCalendarContainer.hidden = !shouldShow;
  }
  if (!shouldShow) {
    updateMenuCalendarExpansionState(false);
    return;
  }
  updateMenuCalendarExpansionState(true);
}

function hideMenuCalendar() {
  if (menuCalendarContainer) {
    menuCalendarContainer.hidden = true;
  }
  updateMenuCalendarExpansionState(false);
}

function updateMenuCalendarExpansionState(expanded) {
  const expandedValue = expanded ? 'true' : 'false';
  if (menuInteractiveInput) {
    menuInteractiveInput.setAttribute('aria-expanded', expandedValue);
  }
  if (menuPickupDateInput) {
    menuPickupDateInput.setAttribute('aria-expanded', expandedValue);
  }
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

function attemptResolveProductDeepLink() {
  if (!pendingProductDeepLinkSlug || !productGrid) {
    return;
  }
  const target = productGrid.querySelector(`[data-product-slug="${pendingProductDeepLinkSlug}"]`);
  if (!target) {
    return;
  }
  pendingProductDeepLinkSlug = null;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  safeFocus(target);
  target.classList.add('product-card--highlight');
  window.setTimeout(() => {
    target.classList.remove('product-card--highlight');
  }, 4000);
  if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(PRODUCT_DEEP_LINK_PARAM);
      window.history.replaceState({}, '', url);
    } catch (err) {
      // ignore URL errors
    }
  }
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
  const productSlug = getProductSlugFromData(product);
  const productAnchorId = getProductAnchorIdForProduct(product);
  if (productAnchorId) {
    card.id = productAnchorId;
  }
  if (productSlug) {
    card.dataset.productSlug = productSlug;
  }
  if (product && product._id) {
    card.dataset.productId = product._id;
  }
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Zobacz szczegóły produktu ${product.name || ''}`);

  const imageSrc = product.imageUrl || product.imageData;
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

  content.append(title, desc, price);

  let availabilityState = null;
  if (activeMenuDateString) {
    const stockInfo = getActiveMenuStockInfo(product._id);
    if (stockInfo) {
      const totalRemaining = Math.max(0, Number(stockInfo.remaining) || 0);
      const stockBadge = document.createElement('div');
      stockBadge.classList.add('product-stock-badge');

      if (totalRemaining > 10) {
        availabilityState = 'plenty';
        stockBadge.textContent = 'Dostępność: 10+';
        stockBadge.classList.add('product-stock-badge--plenty');
      } else if (totalRemaining > 0) {
        availabilityState = 'limited';
        stockBadge.textContent = `Dostępność: ${totalRemaining}`;
        stockBadge.classList.add('product-stock-badge--limited');
      } else {
        availabilityState = 'soldout';
        stockBadge.textContent = 'Wyprzedane';
        stockBadge.classList.add('product-stock-badge--soldout');
      }

      content.appendChild(stockBadge);
    }
  }

  if (availabilityState === 'plenty') {
    button.classList.add('product-button--plenty');
  } else if (availabilityState === 'limited') {
    button.classList.add('product-button--limited');
  } else if (availabilityState === 'soldout') {
    button.disabled = true;
    button.textContent = 'Wyprzedane';
    button.classList.add('product-button--soldout');
  }

  content.appendChild(button);
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

  const imageSrc = product.imageUrl || product.imageData;
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

  let modalAvailabilityState = null;
  if (activeMenuDateString) {
    const stockInfo = getActiveMenuStockInfo(product._id);
    if (stockInfo) {
      const totalRemaining = Math.max(0, Number(stockInfo.remaining) || 0);
      const stockBadge = document.createElement('div');
      stockBadge.classList.add('product-stock-badge');
      if (totalRemaining > 10) {
        modalAvailabilityState = 'plenty';
        stockBadge.textContent = 'Dostępność: 10+';
        stockBadge.classList.add('product-stock-badge--plenty');
      } else if (totalRemaining > 0) {
        modalAvailabilityState = 'limited';
        stockBadge.textContent = `Dostępność: ${totalRemaining}`;
        stockBadge.classList.add('product-stock-badge--limited');
      } else {
        modalAvailabilityState = 'soldout';
        stockBadge.textContent = 'Wyprzedane';
        stockBadge.classList.add('product-stock-badge--soldout');
      }
      info.appendChild(stockBadge);
    }
  }

  const button = document.createElement('button');
  button.textContent = 'Dodaj do koszyka';
  button.addEventListener('click', () => {
    closeProductModal();
    addToCart(product._id, product.price, product.name);
  });
  if (modalAvailabilityState === 'plenty') {
    button.classList.add('product-button--plenty');
  } else if (modalAvailabilityState === 'limited') {
    button.classList.add('product-button--limited');
  } else if (modalAvailabilityState === 'soldout') {
    button.disabled = true;
    button.textContent = 'Wyprzedane';
    button.classList.add('product-button--soldout');
  }
  info.appendChild(button);

  wrapper.appendChild(info);
  productModalBody.appendChild(wrapper);

  productModal.classList.add('open');
  productModal.setAttribute('aria-hidden', 'false');
  lockBodyScroll();

  if (productModalClose) {
    safeFocus(productModalClose);
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
  unlockBodyScroll();

  if (lastFocusedElement) {
    safeFocus(lastFocusedElement);
  }

  lastFocusedElement = null;
}

function getCartQuantityForProduct(productId) {
  if (!productId) {
    return 0;
  }
  const item = cart.find((entry) => String(entry.id) === String(productId));
  return item ? Number(item.quantity) || 0 : 0;
}

function findProductById(productId) {
  if (!productId) {
    return null;
  }
  const idString = String(productId);
  if (Array.isArray(lastLoadedProducts) && lastLoadedProducts.length) {
    const match = lastLoadedProducts.find((product) => String(product._id) === idString);
    if (match) {
      return match;
    }
  }
  if (cachedProductsData && Array.isArray(cachedProductsData.products)) {
    const match = cachedProductsData.products.find((product) => String(product._id) === idString);
    if (match) {
      return match;
    }
  }
  return null;
}

function getProductAvailabilityDays(product) {
  const normalized = normalizeAvailabilityDaysForRender(product ? product.availabilityDays : undefined);
  if (normalized.daily) {
    return PRODUCT_DAY_ABBREVIATIONS.map((_, index) => index);
  }
  return normalized.days.slice();
}

function addToCart(id, price, name) {
  const productId = String(id);
  const productData = findProductById(productId);
  const availabilityDays = productData ? getProductAvailabilityDays(productData) : null;
  if (activeMenuDateString) {
    const stockInfo = getActiveMenuStockInfo(productId);
    if (stockInfo) {
      const currentQty = getCartQuantityForProduct(productId);
      if (currentQty >= stockInfo.remaining) {
        showStockLimitNotice(name, stockInfo.remaining);
        return;
      }
    }
  }
  const existing = cart.find((item) => item.id === id);
  if (existing) {
    existing.quantity += 1;
    if ((!Array.isArray(existing.availabilityDays) || !existing.availabilityDays.length) && Array.isArray(availabilityDays)) {
      existing.availabilityDays = availabilityDays.slice();
    }
  } else {
    const newItem = { id, price, name, quantity: 1 };
    if (Array.isArray(availabilityDays)) {
      newItem.availabilityDays = availabilityDays.slice();
    }
    cart.push(newItem);
  }
  saveCart();
  if (activeMenuDateString && activeMenuStockByProductId.size) {
    renderProductsByCategory(lastLoadedCategories, lastLoadedProducts);
  }
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

  cartActionModal.classList.remove('stock-warning');
  cartActionModal.classList.add('open');
  cartActionModal.setAttribute('aria-hidden', 'false');
  lockBodyScroll();

  const focusTarget = cartActionGoToCart || cartActionContinue || cartActionClose;
  if (focusTarget) {
    safeFocus(focusTarget);
  }
}

function showStockLimitNotice(productName, remaining) {
  const message = remaining > 0
    ? `Możesz dodać maksymalnie ${remaining} szt. produktu ${productName} na wybrany dzień.`
    : `Brak dostępnych sztuk produktu ${productName} na wybrany dzień.`;

  if (!cartActionModal || !cartActionMessage) {
    window.alert(message);
    return;
  }

  lastCartActionFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  cartActionMessage.textContent = message;
  cartActionModal.classList.add('open', 'stock-warning');
  cartActionModal.setAttribute('aria-hidden', 'false');
  lockBodyScroll();

  const focusTarget = cartActionContinue || cartActionClose || cartActionGoToCart;
  if (focusTarget) {
    safeFocus(focusTarget);
  }
}

function closeCartActionModal() {
  if (!cartActionModal || !cartActionModal.classList.contains('open')) {
    return;
  }

  cartActionModal.classList.remove('open');
  cartActionModal.classList.remove('stock-warning');
  cartActionModal.setAttribute('aria-hidden', 'true');
  unlockBodyScroll();

  if (lastCartActionFocusedElement) {
    safeFocus(lastCartActionFocusedElement);
  }

  lastCartActionFocusedElement = null;
}

let storefrontInitialized = false;

function initializeStorefront() {
  if (storefrontInitialized) {
    return;
  }
  storefrontInitialized = true;

  setupExternalStockSync();

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
