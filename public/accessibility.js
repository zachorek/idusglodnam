const availabilityGrid = document.getElementById('availabilityGrid');
const availabilityError = document.getElementById('availabilityError');
const accessibilityHeroSection = document.querySelector('.accessibility-hero');

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const ORDER_PAGE_URL = '/index';
const ORDER_PRODUCT_PARAM = 'product';

let cachedOrderProductsIndex = null;
let orderProductsIndexPromise = null;

function buildAvailabilityProductSlug(value) {
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

function buildOrderProductsIndex(products) {
  const map = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    if (!product || !product.name) {
      return;
    }
    const slug = buildAvailabilityProductSlug(product.name);
    if (!slug) {
      return;
    }
    map.set(slug, {
      slug,
      id: product._id,
      name: product.name
    });
  });
  return map;
}

function ensureOrderProductsIndex() {
  if (cachedOrderProductsIndex) {
    return Promise.resolve(cachedOrderProductsIndex);
  }
  if (!orderProductsIndexPromise) {
    orderProductsIndexPromise = fetch('/api/products')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Nie udało się pobrać listy produktów');
        }
        return response.json();
      })
      .then((products) => {
        cachedOrderProductsIndex = buildOrderProductsIndex(products);
        return cachedOrderProductsIndex;
      })
      .catch((error) => {
        console.warn('Nie udało się pobrać listy produktów dla linków dostępności:', error);
        cachedOrderProductsIndex = new Map();
        orderProductsIndexPromise = null;
        return cachedOrderProductsIndex;
      });
  }
  return orderProductsIndexPromise;
}

function resolveOrderProductLink(productName, productIndex) {
  if (!productName || !productIndex || typeof productIndex.get !== 'function') {
    return null;
  }
  const slug = buildAvailabilityProductSlug(productName);
  if (!slug) {
    return null;
  }
  const product = productIndex.get(slug);
  if (!product) {
    return null;
  }
  return {
    slug: product.slug || slug,
    name: product.name || productName
  };
}

window.addEventListener('DOMContentLoaded', () => {
  loadAccessibilityHeroBackground();
  loadAvailabilitySchedule();
});

async function loadAccessibilityHeroBackground() {
  if (!accessibilityHeroSection) {
    return;
  }

  try {
    const response = await fetch('/api/accessibility-content');
    if (!response.ok) {
      throw new Error('Nie udało się pobrać danych sekcji dostępności');
    }

    const data = await response.json();
    applyAccessibilityHeroBackground(data);
  } catch (error) {
    console.error('Błąd pobierania tła sekcji dostępności:', error);
    applyAccessibilityHeroBackground(null);
  }
}

function applyAccessibilityHeroBackground(content) {
  if (!accessibilityHeroSection) {
    return;
  }

  const heroImage = (() => {
    if (content && typeof content.heroImageUrl === 'string' && content.heroImageUrl.trim()) {
      return content.heroImageUrl.trim();
    }
    if (content && typeof content.heroImageData === 'string' && content.heroImageData.trim()) {
      return content.heroImageData.trim();
    }
    return '';
  })();

  if (heroImage) {
    const sanitized = heroImage.replace(/"/g, '\\"');
    accessibilityHeroSection.style.setProperty('--accessibility-hero-image', `url("${sanitized}")`);
    accessibilityHeroSection.classList.add('accessibility-hero--with-image');
  } else {
    accessibilityHeroSection.style.removeProperty('--accessibility-hero-image');
    accessibilityHeroSection.classList.remove('accessibility-hero--with-image');
  }
}

async function loadAvailabilitySchedule() {
  if (!availabilityGrid) {
    return;
  }

  try {
    toggleAvailabilityError(false);
    availabilityGrid.classList.add('is-loading');

    const [schedule, productIndex] = await Promise.all([
      fetchAvailabilityData(),
      ensureOrderProductsIndex().catch(() => new Map())
    ]);
    renderAvailabilityCards(schedule, productIndex);
  } catch (error) {
    console.error('Błąd pobierania harmonogramu dostępności:', error);
    renderAvailabilityCards([], new Map());
    toggleAvailabilityError(true, 'Nie udało się załadować harmonogramu. Spróbuj ponownie później.');
  } finally {
    availabilityGrid.classList.remove('is-loading');
  }
}

async function fetchAvailabilityData() {
  const response = await fetch('/api/availability');
  if (!response.ok) {
    throw new Error('Nie udało się pobrać danych o dostępności');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function renderAvailabilityCards(schedule, productIndex = new Map()) {
  if (!availabilityGrid) {
    return;
  }

  availabilityGrid.innerHTML = '';

  const hasData = Array.isArray(schedule) && schedule.length;
  const data = hasData
    ? schedule
    : DAYS_OF_WEEK.map((dayName, dayIndex) => ({ dayIndex, dayName, entries: [], details: '', updatedAt: null }));

  data.forEach((day, index) => {
    availabilityGrid.appendChild(createAvailabilityCard(day, index, productIndex));
  });
}

function createAvailabilityCard(day, index, productIndex = new Map()) {
  const card = document.createElement('article');
  card.className = 'availability-card';
  card.style.setProperty('--card-index', index);

  const header = document.createElement('header');
  header.className = 'availability-card__header';

  const title = document.createElement('h3');
  title.textContent = day.dayName || DAYS_OF_WEEK[day.dayIndex] || '';
  header.appendChild(title);

  const timeInfo = document.createElement('p');
  timeInfo.className = 'availability-card__time';
  header.appendChild(timeInfo);

  const body = document.createElement('div');
  body.className = 'availability-card__body';

  if (day.details) {
    const details = document.createElement('p');
    details.className = 'availability-card__details';
    details.textContent = day.details;
    body.appendChild(details);
  }

  const entries = Array.isArray(day.entries)
    ? day.entries.filter((entry) => entry && (entry.product || entry.availableFrom))
    : [];

  if (entries.length) {
    const list = document.createElement('ul');
    list.className = 'availability-card__list';

    const sorted = entries.slice().sort((a, b) => {
      const aKey = normalizeTimeKey(a.availableFrom);
      const bKey = normalizeTimeKey(b.availableFrom);
      return aKey.localeCompare(bKey);
    });

    const firstWithTime = sorted.find((entry) => entry.availableFrom);
    if (!firstWithTime || !firstWithTime.availableFrom) {
      timeInfo.textContent = 'Wypieki dostępne w ciągu dnia.';
    } else {
      timeInfo.textContent = '';
    }

    sorted.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'availability-card__list-item';

      const productLabel = entry.product || 'Produkt';
      const linkTarget = resolveOrderProductLink(entry.product, productIndex);
      let productNode;
      if (linkTarget) {
        productNode = document.createElement('a');
        productNode.href = `${ORDER_PAGE_URL}?${ORDER_PRODUCT_PARAM}=${encodeURIComponent(linkTarget.slug)}`;
        productNode.className = 'availability-card__list-product availability-card__list-link';
        productNode.setAttribute('aria-label', `Przejdź do zamówienia produktu ${productLabel}`);
        productNode.title = 'Przejdź do produktu w zakładce Zamów';
      } else {
        productNode = document.createElement('span');
        productNode.className = 'availability-card__list-product';
      }
      productNode.textContent = productLabel;
      item.appendChild(productNode);

      const time = document.createElement('span');
      time.className = 'availability-card__list-time';
      time.textContent = entry.availableFrom
        ? `od ${normalizeTimeLabel(entry.availableFrom)}`
        : 'godzina do potwierdzenia';
      item.appendChild(time);

      list.appendChild(item);
    });

    body.appendChild(list);
  } else {
    timeInfo.textContent = 'Brak zaplanowanych pozycji na ten dzień.';

    const empty = document.createElement('p');
    empty.className = 'availability-card__empty';
    empty.textContent = 'Oferta na ten dzień pojawi się wkrótce.';
    body.appendChild(empty);
  }

  card.append(header, body);
  return card;
}

function normalizeTimeKey(value) {
  if (!value) {
    return '99:99';
  }
  const match = String(value).match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return String(value);
  }
  const hour = match[1].padStart(2, '0');
  const minute = match[2] ? match[2].slice(0, 2) : '00';
  return `${hour}:${minute}`;
}

function normalizeTimeLabel(value) {
  const key = normalizeTimeKey(value);
  if (key === String(value)) {
    return key;
  }
  return key;
}

function toggleAvailabilityError(visible, message) {
  if (!availabilityError) {
    return;
  }

  if (visible) {
    availabilityError.hidden = false;
    availabilityError.textContent = message;
  } else {
    availabilityError.hidden = true;
    availabilityError.textContent = '';
  }
}
