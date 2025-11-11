const hostForm = document.getElementById("hostForm");
const hostMessage = document.getElementById("hostMessage");
const productGrid = document.getElementById("productGrid");
const categoryForm = document.getElementById("categoryForm");
const categoryMessage = document.getElementById("categoryMessage");
const categoryList = document.getElementById("categoryList");
const categorySelect = document.getElementById("categorySelect");
const imageInput = document.getElementById("image");
const availabilityManager = document.getElementById("availabilityManager");
const availabilityMessage = document.getElementById("availabilityMessage");
const discountForm = document.getElementById("discountForm");
const discountMessage = document.getElementById("discountMessage");
const discountList = document.getElementById("discountList");
const discountCodeInput = document.getElementById("discountCode");
const discountPercentInput = document.getElementById("discountPercent");
const productAvailabilityDays = document.getElementById("productAvailabilityDays");
const productAvailabilityAll = document.getElementById("productAvailabilityAll");
const productPickupTimesSection = document.getElementById("productPickupTimes");
const productPickupTimesGrid = document.getElementById("productPickupTimesGrid");
const aboutForm = document.getElementById("aboutForm");
const aboutTextInput = document.getElementById("aboutText");
const aboutImageInput = document.getElementById("aboutImage");
const aboutMessage = document.getElementById("aboutMessage");
const aboutPreviewText = document.getElementById("aboutPreviewText");
const aboutPreviewImage = document.getElementById("aboutPreviewImage");
const aboutNoImagePlaceholder = document.getElementById("aboutNoImagePlaceholder");
const aboutGalleryForm = document.getElementById("aboutGalleryForm");
const aboutGalleryImageInput = document.getElementById("aboutGalleryImage");
const aboutGalleryList = document.getElementById("aboutGalleryList");
const aboutGalleryMessage = document.getElementById("aboutGalleryMessage");
const accessibilityHeroForm = document.getElementById("accessibilityHeroForm");
const accessibilityHeroImageInput = document.getElementById("accessibilityHeroImage");
const accessibilityHeroMessage = document.getElementById("accessibilityHeroMessage");
const accessibilityHeroPreviewImage = document.getElementById("accessibilityHeroPreviewImage");
const accessibilityHeroNoImagePlaceholder = document.getElementById("accessibilityHeroNoImagePlaceholder");
const accessibilityHeroRemoveButton = document.getElementById("accessibilityHeroRemove");
const accessibilityHeroPreviewText = document.getElementById("accessibilityHeroPreviewText");
const productEditModal = document.getElementById("productEditModal");
const productEditForm = document.getElementById("productEditForm");
const productEditNameInput = document.getElementById("productEditName");
const productEditPriceInput = document.getElementById("productEditPrice");
const productEditDescInput = document.getElementById("productEditDesc");
const productEditCategorySelect = document.getElementById("productEditCategory");
const productEditAvailabilityDays = document.getElementById("productEditAvailabilityDays");
const productEditAvailabilityAll = document.getElementById("productEditAvailabilityAll");
const productEditImageInput = document.getElementById("productEditImage");
const productEditImagePreview = document.getElementById("productEditImagePreview");
const productEditImagePlaceholder = document.getElementById("productEditImagePlaceholder");
const productEditMessage = document.getElementById("productEditMessage");
const productEditCloseButton = document.getElementById("productEditClose");
const productEditCancelButton = document.getElementById("productEditCancel");
const productEditModalTitle = document.getElementById("productEditModalTitle");
const productEditModalSubtitle = document.getElementById("productEditModalSubtitle");

const PRODUCTS_CACHE_KEY = 'chachor.productsCache';

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const PRODUCT_DAY_ABBREVIATIONS = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
const ALL_DAY_INDICES = DAYS_OF_WEEK.map((_, index) => index);
const MAX_AVAILABILITY_TILES = 6;
const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';
const DEFAULT_ACCESSIBILITY_TAGLINE = 'Sprawdź, co serwujemy w poszczególne dni tygodnia i kiedy możesz odebrać swoje wypieki.';

let categoriesCache = [];
let discountCodesCache = [];
let productGridListenerAttached = false;
let availabilityMessageTimer = null;
let aboutGalleryCache = [];
let accessibilityHeroCurrentImageSrc = '';
let hostProductsCache = [];
let currentEditingProductId = '';
let currentEditingProduct = null;
let productEditPreviewObjectUrl = '';

if (categoryList) {
  fetchCategories();
  categoryList.addEventListener("click", handleCategoryListClick);
  categoryList.addEventListener('change', handleCategoryListChange, true);
}

if (productGrid) {
  fetchProducts();
}

if (availabilityManager) {
  fetchAvailabilitySchedule();
  availabilityManager.addEventListener('click', handleAvailabilityClick);
}

if (discountList) {
  fetchDiscountCodes();
  discountList.addEventListener('click', handleDiscountListClick);
}

if (discountForm) {
  discountForm.addEventListener('submit', handleDiscountFormSubmit);
}

if (productAvailabilityDays) {
  renderProductAvailabilityToggles();
}

if (productAvailabilityAll) {
  productAvailabilityAll.addEventListener('change', handleProductAvailabilityAllToggle);
}

if (aboutImageInput) {
  aboutImageInput.addEventListener('change', handleAboutImageChange);
}

if (aboutForm) {
  aboutForm.addEventListener('submit', handleAboutFormSubmit);
}

if (aboutGalleryForm) {
  aboutGalleryForm.addEventListener('submit', handleAboutGalleryFormSubmit);
}

if (aboutGalleryList) {
  aboutGalleryList.addEventListener('click', handleAboutGalleryListClick);
}

if (accessibilityHeroImageInput) {
  accessibilityHeroImageInput.addEventListener('change', handleAccessibilityHeroImageChange);
}

if (accessibilityHeroForm) {
  accessibilityHeroForm.addEventListener('submit', handleAccessibilityHeroFormSubmit);
}

if (accessibilityHeroRemoveButton) {
  accessibilityHeroRemoveButton.addEventListener('click', handleAccessibilityHeroRemove);
}

if (accessibilityHeroPreviewText) {
  accessibilityHeroPreviewText.textContent = `Dostępność i odbiory. ${DEFAULT_ACCESSIBILITY_TAGLINE}`;
}

if (productEditForm) {
  productEditForm.addEventListener('submit', handleProductEditFormSubmit);
}

if (productEditCloseButton) {
  productEditCloseButton.addEventListener('click', closeProductEditModal);
}

if (productEditCancelButton) {
  productEditCancelButton.addEventListener('click', closeProductEditModal);
}

if (productEditModal) {
  productEditModal.addEventListener('click', handleProductEditModalBackdropClick);
  document.addEventListener('keydown', handleProductEditEscClose, true);
}

if (productEditAvailabilityDays) {
  renderProductEditAvailabilityToggles();
}

if (productEditAvailabilityAll) {
  productEditAvailabilityAll.addEventListener('change', handleProductEditAvailabilityAllToggle);
}

if (productEditImageInput) {
  productEditImageInput.addEventListener('change', handleProductEditImageChange);
}

if (productEditMessage) {
  productEditMessage.hidden = true;
}

function truncateText(text, maxLength) {
  if (!text) {
    return '';
  }
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

fetchAccessibilityContent();
fetchAboutContent();

if (categoryForm) {
  categoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("categoryName").value.trim();

    if (!name) {
      categoryMessage.innerHTML = '<p style=\"color:red\">Nazwa kategorii jest wymagana</p>';
      return;
    }

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (!res.ok) {
        throw new Error('Błąd odpowiedzi serwera');
      }

      const data = await res.json();
      categoryMessage.innerHTML = `<p style="color:green">Dodano kategorię "${data.name}"</p>`;
      categoryForm.reset();
      await fetchCategories();
    } catch (err) {
      console.error(err);
      categoryMessage.innerHTML = '<p style="color:red">Błąd dodawania kategorii</p>';
    }
  });
}

if (categorySelect) {
  populateCategorySelect();
}

if (hostForm) {
  hostForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const priceValue = document.getElementById("price").value;
    const desc = document.getElementById("desc").value.trim();
    const category = categorySelect ? categorySelect.value : '';
    const imageFile = imageInput && imageInput.files ? imageInput.files[0] : null;

    if (!imageFile) {
      hostMessage.innerHTML = '<p style="color:red">Dodaj zdjęcie produktu</p>';
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('price', priceValue);
    formData.append('desc', desc);
    formData.append('category', category);
    formData.append('image', imageFile);

    const selectedDays = getSelectedProductAvailabilityDays();
    const availabilityIsDaily = Boolean(productAvailabilityAll && productAvailabilityAll.checked);
    if (availabilityIsDaily) {
      formData.append('availabilityDays', 'ALL');
    } else {
      formData.append('availabilityDays', JSON.stringify(selectedDays));
    }

    const pickupDayIndices = availabilityIsDaily ? ALL_DAY_INDICES.slice() : selectedDays.slice();
    if (pickupDayIndices.length) {
      const {
        payload: pickupTimesPayload,
        missingDays,
        extraDays
      } = collectPickupTimesPayload(pickupDayIndices);

      if (extraDays.length) {
        const blockedLabels = Array.from(new Set(extraDays))
          .map((dayIndex) => DAYS_OF_WEEK[dayIndex] || `Dzień ${dayIndex + 1}`);
        hostMessage.innerHTML = `<p style="color:red">Godziny odbioru możesz ustawić tylko w zaznaczonych dniach. Usuń wpisy dla: ${blockedLabels.join(', ')}</p>`;
        return;
      }

      if (missingDays.length) {
        const missingLabels = missingDays.map((dayIndex) => DAYS_OF_WEEK[dayIndex] || `Dzień ${dayIndex + 1}`);
        hostMessage.innerHTML = `<p style="color:red">Podaj godzinę odbioru dla: ${missingLabels.join(', ')}</p>`;
        return;
      }

      formData.append('pickupTimes', JSON.stringify(pickupTimesPayload));
    }

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        body: formData
      });

      let data = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        data = null;
      }

      if (!res.ok) {
        const message = data && data.error ? data.error : 'Błąd dodawania produktu';
        throw new Error(message);
      }

      if (!data) {
        throw new Error('Nieoczekiwany błąd serwera');
      }

      hostMessage.innerHTML = `<p style="color:green">Produkt "${data.name}" został dodany!</p>`;
      hostForm.reset();
      resetProductAvailabilitySelector();
      resetProductPickupTimes();
      if (imageInput) {
        imageInput.value = '';
      }
      invalidateStorefrontProductsCache();
      if (productGrid) {
        fetchProducts();
      }
    } catch (err) {
      console.error(err);
      const message = err && err.message ? err.message : 'Błąd dodawania produktu';
      hostMessage.innerHTML = `<p style="color:red">${message}</p>`;
    }
  });
}

function getProductAvailabilityCheckboxes() {
  if (!productAvailabilityDays) {
    return [];
  }
  return Array.from(productAvailabilityDays.querySelectorAll('input[type="checkbox"][data-role="product-day"]'));
}

function renderProductAvailabilityToggles() {
  if (!productAvailabilityDays) {
    return;
  }

  productAvailabilityDays.innerHTML = '';

  DAYS_OF_WEEK.forEach((dayName, index) => {
    const label = document.createElement('label');
    label.className = 'host-product-availability__toggle';
    label.dataset.dayIndex = String(index);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(index);
    input.dataset.role = 'product-day';
    input.setAttribute('aria-label', dayName);
    input.addEventListener('change', handleProductAvailabilityDayChange);

    const tile = document.createElement('span');
    tile.textContent = PRODUCT_DAY_ABBREVIATIONS[index] || '';
    tile.title = dayName;
    tile.setAttribute('aria-hidden', 'true');

    label.append(input, tile);
    productAvailabilityDays.appendChild(label);
  });

  updateProductPickupTimesVisibility();
}

function handleProductAvailabilityDayChange() {
  const checkboxes = getProductAvailabilityCheckboxes();
  if (productAvailabilityAll) {
    if (!checkboxes.length) {
      productAvailabilityAll.checked = false;
    } else {
      const everyChecked = checkboxes.every((checkbox) => checkbox.checked);
      productAvailabilityAll.checked = everyChecked;
    }
  }
  updateProductPickupTimesVisibility();
}

function handleProductAvailabilityAllToggle(event) {
  const isChecked = Boolean(event && event.target && event.target.checked);
  getProductAvailabilityCheckboxes().forEach((checkbox) => {
    checkbox.checked = isChecked;
  });
  handleProductAvailabilityDayChange();
}

function getSelectedProductAvailabilityDays() {
  return getProductAvailabilityCheckboxes()
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < DAYS_OF_WEEK.length)
    .sort((a, b) => a - b);
}

function resetProductAvailabilitySelector() {
  getProductAvailabilityCheckboxes().forEach((checkbox) => {
    checkbox.checked = false;
  });
  if (productAvailabilityAll) {
    productAvailabilityAll.checked = false;
  }
  resetProductPickupTimes();
}

function renderProductPickupTimeInputs() {
  if (!productPickupTimesGrid || productPickupTimesGrid.dataset.initialized === 'true') {
    return;
  }
  productPickupTimesGrid.dataset.initialized = 'true';
  productPickupTimesGrid.innerHTML = '';
  DAYS_OF_WEEK.forEach((dayName, index) => {
    const card = document.createElement('div');
    card.className = 'host-pickup-time-card';
    card.dataset.dayIndex = String(index);
    card.hidden = true;

    const dayLabel = document.createElement('span');
    dayLabel.className = 'host-pickup-time-card__day';
    dayLabel.textContent = dayName;

    const input = document.createElement('input');
    input.type = 'time';
    input.step = 300;
    input.placeholder = '07:30';
    input.autocomplete = 'off';
    input.className = 'host-pickup-time-card__input';
    input.dataset.dayIndex = String(index);
    input.disabled = true;

    card.append(dayLabel, input);
    productPickupTimesGrid.appendChild(card);
  });
}

function updateProductPickupTimesVisibility() {
  if (!productPickupTimesSection || !productPickupTimesGrid) {
    return;
  }
  renderProductPickupTimeInputs();
  const selectedDays = productAvailabilityAll && productAvailabilityAll.checked
    ? ALL_DAY_INDICES.slice()
    : getSelectedProductAvailabilityDays();
  const hasSelection = selectedDays.length > 0;
  productPickupTimesSection.hidden = !hasSelection;
  productPickupTimesSection.setAttribute('aria-hidden', hasSelection ? 'false' : 'true');
  const cards = Array.from(productPickupTimesGrid.querySelectorAll('.host-pickup-time-card'));
  cards.forEach((card) => {
    const dayIndex = Number(card.dataset.dayIndex);
    const isActive = selectedDays.includes(dayIndex);
    const input = card.querySelector('input[type="time"]');
    card.hidden = !isActive;
    if (input) {
      input.disabled = !isActive;
      input.required = isActive;
      if (!isActive) {
        input.value = '';
      }
    }
  });
}

function resetProductPickupTimes() {
  if (!productPickupTimesSection || !productPickupTimesGrid) {
    return;
  }
  productPickupTimesSection.hidden = true;
  productPickupTimesSection.setAttribute('aria-hidden', 'true');
  Array.from(productPickupTimesGrid.querySelectorAll('.host-pickup-time-card')).forEach((card) => {
    card.hidden = true;
    const input = card.querySelector('input[type="time"]');
    if (input) {
      input.value = '';
      input.required = false;
      input.disabled = true;
    }
  });
}

function getPickupTimeInput(dayIndex) {
  if (!productPickupTimesGrid) {
    return null;
  }
  return productPickupTimesGrid.querySelector(`.host-pickup-time-card[data-day-index="${dayIndex}"] input[type="time"]`);
}

function collectPickupTimesPayload(dayIndices) {
  const payload = {};
  const missingDays = [];
  const extraDays = [];
  if (!Array.isArray(dayIndices) || !dayIndices.length) {
    return { payload, missingDays, extraDays };
  }

  const allowedSet = new Set(
    dayIndices
      .map((value) => Number(value))
      .filter((num) => Number.isInteger(num))
  );

  dayIndices.forEach((dayIndex) => {
    const input = getPickupTimeInput(dayIndex);
    if (!input) {
      missingDays.push(dayIndex);
      return;
    }
    const value = (input.value || '').trim();
    if (!value) {
      missingDays.push(dayIndex);
    } else {
      payload[dayIndex] = value;
    }
  });

  if (productPickupTimesGrid) {
    const rogueInputs = Array.from(productPickupTimesGrid.querySelectorAll('.host-pickup-time-card input[type="time"]'));
    rogueInputs.forEach((input) => {
      const value = (input.value || '').trim();
      if (!value) {
        return;
      }
      const dayIndex = Number(input.dataset.dayIndex);
      if (!allowedSet.has(dayIndex)) {
        extraDays.push(dayIndex);
      }
    });
  }

  return { payload, missingDays, extraDays };
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
      // ignore JSON errors and fallback to comma-separated parsing
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
    .filter((num) => Number.isInteger(num) && num >= 0 && num < DAYS_OF_WEEK.length);
  const unique = Array.from(new Set(normalized)).sort((a, b) => a - b);
  const daily = unique.length === DAYS_OF_WEEK.length;
  return { daily, days: unique };
}

function renderProductAvailabilityTiles(days) {
  const data = normalizeAvailabilityDaysForRender(days);
  const tiles = [];

  if (data.daily) {
    tiles.push({ abbr: 'codziennie', label: 'Dostępne codziennie', modifier: 'daily' });
  } else if (data.days.length) {
    data.days.forEach((index) => {
      tiles.push({
        abbr: PRODUCT_DAY_ABBREVIATIONS[index] || '?',
        label: `Dostępne w ${DAYS_OF_WEEK[index] || ''}`.trim()
      });
    });
  } else {
    tiles.push({ abbr: '--', label: 'Brak określonych dni', modifier: 'muted' });
  }

  const limited = tiles.slice(0, MAX_AVAILABILITY_TILES);
  const itemsMarkup = limited.map((tile) => {
    const classes = ['product-availability-tile'];
    if (tile.modifier) {
      classes.push(`product-availability-tile--${tile.modifier}`);
    }
    return `<span class="${classes.join(' ')}" aria-label="${tile.label}" title="${tile.label}">${tile.abbr}</span>`;
  }).join('');

  return `<div class="product-availability-grid" aria-label="Dni dostępności">${itemsMarkup}</div>`;
}

function normalizeEntryTime(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hourRaw, minuteRaw] = raw.split(':');
    return `${hourRaw.padStart(2, '0')}:${minuteRaw}`;
  }

  const separatorMatch = raw.match(/^(\d{1,2})[\.\-,\s](\d{1,2})$/);
  if (separatorMatch) {
    const hour = separatorMatch[1].padStart(2, '0');
    const minute = separatorMatch[2].padEnd(2, '0').slice(0, 2);
    return `${hour}:${minute}`;
  }

  if (/^\d{3,4}$/.test(raw)) {
    const digits = raw.padStart(4, '0');
    const hour = digits.slice(0, digits.length - 2);
    const minute = digits.slice(-2);
    return `${hour.padStart(2, '0')}:${minute}`;
  }

  if (/^\d{1,2}$/.test(raw)) {
    return `${raw.padStart(2, '0')}:00`;
  }

  return null;
}



async function fetchAvailabilitySchedule() {
  try {
    const res = await fetch('/api/availability');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    const schedule = await res.json();
    renderAvailabilityManager(Array.isArray(schedule) ? schedule : []);
  } catch (err) {
    console.error('Błąd pobierania dostępności:', err);
    renderAvailabilityManager([]);
    showAvailabilityNotice('error', 'Nie udało się pobrać harmonogramu. Spróbuj ponownie.');
  }
}

function renderAvailabilityManager(schedule) {
  if (!availabilityManager) {
    return;
  }

  availabilityManager.innerHTML = '';

  const data = Array.isArray(schedule) && schedule.length
    ? schedule
    : DAYS_OF_WEEK.map((dayName, dayIndex) => ({ dayIndex, dayName, entries: [], updatedAt: null }));

  data.forEach((day) => {
    availabilityManager.appendChild(createAvailabilityCard(day));
  });
}

function createAvailabilityCard(day) {
  const card = document.createElement('article');
  card.className = 'availability-manager-card';
  card.dataset.dayIndex = String(day.dayIndex);

  const header = document.createElement('div');
  header.className = 'availability-manager-card__header';

  const title = document.createElement('h3');
  title.textContent = day.dayName || DAYS_OF_WEEK[day.dayIndex] || '';
  header.appendChild(title);

  // No longer display last update metadata; the header stays minimal.

  const entriesSection = document.createElement('div');
  entriesSection.className = 'availability-entries-section';

  const entriesHeader = document.createElement('div');
  entriesHeader.className = 'availability-entries-header';
  const entriesTitle = document.createElement('span');
  entriesTitle.textContent = 'Wypieki dostępne w tym dniu';
  entriesHeader.appendChild(entriesTitle);

  const addEntryButton = document.createElement('button');
  addEntryButton.type = 'button';
  addEntryButton.className = 'availability-entry-add';
  addEntryButton.dataset.dayIndex = String(day.dayIndex);
  addEntryButton.textContent = 'Dodaj pozycję';
  addEntryButton.setAttribute('aria-label', 'Dodaj nowy wypiek z godziną dostępności');
  entriesHeader.appendChild(addEntryButton);

  const entriesList = document.createElement('div');
  entriesList.className = 'availability-entries';
  populateAvailabilityEntries(entriesList, Array.isArray(day.entries) ? day.entries : []);

  entriesSection.append(entriesHeader, entriesList);

  const actions = document.createElement('div');
  actions.className = 'availability-actions';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'availability-save';
  saveButton.dataset.dayIndex = String(day.dayIndex);
  saveButton.textContent = 'Zapisz dzień';
  actions.appendChild(saveButton);

  card.append(header, entriesSection, actions);
  return card;
}

function appendAvailabilityEntryRow(container, entry = {}) {
  if (!container) {
    return;
  }

  const row = document.createElement('div');
  row.className = 'availability-entry';

  const productInput = document.createElement('input');
  productInput.className = 'availability-entry-input';
  productInput.dataset.role = 'entry-product';
  productInput.type = 'text';
  productInput.placeholder = 'Nazwa produktu (np. Bagietki)';
  productInput.value = entry && typeof entry.product === 'string' ? entry.product : '';

  const startInput = document.createElement('input');
  startInput.className = 'availability-entry-input availability-entry-time';
  startInput.dataset.role = 'entry-start';
  startInput.type = 'text';
  startInput.placeholder = 'Dostępne od (np. 10:30)';
  startInput.inputMode = 'numeric';
  startInput.autocomplete = 'off';
  startInput.pattern = '\\d{1,2}:\\d{2}';
  startInput.value = entry && typeof entry.availableFrom === 'string' ? entry.availableFrom : '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'availability-entry-remove';
  removeButton.setAttribute('aria-label', 'Usuń pozycję');
  removeButton.textContent = 'Usuń';

  row.append(productInput, startInput, removeButton);
  container.appendChild(row);
  syncEntryRemoveButtons(container);
}

function populateAvailabilityEntries(container, entries) {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const data = Array.isArray(entries) && entries.length ? entries : [{}];
  data.forEach((entry) => appendAvailabilityEntryRow(container, entry));
}

function syncEntryRemoveButtons(container) {
  if (!container) {
    return;
  }

  const rows = Array.from(container.querySelectorAll('.availability-entry'));
  rows.forEach((row) => {
    const button = row.querySelector('.availability-entry-remove');
    if (!button) {
      return;
    }
    button.disabled = false;
    button.classList.remove('is-disabled');
  });
}

function updateAvailabilityCard(card, updated) {
  const entriesContainer = card.querySelector('.availability-entries');
  if (entriesContainer) {
    populateAvailabilityEntries(entriesContainer, updated && Array.isArray(updated.entries) ? updated.entries : []);
  }

}

function showAvailabilityNotice(type, message) {
  if (!availabilityMessage) {
    return;
  }

  if (availabilityMessageTimer) {
    clearTimeout(availabilityMessageTimer);
    availabilityMessageTimer = null;
  }

  availabilityMessage.textContent = message;
  availabilityMessage.classList.remove('success', 'error', 'visible');

  if (type) {
    availabilityMessage.classList.add(type);
  }

  requestAnimationFrame(() => {
    availabilityMessage.classList.add('visible');
  });

  availabilityMessageTimer = setTimeout(() => {
    availabilityMessage.classList.remove('visible');
  }, 4000);
}

function handleAvailabilityClick(event) {
  const target = event.target;
  if (target.classList.contains('availability-entry-add')) {
    const card = target.closest('.availability-manager-card');
    const container = card ? card.querySelector('.availability-entries') : null;
    if (container) {
      appendAvailabilityEntryRow(container, {});
    }
    target.blur();
    return;
  }

  if (target.classList.contains('availability-entry-remove')) {
    const row = target.closest('.availability-entry');
    const container = row ? row.parentElement : null;
    if (row && container) {
      row.remove();
      if (!container.querySelector('.availability-entry')) {
        appendAvailabilityEntryRow(container, {});
      }
      syncEntryRemoveButtons(container);
    }
    return;
  }

  if (!target.classList.contains('availability-save')) {
    return;
  }

  const button = target;
  const dayIndex = Number(button.dataset.dayIndex);
  if (!Number.isInteger(dayIndex)) {
    return;
  }

  const card = button.closest('.availability-manager-card');
  if (!card) {
    return;
  }

  const entriesContainer = card.querySelector('.availability-entries');
  const rows = entriesContainer ? Array.from(entriesContainer.querySelectorAll('.availability-entry')) : [];
  const entries = [];
  let focusTarget = null;
  let errorMessage = '';

  rows.forEach((row) => {
    const productInput = row.querySelector('input[data-role="entry-product"]');
    const startInput = row.querySelector('input[data-role="entry-start"]');
    const product = productInput ? productInput.value.trim() : '';
    const availableFromRaw = startInput ? startInput.value.trim() : '';

    if (!product && !availableFromRaw) {
      return;
    }

    if (!product || !availableFromRaw) {
      if (!focusTarget) {
        focusTarget = !product ? productInput : startInput;
        errorMessage = 'Uzupełnij nazwę wypieku i godzinę dostępności.';
      }
      return;
    }

    const normalizedTime = normalizeEntryTime(availableFromRaw);
    if (!normalizedTime) {
      if (!focusTarget) {
        focusTarget = startInput;
        errorMessage = 'Podaj godzinę w formacie HH:MM (np. 10:30).';
      }
      return;
    }

    if (startInput) {
      startInput.value = normalizedTime;
    }

    entries.push({ product, availableFrom: normalizedTime });
  });

  if (!entries.length || focusTarget) {
    showAvailabilityNotice('error', errorMessage || 'Dodaj przynajmniej jedną pozycję wraz z godziną dostępności.');
    if (!focusTarget && entriesContainer) {
      focusTarget = entriesContainer.querySelector('input[data-role="entry-product"]') ||
        entriesContainer.querySelector('input[data-role="entry-start"]');
    }
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
    return;
  }

  persistAvailability(dayIndex, entries, button, card);
}

async function persistAvailability(dayIndex, entries, button, card) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Zapisuję...';

  try {
    const res = await fetch(`/api/availability/${dayIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries })
    });

    if (!res.ok) {
      throw new Error('Błąd zapisu');
    }

    const updated = await res.json();
    updateAvailabilityCard(card, updated);
    showAvailabilityNotice('success', `Zapisano dostępność na ${updated.dayName || DAYS_OF_WEEK[dayIndex] || 'wybrany dzień'}.`);
    await fetchAvailabilitySchedule();
  } catch (err) {
    console.error('Błąd zapisu dostępności:', err);
    showAvailabilityNotice('error', 'Nie udało się zapisać zmian. Spróbuj ponownie.');
  } finally {
    button.disabled = false;
    button.textContent = originalText || 'Zapisz dzień';
  }
}

async function fetchProducts(forceRefresh = false) {
  if (!productGrid) {
    return;
  }

  try {
    const res = await fetch('/api/products');
    if (!res.ok) {
      throw new Error('Błąd pobierania produktów');
    }

    const products = await res.json();
    renderProducts(products);
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
    productGrid.innerHTML = '<p class="error-message">Nie udało się załadować produktów.</p>';
  }
}

function renderProducts(products) {
  if (!productGrid) {
    return;
  }

  hostProductsCache = Array.isArray(products) ? products.slice() : [];
  renderHostProductsFromCache();
}

function renderHostProductsFromCache() {
  if (!productGrid) {
    return;
  }

  productGrid.innerHTML = '';

  if (!hostProductsCache.length) {
    productGrid.innerHTML = '<p class="empty-state">Brak produktów do wyświetlenia.</p>';
    return;
  }

  const categories = Array.isArray(categoriesCache) ? categoriesCache : [];
  const fragment = document.createDocumentFragment();
  const categorized = new Map();

  categories.forEach((category) => {
    categorized.set(category.name, []);
  });

  const uncategorized = [];

  hostProductsCache.forEach((product) => {
    const bucket = categorized.get(product.category);
    if (bucket) {
      bucket.push(product);
    } else {
      uncategorized.push(product);
    }
  });

  let appended = false;

  categories.forEach((category) => {
    const items = categorized.get(category.name) || [];
    if (!items.length) {
      return;
    }
    fragment.appendChild(createHostCategorySection(category.name, items));
    appended = true;
  });

  if (uncategorized.length) {
    fragment.appendChild(createHostCategorySection('Pozostałe', uncategorized));
    appended = true;
  }

  if (!appended) {
    productGrid.innerHTML = '<p class="empty-state">Brak produktów do wyświetlenia.</p>';
    return;
  }

  productGrid.appendChild(fragment);

  if (!productGridListenerAttached) {
    productGrid.addEventListener('click', handleProductGridClick);
    productGridListenerAttached = true;
  }
}

function createHostCategorySection(title, items) {
  const section = document.createElement('section');
  section.className = 'category-group category-group--visible host-category-group';

  const heading = document.createElement('h3');
  heading.className = 'category-title';
  heading.textContent = title || 'Bez kategorii';
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'category-products host-category-products';

  items.forEach((product) => {
    list.appendChild(createHostProductCard(product));
  });

  section.appendChild(list);
  return section;
}

function createHostProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card host-product-card';
  if (product && product._id) {
    card.dataset.productId = product._id;
  }
  const isBlocked = Boolean(product && product.isBlocked);
  if (isBlocked) {
    card.classList.add('host-product-card--blocked');
  }

  const imageSrc = product.imageUrl || product.imageData || '';
  if (imageSrc) {
    card.classList.add('product-card--with-image');
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = product.name || '';
    img.className = 'product-thumb';
    card.appendChild(img);
  } else {
    card.classList.add('product-card--no-image');
  }

  const info = document.createElement('div');
  info.className = 'product-info host-product-info';

  if (isBlocked) {
    const statusBadge = document.createElement('span');
    statusBadge.className = 'host-product-status-badge';
    statusBadge.textContent = 'Produkt ukryty w menu';
    info.appendChild(statusBadge);
  }

  const title = document.createElement('h3');
  title.textContent = product.name || 'Produkt';
  info.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'product-desc';
  const fullDesc = (product.desc || '').trim();
  const truncatedDesc = truncateText(fullDesc, 160);
  desc.textContent = truncatedDesc;
  if (fullDesc && fullDesc !== truncatedDesc) {
    desc.title = fullDesc;
  }
  info.appendChild(desc);

  const price = document.createElement('p');
  price.className = 'product-price';
  price.innerHTML = `<strong>${product.price} zł</strong>`;
  info.appendChild(price);

  const actions = document.createElement('div');
  actions.className = 'host-product-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.dataset.id = product._id;
  editButton.className = 'host-secondary-btn edit-product-btn host-product-action';
  editButton.textContent = 'Edytuj kafelek';
  actions.appendChild(editButton);

  const blockButton = document.createElement('button');
  blockButton.type = 'button';
  blockButton.dataset.id = product._id;
  blockButton.dataset.blocked = isBlocked ? 'true' : 'false';
  blockButton.className = `host-secondary-btn block-product-btn host-product-action${isBlocked ? ' block-product-btn--active' : ''}`;
  blockButton.textContent = isBlocked ? 'Odblokuj produkt' : 'Zablokuj produkt';
  actions.appendChild(blockButton);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.dataset.id = product._id;
  deleteButton.className = 'delete-btn delete-product-btn host-product-action';
  deleteButton.textContent = 'Usuń produkt';
  actions.appendChild(deleteButton);

  info.appendChild(actions);
  card.appendChild(info);

  const availabilityMarkup = renderProductAvailabilityTiles(product.availabilityDays);
  card.insertAdjacentHTML('beforeend', availabilityMarkup);

  const pickupEditor = createProductPickupEditor(product);
  if (pickupEditor) {
    card.appendChild(pickupEditor);
  }

  return card;
}

function createProductPickupEditor(product) {
  if (!product || !product._id) {
    return null;
  }

  const hasAvailability = Array.isArray(product.availabilityDays) && product.availabilityDays.length > 0;
  const section = document.createElement('section');
  section.className = 'host-product-pickup-editor';

  const header = document.createElement('div');
  header.className = 'host-product-pickup-editor__header';
  const title = document.createElement('span');
  title.textContent = 'Godziny odbioru';
  header.appendChild(title);

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'host-text-btn host-product-pickup-editor__toggle';
  toggleButton.textContent = 'Edytuj';
  toggleButton.setAttribute('aria-expanded', 'false');
  header.appendChild(toggleButton);

  section.appendChild(header);

  const body = document.createElement('div');
  body.className = 'host-product-pickup-editor__body';
  body.hidden = true;
  body.setAttribute('aria-hidden', 'true');
  section.appendChild(body);

  if (!hasAvailability) {
    const notice = document.createElement('p');
    notice.className = 'host-product-pickup-editor__notice';
    notice.textContent = 'Najpierw ustaw dni dostępności, aby móc edytować godziny odbioru.';
    body.appendChild(notice);
    toggleButton.disabled = true;
    toggleButton.textContent = 'Brak dni';
    return section;
  }

  const form = document.createElement('form');
  form.className = 'host-product-pickup-form';
  form.dataset.productId = product._id;
  form.addEventListener('submit', handleProductPickupFormSubmit);

  const inputsGrid = document.createElement('div');
  inputsGrid.className = 'host-product-pickup-form__grid';
  inputsGrid.dataset.role = 'pickup-inputs';
  form.appendChild(inputsGrid);

  const actions = document.createElement('div');
  actions.className = 'host-product-pickup-form__actions';
  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'host-primary-btn host-primary-btn--compact';
  saveButton.textContent = 'Zapisz godziny';
  actions.appendChild(saveButton);
  form.appendChild(actions);

  const message = document.createElement('p');
  message.className = 'host-product-pickup-form__message';
  message.setAttribute('role', 'status');
  message.hidden = true;

  body.append(form, message);

  toggleButton.addEventListener('click', () => {
    const willOpen = body.hidden;
    body.hidden = !willOpen;
    body.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
    toggleButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen && !body.dataset.loaded && body.dataset.loading !== 'true') {
      loadProductPickupEditorData({
        productId: product._id,
        availabilityDays: product.availabilityDays,
        container: inputsGrid,
        messageEl: message,
        body
      });
    }
  });

  return section;
}

async function loadProductPickupEditorData({ productId, availabilityDays, container, messageEl, body }) {
  if (!productId || !container || !Array.isArray(availabilityDays) || !availabilityDays.length) {
    return;
  }
  if (body) {
    body.dataset.loading = 'true';
  }
  setProductPickupMessage(messageEl, 'Wczytywanie godzin odbioru...', 'info');
  renderProductPickupInputs(availabilityDays, container, {});
  try {
    const data = await fetchProductPickupTimesById(productId);
    const values = data && data.pickupTimes && typeof data.pickupTimes === 'object' ? data.pickupTimes : {};
    renderProductPickupInputs(availabilityDays, container, values);
    setProductPickupMessage(messageEl, '', '');
    if (body) {
      body.dataset.loaded = 'true';
    }
  } catch (err) {
    console.error('Błąd pobierania godzin odbioru produktu:', err);
    renderProductPickupInputs(availabilityDays, container, {});
    setProductPickupMessage(messageEl, err && err.message ? err.message : 'Nie udało się pobrać godzin odbioru.', 'error');
  } finally {
    if (body) {
      delete body.dataset.loading;
    }
  }
}

function renderProductPickupInputs(availabilityDays, container, values) {
  if (!container) {
    return;
  }
  container.innerHTML = '';
  const normalizedDays = Array.isArray(availabilityDays)
    ? availabilityDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day < DAYS_OF_WEEK.length)
        .sort((a, b) => a - b)
    : [];

  if (!normalizedDays.length) {
    const notice = document.createElement('p');
    notice.className = 'host-product-pickup-editor__notice';
    notice.textContent = 'Brak dni dostępności.';
    container.appendChild(notice);
    return;
  }

  normalizedDays.forEach((dayIndex) => {
    const row = document.createElement('label');
    row.className = 'host-product-pickup-form__row';
    row.dataset.dayIndex = String(dayIndex);

    const dayLabel = document.createElement('span');
    dayLabel.className = 'host-product-pickup-form__day';
    dayLabel.textContent = DAYS_OF_WEEK[dayIndex] || `Dzień ${dayIndex + 1}`;

    const input = document.createElement('input');
    input.type = 'time';
    input.step = 300;
    input.required = true;
    input.dataset.dayIndex = String(dayIndex);
    input.autocomplete = 'off';
    input.value = values && values[dayIndex] ? values[dayIndex] : '';

    row.append(dayLabel, input);
    container.appendChild(row);
  });
}

function setProductPickupMessage(element, text, variant = '') {
  if (!element) {
    return;
  }
  element.textContent = text || '';
  element.hidden = !text;
  element.classList.remove('host-product-pickup-form__message--error', 'host-product-pickup-form__message--success');
  if (!text) {
    return;
  }
  if (variant === 'error') {
    element.classList.add('host-product-pickup-form__message--error');
  } else if (variant === 'success') {
    element.classList.add('host-product-pickup-form__message--success');
  }
}

async function fetchProductPickupTimesById(productId) {
  const res = await fetch(`/api/products/${productId}/pickup-times`);
  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    payload = null;
  }
  if (!res.ok) {
    const message = payload && payload.error ? payload.error : 'Nie udało się pobrać godzin odbioru.';
    throw new Error(message);
  }
  return payload || {};
}

async function handleProductPickupFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const productId = form && form.dataset ? form.dataset.productId : '';
  if (!productId) {
    return;
  }

  const messageEl = form.nextElementSibling && form.nextElementSibling.classList.contains('host-product-pickup-form__message')
    ? form.nextElementSibling
    : null;
  setProductPickupMessage(messageEl, '');

  const inputs = Array.from(form.querySelectorAll('input[type="time"][data-day-index]'));
  const payload = {};
  const missingDays = [];
  inputs.forEach((input) => {
    const value = (input.value || '').trim();
    const dayIndex = Number(input.dataset.dayIndex);
    if (!value) {
      missingDays.push(dayIndex);
    } else {
      payload[dayIndex] = value;
    }
  });

  if (missingDays.length) {
    const labels = missingDays.map((dayIndex) => DAYS_OF_WEEK[dayIndex] || `Dzień ${dayIndex + 1}`);
    setProductPickupMessage(messageEl, `Uzupełnij godziny dla: ${labels.join(', ')}.`, 'error');
    const firstMissing = inputs.find((input) => !input.value);
    if (firstMissing && typeof firstMissing.focus === 'function') {
      firstMissing.focus();
    }
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton ? submitButton.textContent : '';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Zapisuję...';
  }

  try {
    const res = await fetch(`/api/products/${productId}/pickup-times`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickupTimes: payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data && data.error ? data.error : 'Nie udało się zapisać godzin odbioru.';
      throw new Error(message);
    }
    setProductPickupMessage(messageEl, 'Zapisano godziny odbioru.', 'success');
  } catch (err) {
    console.error('Błąd zapisu godzin odbioru produktu:', err);
    setProductPickupMessage(messageEl, err && err.message ? err.message : 'Nie udało się zapisać godzin odbioru.', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText || 'Zapisz godziny';
    }
  }
}

function updateHostProductsCache(updatedProduct) {
  if (!updatedProduct || !updatedProduct._id) {
    return;
  }

  const updatedId = updatedProduct._id;
  let found = false;

  hostProductsCache = hostProductsCache.map((item) => {
    if (item && item._id === updatedId) {
      found = true;
      return updatedProduct;
    }
    return item;
  });

  if (!found) {
    hostProductsCache.push(updatedProduct);
  }
}

async function toggleProductBlockState(productId, shouldBlock, button) {
  if (!productId) {
    return;
  }

  const targetLabel = shouldBlock ? 'blokuję...' : 'odblokowuję...';
  const originalText = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = targetLabel;
  }
  setProductEditMessage && setProductEditMessage('');

  try {
    const res = await fetch(`/api/products/${productId}/block`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isBlocked: shouldBlock })
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || 'Nie udało się zmienić statusu produktu.');
    }

    const updatedProduct = await res.json();
    updateHostProductsCache(updatedProduct);
    renderHostProductsFromCache();
    invalidateStorefrontProductsCache();
    if (hostMessage) {
      const actionInfo = shouldBlock ? 'zablokowano' : 'odblokowano';
      hostMessage.innerHTML = `<p style="color:green">Pomyślnie ${actionInfo} produkt "${updatedProduct.name || ''}".</p>`;
    }
  } catch (err) {
    console.error('Błąd zmiany statusu produktu:', err);
    alert(err.message || 'Nie udało się zmienić statusu produktu.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || (shouldBlock ? 'Zablokuj produkt' : 'Odblokuj produkt');
    }
  }
}

function openProductEditModal(product) {
  if (!product || !productEditModal || !productEditForm) {
    return;
  }

  currentEditingProductId = product._id || '';
  currentEditingProduct = product;

  if (!currentEditingProductId) {
    return;
  }

  productEditForm.reset();
  setProductEditMessage('');

  const productName = product.name || 'kafelek';
  if (productEditModalTitle) {
    productEditModalTitle.textContent = product.name ? `Edytuj: ${product.name}` : 'Edytuj kafelek';
  }
  if (productEditModalSubtitle) {
    productEditModalSubtitle.textContent = `Wprowadź zmiany, aby natychmiast zaktualizować kafelek "${productName}".`;
  }

  if (productEditNameInput) {
    productEditNameInput.value = product.name || '';
  }
  if (productEditPriceInput) {
    productEditPriceInput.value = product.price !== undefined ? product.price : '';
  }
  if (productEditDescInput) {
    productEditDescInput.value = product.desc || '';
  }
  if (productEditCategorySelect) {
    const normalizedCategory = product.category || '';
    if (normalizedCategory) {
      const hasOption = Array.from(productEditCategorySelect.options || []).some((option) => option.value === normalizedCategory);
      if (!hasOption) {
        const fallbackOption = document.createElement('option');
        fallbackOption.value = normalizedCategory;
        fallbackOption.textContent = normalizedCategory;
        productEditCategorySelect.appendChild(fallbackOption);
      }
    }
    productEditCategorySelect.value = normalizedCategory;
  }

  setProductEditAvailabilityDays(product.availabilityDays);
  if (productEditImageInput) {
    productEditImageInput.value = '';
  }
  releaseProductEditPreviewObjectUrl();
  const imageSrc = product.imageUrl || product.imageData || '';
  updateProductEditImagePreview(imageSrc);

  productEditModal.classList.add('open');
  productEditModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  if (productEditNameInput) {
    productEditNameInput.focus();
  }
}

function closeProductEditModal() {
  if (!productEditModal) {
    return;
  }

  if (productEditModal.classList.contains('open')) {
    productEditModal.classList.remove('open');
    productEditModal.setAttribute('aria-hidden', 'true');
  }

  if (!document.querySelector('.modal.open')) {
    document.body.classList.remove('modal-open');
  }

  resetProductEditFormState();
}

function resetProductEditFormState() {
  currentEditingProductId = '';
  currentEditingProduct = null;
  if (productEditForm) {
    productEditForm.reset();
  }
  resetProductEditAvailabilitySelector();
  setProductEditMessage('');
  releaseProductEditPreviewObjectUrl();
  updateProductEditImagePreview('');
}

function handleProductEditModalBackdropClick(event) {
  if (event.target === productEditModal) {
    closeProductEditModal();
  }
}

function handleProductEditEscClose(event) {
  if (event.key === 'Escape' && productEditModal && productEditModal.classList.contains('open')) {
    event.preventDefault();
    closeProductEditModal();
  }
}

function setProductEditMessage(message, variant = '') {
  if (!productEditMessage) {
    return;
  }

  productEditMessage.textContent = message || '';
  productEditMessage.classList.remove('success', 'error');

  if (!message) {
    productEditMessage.hidden = true;
    return;
  }

  productEditMessage.hidden = false;
  if (variant) {
    productEditMessage.classList.add(variant);
  }
}

function renderProductEditAvailabilityToggles() {
  if (!productEditAvailabilityDays) {
    return;
  }

  productEditAvailabilityDays.innerHTML = '';

  DAYS_OF_WEEK.forEach((dayName, index) => {
    const label = document.createElement('label');
    label.className = 'host-product-availability__toggle';
    label.dataset.dayIndex = String(index);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(index);
    input.dataset.role = 'product-edit-day';
    input.setAttribute('aria-label', dayName);
    input.addEventListener('change', handleProductEditAvailabilityDayChange);

    const tile = document.createElement('span');
    tile.textContent = PRODUCT_DAY_ABBREVIATIONS[index] || '';
    tile.title = dayName;
    tile.setAttribute('aria-hidden', 'true');

    label.append(input, tile);
    productEditAvailabilityDays.appendChild(label);
  });
}

function getProductEditAvailabilityCheckboxes() {
  if (!productEditAvailabilityDays) {
    return [];
  }
  return Array.from(productEditAvailabilityDays.querySelectorAll('input[type="checkbox"][data-role="product-edit-day"]'));
}

function handleProductEditAvailabilityDayChange() {
  if (!productEditAvailabilityAll) {
    return;
  }

  const checkboxes = getProductEditAvailabilityCheckboxes();
  if (!checkboxes.length) {
    productEditAvailabilityAll.checked = false;
    return;
  }

  const everyChecked = checkboxes.every((checkbox) => checkbox.checked);
  productEditAvailabilityAll.checked = everyChecked;
}

function handleProductEditAvailabilityAllToggle(event) {
  const isChecked = Boolean(event && event.target && event.target.checked);
  getProductEditAvailabilityCheckboxes().forEach((checkbox) => {
    checkbox.checked = isChecked;
  });
  handleProductEditAvailabilityDayChange();
}

function setProductEditAvailabilityDays(days) {
  const values = parseAvailabilityValue(days);
  const normalized = values
    .map((item) => Number(item))
    .filter((num) => Number.isInteger(num) && num >= 0 && num < DAYS_OF_WEEK.length);
  const unique = new Set(normalized);
  getProductEditAvailabilityCheckboxes().forEach((checkbox) => {
    checkbox.checked = unique.has(Number(checkbox.value));
  });
  handleProductEditAvailabilityDayChange();
}

function resetProductEditAvailabilitySelector() {
  getProductEditAvailabilityCheckboxes().forEach((checkbox) => {
    checkbox.checked = false;
  });
  if (productEditAvailabilityAll) {
    productEditAvailabilityAll.checked = false;
  }
}

function getSelectedProductEditAvailabilityDays() {
  return getProductEditAvailabilityCheckboxes()
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < DAYS_OF_WEEK.length)
    .sort((a, b) => a - b);
}

function releaseProductEditPreviewObjectUrl() {
  if (productEditPreviewObjectUrl) {
    URL.revokeObjectURL(productEditPreviewObjectUrl);
    productEditPreviewObjectUrl = '';
  }
}

function updateProductEditImagePreview(src) {
  if (!productEditImagePreview || !productEditImagePlaceholder) {
    return;
  }

  if (src) {
    productEditImagePreview.src = src;
    productEditImagePreview.hidden = false;
    productEditImagePlaceholder.hidden = true;
    return;
  }

  productEditImagePreview.src = '';
  productEditImagePreview.hidden = true;
  productEditImagePlaceholder.hidden = false;
}

function handleProductEditImageChange(event) {
  releaseProductEditPreviewObjectUrl();
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) {
    const fallbackSrc = currentEditingProduct ? (currentEditingProduct.imageUrl || currentEditingProduct.imageData || '') : '';
    updateProductEditImagePreview(fallbackSrc);
    return;
  }
  productEditPreviewObjectUrl = URL.createObjectURL(file);
  updateProductEditImagePreview(productEditPreviewObjectUrl);
}

async function handleProductEditFormSubmit(event) {
  event.preventDefault();

  if (!currentEditingProductId) {
    setProductEditMessage('Nie udało się zidentyfikować produktu do edycji.', 'error');
    return;
  }

  const nameValue = productEditNameInput ? productEditNameInput.value.trim() : '';
  const priceValue = productEditPriceInput ? productEditPriceInput.value : '';
  const descValue = productEditDescInput ? productEditDescInput.value.trim() : '';
  const categoryValue = productEditCategorySelect ? productEditCategorySelect.value : '';
  if (!nameValue || !priceValue || !descValue || !categoryValue) {
    setProductEditMessage('Uzupełnij wszystkie pola, aby zapisać zmiany.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('name', nameValue);
  formData.append('price', priceValue);
  formData.append('desc', descValue);
  formData.append('category', categoryValue);

  const selectedDays = productEditAvailabilityAll && productEditAvailabilityAll.checked
    ? 'ALL'
    : JSON.stringify(getSelectedProductEditAvailabilityDays());
  formData.append('availabilityDays', selectedDays);

  if (productEditImageInput && productEditImageInput.files && productEditImageInput.files[0]) {
    formData.append('image', productEditImageInput.files[0]);
  }

  const submitButton = productEditForm.querySelector('button[type="submit"]');
  const originalText = submitButton ? submitButton.textContent : '';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Zapisywanie...';
  }
  setProductEditMessage('');

  try {
    const res = await fetch(`/api/products/${currentEditingProductId}`, {
      method: 'PUT',
      body: formData
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Nie udało się zapisać zmian.');
    }

    const updatedProduct = await res.json();
    updateHostProductsCache(updatedProduct);
    invalidateStorefrontProductsCache();
    renderHostProductsFromCache();
    closeProductEditModal();

    if (hostMessage) {
      hostMessage.innerHTML = `<p style="color:green">Zaktualizowano produkt "${updatedProduct.name || ''}".</p>`;
    }
  } catch (err) {
    console.error('Błąd edycji produktu:', err);
    setProductEditMessage(err.message || 'Nie udało się zapisać zmian.', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText || 'Zapisz zmiany';
    }
  }
}
async function handleProductGridClick(event) {
  const editButton = event.target.closest('.edit-product-btn');
  if (editButton) {
    const { id } = editButton.dataset;
    if (id) {
      const product = hostProductsCache.find((item) => item && item._id === id);
      if (product) {
        openProductEditModal(product);
      }
    }
    return;
  }

  const blockButton = event.target.closest('.block-product-btn');
  if (blockButton) {
    const { id } = blockButton.dataset;
    if (id) {
      const isCurrentlyBlocked = blockButton.dataset.blocked === 'true';
      const targetState = !isCurrentlyBlocked;
      await toggleProductBlockState(id, targetState, blockButton);
    }
    return;
  }

  const button = event.target.closest('.delete-product-btn');
  if (!button) {
    return;
  }

  const id = button.dataset.id;
  if (!id) {
    return;
  }

  if (!confirm('Na pewno chcesz usunąć ten produkt?')) {
    return;
  }

  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Błąd usuwania produktu');
    }

    invalidateStorefrontProductsCache();
    fetchProducts(true);
  } catch (err) {
    console.error('Błąd usuwania produktu:', err);
    alert('Nie udało się usunąć produktu. Spróbuj ponownie.');
  }
}

function invalidateStorefrontProductsCache() {
  try {
    sessionStorage.removeItem(PRODUCTS_CACHE_KEY);
  } catch (err) {
    // Storage access might be restricted (e.g. in private mode); ignore.
  }
}

async function fetchCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    categoriesCache = await res.json();
    renderCategoryList();
    populateCategorySelect();
    renderHostProductsFromCache();
  } catch (err) {
    console.error('Błąd pobierania kategorii:', err);
    if (categoryMessage) {
      categoryMessage.innerHTML = '<p style="color:red">Nie udało się pobrać kategorii</p>';
    }
  }
}

function renderCategoryList() {
  if (!categoryList) {
    return;
  }

  categoryList.innerHTML = '';

  if (!categoriesCache.length) {
    categoryList.innerHTML = '<p>Brak kategorii</p>';
    return;
  }

  categoriesCache.forEach((category, index) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('category-item');
    wrapper.dataset.id = category._id;

    const header = document.createElement('div');
    header.classList.add('category-item__header');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = category.name;
    header.appendChild(nameSpan);

    const tileControls = document.createElement('div');
    tileControls.classList.add('category-tile-controls');

    const preview = document.createElement('div');
    preview.classList.add('category-tile-preview');
    const tileImageSrc = category.tileImageUrl || category.tileImageData || '';
    if (tileImageSrc) {
      const img = document.createElement('img');
      img.src = tileImageSrc;
      img.alt = category.tileImageAlt || category.name || '';
      preview.appendChild(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = 'Brak grafiki';
      preview.appendChild(placeholder);
    }
    tileControls.classList.toggle('category-tile-controls--empty', !tileImageSrc);

    const tileActions = document.createElement('div');
    tileActions.classList.add('category-tile-actions');

    const uploadLabel = document.createElement('label');
    uploadLabel.classList.add('category-tile-upload');
    uploadLabel.textContent = tileImageSrc ? 'Zmień grafikę' : 'Dodaj grafikę';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.dataset.categoryId = category._id;
    fileInput.classList.add('category-tile-input');
    uploadLabel.appendChild(fileInput);

    const altInput = document.createElement('input');
    altInput.type = 'text';
    altInput.placeholder = 'Opis grafiki (opcjonalnie)';
    altInput.value = category.tileImageAlt || '';
    altInput.dataset.categoryId = category._id;
    altInput.dataset.originalValue = altInput.value;
    altInput.classList.add('category-tile-alt');
    altInput.setAttribute('aria-label', `Opis grafiki dla kategorii ${category.name}`);

    tileActions.append(uploadLabel, altInput);

    if (tileImageSrc) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.classList.add('category-tile-remove');
      removeBtn.dataset.id = category._id;
      removeBtn.textContent = 'Usuń grafikę';
      tileActions.appendChild(removeBtn);
    }

    tileControls.append(preview, tileActions);

    const actions = document.createElement('div');
    actions.classList.add('category-actions');

    const upBtn = document.createElement('button');
    upBtn.classList.add('move-up');
    upBtn.dataset.index = index;
    upBtn.textContent = '↑';
    if (index === 0) {
      upBtn.disabled = true;
    }

    const downBtn = document.createElement('button');
    downBtn.classList.add('move-down');
    downBtn.dataset.index = index;
    downBtn.textContent = '↓';
    if (index === categoriesCache.length - 1) {
      downBtn.disabled = true;
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-category');
    deleteBtn.dataset.id = category._id;
    deleteBtn.textContent = 'Usuń';

    actions.append(upBtn, downBtn, deleteBtn);
    wrapper.append(header, tileControls, actions);
    categoryList.appendChild(wrapper);
  });
}

function populateCategorySelect() {
  const selects = [categorySelect, productEditCategorySelect].filter(Boolean);
  if (!selects.length) {
    return;
  }

  selects.forEach((select) => {
    const previousValue = select.value;
    select.innerHTML = '<option value="">-- Wybierz kategorię --</option>';
    categoriesCache.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.name;
      option.textContent = category.name;
      select.appendChild(option);
    });
    if (previousValue) {
      select.value = previousValue;
      if (select.value !== previousValue) {
        select.value = '';
      }
    }
  });
}

async function handleCategoryListClick(event) {
  const target = event.target;

  if (target.classList.contains('category-tile-remove')) {
    const id = target.dataset.id;
    if (!id) {
      return;
    }
    await removeCategoryTileImage(id, target);
    return;
  }

  if (target.classList.contains('delete-category')) {
    const id = target.dataset.id;
    if (!id) {
      return;
    }

    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Błąd odpowiedzi serwera');
      }
      await fetchCategories();
    } catch (err) {
      console.error('Błąd usuwania kategorii:', err);
      if (categoryMessage) {
        categoryMessage.innerHTML = '<p style="color:red">Nie udało się usunąć kategorii</p>';
      }
    }
    return;
  }

  if (target.classList.contains('move-up') || target.classList.contains('move-down')) {
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }

    const direction = target.classList.contains('move-up') ? -1 : 1;
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= categoriesCache.length) {
      return;
    }

    await reorderCategories(index, newIndex);
  }
}


async function handleCategoryListChange(event) {
  const target = event.target;
  if (!target) {
    return;
  }

  if (target.classList.contains('category-tile-input')) {
    await handleCategoryTileInput(target);
    return;
  }

  if (target.classList.contains('category-tile-alt')) {
    await handleCategoryTileAltChange(target);
  }
}

async function handleCategoryTileInput(input) {
  const categoryId = input.dataset.categoryId;
  const file = input.files && input.files[0];
  if (!categoryId || !file) {
    return;
  }

  const wrapper = input.closest('.category-item');
  if (wrapper) {
    wrapper.classList.add('is-uploading');
  }

  const altValue = extractAltValue(wrapper);

  try {
    await uploadCategoryTileImage(categoryId, file, altValue);
    showCategoryMessage('success', 'Zapisano grafikę kategorii.');
    await fetchCategories();
  } catch (err) {
    console.error('Błąd zapisu grafiki kategorii:', err);
    showCategoryMessage('error', 'Nie udało się zapisać grafiki kategorii.');
  } finally {
    if (wrapper) {
      wrapper.classList.remove('is-uploading');
    }
    input.value = '';
  }
}

async function handleCategoryTileAltChange(input) {
  const categoryId = input.dataset.categoryId;
  if (!categoryId) {
    return;
  }

  const newValue = input.value.trim();
  const previous = input.dataset.originalValue || '';
  if (newValue === previous) {
    return;
  }

  try {
    await uploadCategoryTileImage(categoryId, null, newValue);
    input.dataset.originalValue = newValue;
    const wrapper = input.closest('.category-item');
    if (wrapper) {
      const previewImg = wrapper.querySelector('.category-tile-preview img');
      if (previewImg) {
        previewImg.alt = newValue;
      }
    }
    const cacheIndex = categoriesCache.findIndex((category) => category._id === categoryId);
    if (cacheIndex !== -1) {
      categoriesCache[cacheIndex] = {
        ...categoriesCache[cacheIndex],
        tileImageAlt: newValue
      };
    }
    showCategoryMessage('success', 'Zaktualizowano opis grafiki.');
  } catch (err) {
    console.error('Błąd zapisu opisu grafiki kategorii:', err);
    showCategoryMessage('error', 'Nie udało się zaktualizować opisu grafiki.');
    input.value = previous;
  }
}

async function uploadCategoryTileImage(categoryId, file, altValue) {
  if (!categoryId) {
    return;
  }
  const formData = new FormData();
  let hasPayload = false;
  if (file instanceof File) {
    formData.append('tileImage', file);
    hasPayload = true;
  }
  if (typeof altValue === 'string') {
    formData.append('alt', altValue);
    hasPayload = true;
  }
  if (!hasPayload) {
    return;
  }

  const res = await fetch(`/api/categories/${categoryId}/tile-image`, {
    method: 'PUT',
    body: formData
  });

  if (!res.ok) {
    throw new Error('Nie udało się zapisać grafiki');
  }
}

async function removeCategoryTileImage(categoryId, button) {
  if (!categoryId) {
    return;
  }
  if (button) {
    button.disabled = true;
  }
  try {
    const res = await fetch(`/api/categories/${categoryId}/tile-image`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }
    showCategoryMessage('success', 'Usunięto grafikę kategorii.');
    await fetchCategories();
  } catch (err) {
    console.error('Błąd usuwania grafiki kategorii:', err);
    showCategoryMessage('error', 'Nie udało się usunąć grafiki kategorii.');
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function extractAltValue(wrapper) {
  if (!wrapper) {
    return '';
  }
  const altInput = wrapper.querySelector('.category-tile-alt');
  return altInput ? altInput.value.trim() : '';
}

function showCategoryMessage(type, message) {
  if (!categoryMessage) {
    return;
  }
  categoryMessage.textContent = message;
  categoryMessage.classList.remove('success', 'error');
  if (type) {
    categoryMessage.classList.add(type);
  }
}

function reorderCategories(fromIndex, toIndex) {
  const updated = categoriesCache.slice();
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  categoriesCache = updated.map((category, index) => ({ ...category, order: index }));
  renderCategoryList();
  persistCategoryOrder();
}

async function persistCategoryOrder() {
  try {
    const res = await fetch('/api/categories/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: categoriesCache.map((category) => category._id) })
    });

    if (!res.ok) {
      throw new Error('Błąd zapisu kolejności');
    }
  } catch (err) {
    console.error('Błąd zapisu kolejności kategorii:', err);
    if (categoryMessage) {
      categoryMessage.innerHTML = '<p style="color:red">Nie udało się zapisać kolejności kategorii</p>';
    }
  }
}

async function fetchDiscountCodes() {
  try {
    const res = await fetch('/api/discount-codes');
    if (!res.ok) {
      throw new Error('Błąd pobierania kodów rabatowych');
    }

    discountCodesCache = await res.json();
    renderDiscountCodes();
  } catch (err) {
    console.error('Błąd pobierania kodów rabatowych:', err);
    showDiscountMessage('error', 'Nie udało się pobrać kodów rabatowych.');
  }
}

function renderDiscountCodes() {
  if (!discountList) {
    return;
  }

  discountList.innerHTML = '';

  if (!discountCodesCache.length) {
    discountList.innerHTML = '<p>Brak kodów rabatowych</p>';
    return;
  }

  discountCodesCache.forEach((code) => {
    const item = document.createElement('div');
    item.className = 'discount-item';

    const info = document.createElement('div');
    info.className = 'discount-item-info';

    const codeLabel = document.createElement('strong');
    codeLabel.textContent = code.code;
    const percentLabel = document.createElement('span');
    percentLabel.textContent = `${Number(code.percent).toFixed(0)}%`;
    info.append(codeLabel, percentLabel);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Usuń';
    deleteButton.dataset.id = code._id;

    item.append(info, deleteButton);
    discountList.appendChild(item);
  });
}

async function handleDiscountFormSubmit(event) {
  event.preventDefault();

  if (!discountForm) {
    return;
  }

  const codeValue = normalizeDiscountCode(discountCodeInput ? discountCodeInput.value : '');
  const percentValue = Math.round(Number(discountPercentInput ? discountPercentInput.value : 0));

  if (!codeValue) {
    showDiscountMessage('error', 'Wpisz kod rabatowy.');
    if (discountCodeInput) {
      discountCodeInput.focus();
    }
    return;
  }

  if (discountCodeInput) {
    discountCodeInput.value = codeValue;
  }

  if (!Number.isFinite(percentValue) || percentValue <= 0 || percentValue > 100) {
    showDiscountMessage('error', 'Podaj procent rabatu z zakresu 1-100.');
    if (discountPercentInput) {
      discountPercentInput.focus();
    }
    return;
  }

  const submitButton = discountForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const res = await fetch('/api/discount-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeValue, percent: percentValue })
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ }));
      throw new Error(error && error.error ? error.error : 'Błąd dodawania kodu');
    }

    showDiscountMessage('success', `Dodano kod ${codeValue}.`);
    discountForm.reset();
    await fetchDiscountCodes();
  } catch (err) {
    console.error('Błąd zapisu kodu rabatowego:', err);
    showDiscountMessage('error', err && err.message ? err.message : 'Błąd zapisu kodu rabatowego.');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function handleDiscountListClick(event) {
  const button = event.target.closest('button');
  if (!button || !button.dataset.id) {
    return;
  }

  const id = button.dataset.id;

  if (!confirm('Na pewno chcesz usunąć ten kod rabatowy?')) {
    return;
  }

  try {
    const res = await fetch(`/api/discount-codes/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Błąd usuwania kodu');
    }

    showDiscountMessage('success', 'Kod rabatowy został usunięty.');
    discountCodesCache = discountCodesCache.filter((code) => code._id !== id);
    renderDiscountCodes();
  } catch (err) {
    console.error('Błąd usuwania kodu rabatowego:', err);
    showDiscountMessage('error', 'Nie udało się usunąć kodu rabatowego.');
  }
}

function showDiscountMessage(type, message) {
  if (!discountMessage) {
    return;
  }

  discountMessage.textContent = message;
  discountMessage.classList.remove('success', 'error');
  if (type) {
    discountMessage.classList.add(type);
  }
}

function normalizeDiscountCode(value) {
  return (value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function resolveAccessibilityHeroImageSource(data) {
  if (!data || typeof data !== 'object') {
    return '';
  }
  if (typeof data.heroImageUrl === 'string' && data.heroImageUrl.trim()) {
    return data.heroImageUrl.trim();
  }
  if (typeof data.heroImageData === 'string' && data.heroImageData.trim()) {
    return data.heroImageData.trim();
  }
  return '';
}

function setAccessibilityHeroPreview(imageSrc) {
  if (!accessibilityHeroPreviewImage) {
    return;
  }

  if (imageSrc) {
    accessibilityHeroPreviewImage.src = imageSrc;
    accessibilityHeroPreviewImage.hidden = false;
    if (accessibilityHeroNoImagePlaceholder) {
      accessibilityHeroNoImagePlaceholder.hidden = true;
    }
  } else {
    accessibilityHeroPreviewImage.removeAttribute('src');
    accessibilityHeroPreviewImage.hidden = true;
    if (accessibilityHeroNoImagePlaceholder) {
      accessibilityHeroNoImagePlaceholder.hidden = false;
    }
  }
}

function updateAccessibilityHeroRemoveState(hasStoredImage) {
  if (!accessibilityHeroRemoveButton) {
    return;
  }
  accessibilityHeroRemoveButton.disabled = !hasStoredImage;
}

function showAccessibilityHeroMessage(type, message) {
  if (!accessibilityHeroMessage) {
    return;
  }

  accessibilityHeroMessage.textContent = message || '';
  if (!message) {
    accessibilityHeroMessage.style.color = '';
    return;
  }

  const colorMap = {
    success: '#2d7a46',
    error: '#c62828',
    info: '#6b4a34'
  };
  accessibilityHeroMessage.style.color = colorMap[type] || colorMap.info;
}

function applyAccessibilityHeroPreview(data) {
  const normalizedData = data && typeof data === 'object' ? data : null;
  const tagline = normalizedData && typeof normalizedData.tagline === 'string' && normalizedData.tagline.trim()
    ? normalizedData.tagline.trim()
    : DEFAULT_ACCESSIBILITY_TAGLINE;
  if (accessibilityHeroPreviewText) {
    accessibilityHeroPreviewText.textContent = `Dostępność i odbiory. ${tagline}`;
  }
  accessibilityHeroCurrentImageSrc = resolveAccessibilityHeroImageSource(normalizedData);
  setAccessibilityHeroPreview(accessibilityHeroCurrentImageSrc);
  updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
}

async function fetchAccessibilityContent() {
  if (!accessibilityHeroForm && !accessibilityHeroPreviewImage && !accessibilityHeroMessage) {
    return;
  }

  try {
    const res = await fetch('/api/accessibility-content');
    if (!res.ok) {
      throw new Error('Błąd pobierania sekcji dostępności');
    }

    const data = await res.json();
    applyAccessibilityHeroPreview(data);
    showAccessibilityHeroMessage(null, '');
  } catch (err) {
    console.error('Błąd pobierania sekcji dostępności:', err);
    applyAccessibilityHeroPreview(null);
    showAccessibilityHeroMessage('error', 'Nie udało się pobrać danych sekcji dostępności.');
  }
}

function handleAccessibilityHeroImageChange(event) {
  const input = event ? event.target : null;
  if (!input || !input.files) {
    updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
    return;
  }

  if (!input.files.length) {
    setAccessibilityHeroPreview(accessibilityHeroCurrentImageSrc);
    updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
    return;
  }

  const file = input.files[0];
  if (!file || typeof FileReader === 'undefined') {
    setAccessibilityHeroPreview(accessibilityHeroCurrentImageSrc);
    updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      setAccessibilityHeroPreview(reader.result);
    }
    updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
  };
  reader.onerror = () => {
    console.error('Nie udało się odczytać pliku zdjęcia sekcji dostępności.');
    setAccessibilityHeroPreview(accessibilityHeroCurrentImageSrc);
    updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
  };
  reader.readAsDataURL(file);
  updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
}

async function handleAccessibilityHeroFormSubmit(event) {
  event.preventDefault();

  if (!accessibilityHeroForm) {
    return;
  }

  const file = accessibilityHeroImageInput && accessibilityHeroImageInput.files
    ? accessibilityHeroImageInput.files[0]
    : null;

  if (!file) {
    showAccessibilityHeroMessage('error', 'Wybierz zdjęcie, aby zapisać sekcję.');
    if (accessibilityHeroImageInput) {
      accessibilityHeroImageInput.focus();
    }
    return;
  }

  const submitButton = accessibilityHeroForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }
  if (accessibilityHeroRemoveButton) {
    accessibilityHeroRemoveButton.disabled = true;
  }
  showAccessibilityHeroMessage('info', 'Zapisuję zdjęcie...');

  const formData = new FormData();
  formData.append('accessibilityHeroImage', file);

  try {
    const res = await fetch('/api/accessibility-content', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error && error.error ? error.error : 'Błąd zapisu zdjęcia sekcji.');
    }

    const data = await res.json();
    applyAccessibilityHeroPreview(data);
    if (accessibilityHeroImageInput) {
      accessibilityHeroImageInput.value = '';
    }
    showAccessibilityHeroMessage('success', 'Zapisano zdjęcie sekcji dostępności.');
  } catch (err) {
    console.error('Błąd zapisu sekcji dostępności:', err);
    showAccessibilityHeroMessage('error', err && err.message ? err.message : 'Nie udało się zapisać zdjęcia sekcji.');
    setAccessibilityHeroPreview(accessibilityHeroCurrentImageSrc);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
    updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
  }
}

async function handleAccessibilityHeroRemove(event) {
  event.preventDefault();

  if (!accessibilityHeroForm || !accessibilityHeroCurrentImageSrc) {
    return;
  }

  if (!confirm('Na pewno chcesz usunąć zdjęcie sekcji?')) {
    return;
  }

  const formData = new FormData();
  formData.append('removeImage', 'true');

  const submitButton = accessibilityHeroForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }
  if (accessibilityHeroRemoveButton) {
    accessibilityHeroRemoveButton.disabled = true;
  }
  showAccessibilityHeroMessage('info', 'Usuwam zdjęcie...');

  try {
    const res = await fetch('/api/accessibility-content', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error && error.error ? error.error : 'Błąd usuwania zdjęcia sekcji.');
    }

    const data = await res.json();
    applyAccessibilityHeroPreview(data);
    if (accessibilityHeroImageInput) {
      accessibilityHeroImageInput.value = '';
    }
    showAccessibilityHeroMessage('success', 'Usunięto zdjęcie sekcji dostępności.');
  } catch (err) {
    console.error('Błąd usuwania zdjęcia sekcji dostępności:', err);
    showAccessibilityHeroMessage('error', err && err.message ? err.message : 'Nie udało się usunąć zdjęcia sekcji.');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
    updateAccessibilityHeroRemoveState(Boolean(accessibilityHeroCurrentImageSrc));
  }
}

async function fetchAboutContent() {
  try {
    const res = await fetch('/api/about?includeGallery=1');
    if (!res.ok) {
      throw new Error('Błąd pobierania treści O nas');
    }

    const data = await res.json();
    applyAboutPreview(data);
    renderAboutGallery(buildHostGalleryItems(data));
  } catch (err) {
    console.error('Błąd pobierania sekcji O nas:', err);
    applyAboutPreview(null);
    renderAboutGallery([]);
  }
}

function applyAboutPreview(data) {
  const text = data && data.heroText ? data.heroText : DEFAULT_ABOUT_TEXT;
  if (aboutPreviewText) {
    aboutPreviewText.textContent = text;
  }
  if (aboutTextInput) {
    aboutTextInput.value = text;
  }

  if (!aboutPreviewImage || !aboutNoImagePlaceholder) {
    return;
  }

  const imageSrc = data ? (data.heroImageUrl || data.heroImageData) : '';
  if (imageSrc) {
    aboutPreviewImage.src = imageSrc;
    aboutPreviewImage.hidden = false;
    aboutNoImagePlaceholder.hidden = true;
  } else {
    aboutPreviewImage.removeAttribute('src');
    aboutPreviewImage.hidden = true;
    aboutNoImagePlaceholder.hidden = false;
  }
}

function getAboutPreviewSrc() {
  if (!aboutPreviewImage) {
    return '';
  }
  if (!aboutPreviewImage.hidden && aboutPreviewImage.src) {
    return aboutPreviewImage.src;
  }
  const attributeSrc = aboutPreviewImage.getAttribute('src');
  return attributeSrc || '';
}

function buildHeroReferenceFromPreview() {
  const src = getAboutPreviewSrc();
  if (!src) {
    return {};
  }
  if (/^data:/i.test(src)) {
    return { heroImageData: src };
  }
  return { heroImageUrl: src };
}

async function handleAboutFormSubmit(event) {
  event.preventDefault();

  if (!aboutForm) {
    return;
  }

  const formData = new FormData();
  const text = aboutTextInput ? aboutTextInput.value.trim() : '';
  if (text) {
    formData.append('aboutText', text);
  }

  if (aboutImageInput && aboutImageInput.files && aboutImageInput.files[0]) {
    formData.append('aboutImage', aboutImageInput.files[0]);
  }

  if (aboutMessage) {
    aboutMessage.textContent = 'Zapisuję...';
    aboutMessage.style.color = '#6b4a34';
  }

  try {
    const res = await fetch('/api/about', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({}));
      const message = errorPayload && errorPayload.error ? errorPayload.error : 'Nie udało się zapisać sekcji';
      throw new Error(message);
    }

    const data = await res.json();
    applyAboutPreview(data);
    renderAboutGallery(buildHostGalleryItems(data));

    if (aboutImageInput) {
      aboutImageInput.value = '';
    }

    if (aboutMessage) {
      aboutMessage.textContent = 'Zapisano sekcję O nas.';
      aboutMessage.style.color = '#2d7a46';
    }
  } catch (err) {
    console.error('Błąd zapisu sekcji O nas:', err);
    if (aboutMessage) {
      aboutMessage.textContent = err && err.message ? err.message : 'Nie udało się zapisać sekcji';
      aboutMessage.style.color = '#c62828';
    }
  }
}

function handleAboutImageChange(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!aboutPreviewImage) {
    return;
  }

  if (!file) {
    aboutPreviewImage.removeAttribute('src');
    aboutPreviewImage.hidden = true;
    if (aboutNoImagePlaceholder) {
      aboutNoImagePlaceholder.hidden = false;
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    aboutPreviewImage.src = reader.result;
    aboutPreviewImage.hidden = false;
    if (aboutNoImagePlaceholder) {
      aboutNoImagePlaceholder.hidden = true;
    }
  };
  reader.readAsDataURL(file);
}

function getGalleryItemSrc(item) {
  if (!item) {
    return '';
  }
  if (item.imageUrl && typeof item.imageUrl === 'string') {
    return item.imageUrl;
  }
  if (item.imageData && typeof item.imageData === 'string') {
    return item.imageData;
  }
  return '';
}

function createInlineGalleryItem(src) {
  if (!src) {
    return null;
  }
  if (/^data:/i.test(src)) {
    return { _id: null, imageData: src };
  }
  return { _id: null, imageUrl: src };
}

function buildHostGalleryItems(data) {
  if (!data) {
    return [];
  }

  const gallery = Array.isArray(data.gallery)
    ? data.gallery.filter((item) => getGalleryItemSrc(item))
    : [];

  const list = gallery.slice();
  const heroCandidate = (data && (data.heroImageUrl || data.heroImageData))
    || getAboutPreviewSrc()
    || '';

  if (heroCandidate) {
    const existingIndex = list.findIndex((item) => getGalleryItemSrc(item) === heroCandidate);
    if (existingIndex > 0) {
      const [heroItem] = list.splice(existingIndex, 1);
      list.unshift(heroItem);
    } else if (existingIndex === -1) {
      const inlineItem = createInlineGalleryItem(heroCandidate);
      if (inlineItem) {
        list.unshift(inlineItem);
      }
    }
  }

  return list;
}

function renderAboutGallery(items) {
  if (!aboutGalleryList) {
    return;
  }

  aboutGalleryCache = Array.isArray(items) ? items.slice() : [];
  aboutGalleryList.innerHTML = '';

  if (!aboutGalleryCache.length) {
    const empty = document.createElement('p');
    empty.classList.add('host-gallery-empty');
    empty.textContent = 'Brak zdjęć w galerii.';
    aboutGalleryList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  aboutGalleryCache.forEach((item, index) => {
    const src = getGalleryItemSrc(item);
    if (!src) {
      return;
    }
    const figure = document.createElement('figure');
    figure.classList.add('host-gallery-item');

    const image = document.createElement('img');
    image.src = src;
    image.alt = `Zdjęcie galerii ${index + 1}`;
    figure.appendChild(image);

    if (item._id) {
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.add('host-gallery-delete');
      button.dataset.role = 'remove-gallery-image';
      button.dataset.imageId = item._id;
      button.setAttribute('aria-label', 'Usuń zdjęcie z galerii');
      button.textContent = '×';
      figure.appendChild(button);
    }

    fragment.appendChild(figure);
  });

  aboutGalleryList.appendChild(fragment);
}

function showAboutGalleryMessage(type, message) {
  if (!aboutGalleryMessage) {
    return;
  }

  aboutGalleryMessage.textContent = message || '';
  aboutGalleryMessage.classList.remove('success', 'error');
  if (type) {
    aboutGalleryMessage.classList.add(type);
  }
}

async function handleAboutGalleryFormSubmit(event) {
  event.preventDefault();

  if (!aboutGalleryImageInput || !aboutGalleryImageInput.files || !aboutGalleryImageInput.files[0]) {
    showAboutGalleryMessage('error', 'Wybierz zdjęcie, aby dodać je do galerii.');
    return;
  }

  const formData = new FormData();
  formData.append('galleryImage', aboutGalleryImageInput.files[0]);
  showAboutGalleryMessage(null, 'Dodaję zdjęcie do galerii...');

  try {
    const res = await fetch('/api/about/gallery', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({}));
      const message = errorPayload && errorPayload.error ? errorPayload.error : 'Nie udało się dodać zdjęcia.';
      throw new Error(message);
    }

    const data = await res.json();
    const heroReference = buildHeroReferenceFromPreview();
    const galleryPayload = {
      gallery: data && Array.isArray(data.gallery) ? data.gallery : []
    };
    renderAboutGallery(buildHostGalleryItems(Object.assign(galleryPayload, heroReference)));
    showAboutGalleryMessage('success', 'Zdjęcie dodane do galerii.');
    if (aboutGalleryImageInput) {
      aboutGalleryImageInput.value = '';
    }
  } catch (err) {
    console.error('Błąd dodawania zdjęcia do galerii:', err);
    const message = err && err.message ? err.message : 'Nie udało się dodać zdjęcia.';
    showAboutGalleryMessage('error', message);
  }
}

function handleAboutGalleryListClick(event) {
  const button = event.target instanceof HTMLElement
    ? event.target.closest('[data-role="remove-gallery-image"]')
    : null;
  if (!button) {
    return;
  }
  const imageId = button.dataset.imageId;
  if (!imageId) {
    return;
  }
  deleteAboutGalleryImage(imageId);
}

async function deleteAboutGalleryImage(imageId) {
  showAboutGalleryMessage(null, 'Usuwam zdjęcie z galerii...');

  try {
    const res = await fetch(`/api/about/gallery/${encodeURIComponent(imageId)}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({}));
      const message = errorPayload && errorPayload.error ? errorPayload.error : 'Nie udało się usunąć zdjęcia.';
      throw new Error(message);
    }

    const data = await res.json();
    const heroReference = buildHeroReferenceFromPreview();
    const galleryPayload = {
      gallery: data && Array.isArray(data.gallery) ? data.gallery : []
    };
    renderAboutGallery(buildHostGalleryItems(Object.assign(galleryPayload, heroReference)));
    showAboutGalleryMessage('success', 'Zdjęcie usunięte z galerii.');
  } catch (err) {
    console.error('Błąd usuwania zdjęcia z galerii:', err);
    const message = err && err.message ? err.message : 'Nie udało się usunąć zdjęcia.';
    showAboutGalleryMessage('error', message);
  }
}
