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
const aboutForm = document.getElementById("aboutForm");
const aboutTextInput = document.getElementById("aboutText");
const aboutImageInput = document.getElementById("aboutImage");
const aboutMessage = document.getElementById("aboutMessage");
const aboutPreviewText = document.getElementById("aboutPreviewText");
const aboutPreviewImage = document.getElementById("aboutPreviewImage");
const aboutNoImagePlaceholder = document.getElementById("aboutNoImagePlaceholder");

// Stock management elements
const daySelect = document.getElementById('daySelect');
const productsStock = document.getElementById('productsStock');
const saveWeeklyStock = document.getElementById('saveWeeklyStock');
const dateSelect = document.getElementById('dateSelect');
const dateProductsStock = document.getElementById('dateProductsStock');
const saveDateStock = document.getElementById('saveDateStock');
const stockOverview = document.getElementById('stockOverview');

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const PRODUCT_DAY_ABBREVIATIONS = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
const MAX_AVAILABILITY_TILES = 6;
const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';
let availabilityMessageTimer = null;

// Stock management variables
let products = [];
let currentDayIndex = 0;
let currentDate = null;

let categoriesCache = [];
let discountCodesCache = [];

if (categoryList) {
  fetchCategories();
  categoryList.addEventListener("click", handleCategoryListClick);
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
    if (productAvailabilityAll && productAvailabilityAll.checked) {
      formData.append('availabilityDays', 'ALL');
    } else {
      formData.append('availabilityDays', JSON.stringify(selectedDays));
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
      if (imageInput) {
        imageInput.value = '';
      }
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
}

function handleProductAvailabilityDayChange() {
  if (!productAvailabilityAll) {
    return;
  }
  const checkboxes = getProductAvailabilityCheckboxes();
  if (!checkboxes.length) {
    productAvailabilityAll.checked = false;
    return;
  }
  const everyChecked = checkboxes.every((checkbox) => checkbox.checked);
  productAvailabilityAll.checked = everyChecked;
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
    showAvailabilityNotice('error', "Nie udało się pobrać danych o dostępności.");
  }
}

function renderAvailabilityManager(schedule) {
  if (!availabilityManager) {
    return;
  }

  availabilityManager.innerHTML = '';

  const data = schedule.length ? schedule : DAYS_OF_WEEK.map((dayName, dayIndex) => ({
    dayIndex,
    dayName,
    entries: [],
    updatedAt: null
  }));

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
  entriesSection.append(entriesHeader, entriesList);

  populateAvailabilityEntries(entriesList, Array.isArray(day.entries) ? day.entries : []);

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

async function handleAvailabilityClick(event) {
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
  const timePattern = /^\d{1,2}:\d{2}$/;
  const entries = [];
  let focusTarget = null;
  let errorMessage = '';

  rows.forEach((row) => {
    const productInput = row.querySelector('input[data-role="entry-product"]');
    const startInput = row.querySelector('input[data-role="entry-start"]');
    const product = productInput ? productInput.value.trim() : '';
    const availableFrom = startInput ? startInput.value.trim() : '';

    if (!product && !availableFrom) {
      return;
    }

    if (!product || !availableFrom) {
      if (!focusTarget) {
        focusTarget = !product ? productInput : startInput;
        errorMessage = 'Uzupełnij nazwę wypieku i godzinę dostępności.';
      }
      return;
    }

    if (!timePattern.test(availableFrom)) {
      if (!focusTarget) {
        focusTarget = startInput;
        errorMessage = 'Użyj formatu godziny HH:MM (np. 10:30).';
      }
      return;
    }

    entries.push({ product, availableFrom });
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

  const payload = { entries };

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Zapisuję...';

  try {
    const res = await fetch(`/api/availability/${dayIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('Błąd zapisu');
    }

    const updated = await res.json();
    updateAvailabilityCard(card, updated);
    showAvailabilityNotice('success', `Zapisano dostępność na ${updated.dayName}.`);
  } catch (err) {
    console.error('Błąd zapisu dostępności:', err);
    showAvailabilityNotice('error', 'Nie udało się zapisać zmian. Spróbuj ponownie.');
  } finally {
    button.disabled = false;
    button.textContent = originalText || 'Zapisz dzień';
  }
}

function updateAvailabilityCard(card, updated) {
  const entriesContainer = card.querySelector('.availability-entries');
  if (entriesContainer) {
    populateAvailabilityEntries(entriesContainer, updated && Array.isArray(updated.entries) ? updated.entries : []);
  }
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
  startInput.pattern = '\d{1,2}:\d{2}';
  startInput.value = entry && typeof entry.availableFrom === 'string' ? entry.availableFrom : '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'availability-entry-remove';
  removeButton.setAttribute('aria-label', 'Usuń pozycję');
  removeButton.textContent = '×';

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
    if (button) {
      const disabled = rows.length <= 1;
      button.disabled = disabled;
      button.classList.toggle('is-disabled', disabled);
    }
  });
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


async function fetchDiscountCodes() {
  try {
    const res = await fetch('/api/discount-codes');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    discountCodesCache = await res.json();
    showDiscountMessage('', '');
    renderDiscountCodes();
  } catch (err) {
    console.error('Błąd pobierania kodów rabatowych:', err);
    showDiscountMessage('error', 'Nie udało się pobrać kodów rabatowych.');
    if (discountList) {
      discountList.innerHTML = '';
    }
  }
}

function renderDiscountCodes() {
  if (!discountList) {
    return;
  }

  discountList.innerHTML = '';

  if (!discountCodesCache.length) {
    discountList.innerHTML = '<p>Brak zapisanych kodów rabatowych.</p>';
    return;
  }

  discountCodesCache.forEach((code) => {
    const item = document.createElement('div');
    item.className = 'discount-item';
    item.dataset.id = code._id;

    const info = document.createElement('div');
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



async function fetchCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    categoriesCache = await res.json();
    renderCategoryList();
    populateCategorySelect();
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

    const nameSpan = document.createElement('span');
    nameSpan.textContent = category.name;

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
    wrapper.append(nameSpan, actions);
    categoryList.appendChild(wrapper);
  });
}

function populateCategorySelect() {
  if (!categorySelect) {
    return;
  }

  const previousValue = categorySelect.value;
  categorySelect.innerHTML = '<option value="">-- Wybierz kategorię --</option>';
  categoriesCache.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.name;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });

  if (previousValue) {
    categorySelect.value = previousValue;
    if (categorySelect.value !== previousValue) {
      categorySelect.value = '';
    }
  }
}

async function handleCategoryListClick(event) {
  const target = event.target;

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

async function reorderCategories(currentIndex, newIndex) {
  const updated = categoriesCache.slice();
  const [moved] = updated.splice(currentIndex, 1);
  updated.splice(newIndex, 0, moved);

  try {
    const res = await fetch('/api/categories/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: updated.map((category) => category._id) })
    });

    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    categoriesCache = await res.json();
    renderCategoryList();
    populateCategorySelect();
  } catch (err) {
    console.error('Błąd zmiany kolejności kategorii:', err);
    if (categoryMessage) {
      categoryMessage.innerHTML = '<p style="color:red">Nie udało się zmienić kolejności kategorii</p>';
    }
  }
}

async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    const products = await res.json();

    if (!productGrid) {
      return;
    }

    productGrid.innerHTML = '';
    products.forEach((product) => {
      const imageSrc = product.imageData || product.imageUrl;
      const card = document.createElement('div');
      card.classList.add('product-card');
      if (imageSrc) {
        card.classList.add('product-card--with-image');
      } else {
        card.classList.add('product-card--no-image');
      }
      const availabilityMarkup = renderProductAvailabilityTiles(product.availabilityDays);
      card.innerHTML = `
        ${imageSrc ? `<img src="${imageSrc}" alt="${product.name}" class="product-thumb">` : ''}
        <div class="product-info">
          <h3>${product.name}</h3>
          <p>${product.desc || ''}</p>
          <p><strong>${product.price} zł</strong></p>
          <p>Kategoria: <em>${product.category}</em></p>
          <button class="delete-btn" data-id="${product._id}">Usuń</button>
        </div>
        ${availabilityMarkup}
      `;
      productGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
  }
}

// Obsługa usuwania produktu
document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!target.classList.contains('delete-btn')) {
    return;
  }

  const id = target.getAttribute('data-id');
  if (!id) {
    return;
  }

  if (!confirm('Na pewno chcesz usunąć ten produkt?')) {
    return;
  }

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    fetchProducts();
  } catch (err) {
    alert('❌ Błąd podczas usuwania produktu');
    console.error(err);
  }
});

async function fetchAboutContent() {
  try {
    const res = await fetch('/api/about');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }
    const data = await res.json();
    applyAboutPreview(data);
  } catch (err) {
    console.error('Błąd pobierania sekcji O nas:', err);
    applyAboutPreview(null);
  }
}

function applyAboutPreview(data) {
  const text = data && typeof data.heroText === 'string' && data.heroText.trim()
    ? data.heroText.trim()
    : DEFAULT_ABOUT_TEXT;

  if (aboutPreviewText) {
    aboutPreviewText.textContent = text;
  }

  if (aboutTextInput) {
    aboutTextInput.value = text;
  }

  const imageData = data && typeof data.heroImageData === 'string' ? data.heroImageData : '';
  if (aboutPreviewImage) {
    if (imageData) {
      aboutPreviewImage.src = imageData;
      aboutPreviewImage.hidden = false;
    } else {
      aboutPreviewImage.removeAttribute('src');
      aboutPreviewImage.hidden = true;
    }
  }

  if (aboutNoImagePlaceholder) {
    aboutNoImagePlaceholder.hidden = Boolean(imageData);
  }
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

// Stock Management Functions
function initializeStockManagement() {
  if (!daySelect || !productsStock || !saveWeeklyStock) return;

  loadProductsForStock();
  setupStockEventListeners();
  setupDatePicker();
}

function setupStockEventListeners() {
  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      currentDayIndex = parseInt(e.target.value);
      loadDayStock(currentDayIndex);
    });
  }

  if (saveWeeklyStock) {
    saveWeeklyStock.addEventListener('click', saveWeeklyStockData);
  }

  if (saveDateStock) {
    saveDateStock.addEventListener('click', saveDateStockData);
  }
}

function setupDatePicker() {
  if (!dateSelect) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  flatpickr(dateSelect, {
    minDate: tomorrow,
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d F Y",
    locale: "pl",
    onChange: function(selectedDates, dateStr, instance) {
      currentDate = selectedDates[0];
      if (currentDate) {
        loadDateStock(currentDate);
      }
    }
  });
}

async function loadProductsForStock() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Błąd pobierania produktów');
    products = await response.json();
    renderProductsStock(productsStock, products, currentDayIndex);
    loadStockOverview();
  } catch (error) {
    console.error('Błąd ładowania produktów:', error);
    showStockMessage('Błąd ładowania produktów', 'error');
  }
}

function renderProductsStock(container, products, dayIndex) {
  if (!container) return;

  container.innerHTML = '';

  products.forEach(product => {
    const productDiv = document.createElement('div');
    productDiv.className = 'product-stock-item';
    productDiv.innerHTML = `
      <div class="product-info">
        <span class="product-name">${product.name}</span>
        <span class="product-price">${product.price} zł</span>
      </div>
      <div class="stock-control">
        <label for="stock-${product._id}">Ilość:</label>
        <input type="number"
               id="stock-${product._id}"
               class="stock-input"
               min="0"
               value="0"
               data-product-id="${product._id}">
      </div>
    `;
    container.appendChild(productDiv);
  });
}

async function loadDayStock(dayIndex) {
  try {
    const response = await fetch(`/api/stock/${dayIndex}`);
    if (!response.ok) throw new Error('Błąd pobierania stanów');
    const stockData = await response.json();

    // Update input values with current stock
    stockData.forEach(item => {
      const input = document.querySelector(`#stock-${item.productId}`);
      if (input) {
        input.value = item.remaining;
      }
    });

    showStockMessage(`Załadowano stany dla ${DAYS_OF_WEEK[dayIndex]}`, 'success');
  } catch (error) {
    console.error('Błąd ładowania stanów:', error);
    showStockMessage('Błąd ładowania stanów', 'error');
  }
}

async function loadDateStock(date) {
  if (!date) return;

  try {
    const dayIndex = (date.getDay() + 6) % 7; // Convert to Monday=0 format
    const response = await fetch(`/api/stock/${dayIndex}`);
    if (!response.ok) throw new Error('Błąd pobierania stanów');
    const stockData = await response.json();

    // Render products for specific date
    renderProductsStock(dateProductsStock, products, dayIndex);

    // Update input values with current stock
    stockData.forEach(item => {
      const input = dateProductsStock.querySelector(`#stock-${item.productId}`);
      if (input) {
        input.value = item.remaining;
      }
    });

    showStockMessage(`Załadowano stany dla ${date.toLocaleDateString('pl-PL')}`, 'success');
  } catch (error) {
    console.error('Błąd ładowania stanów dla daty:', error);
    showStockMessage('Błąd ładowania stanów dla daty', 'error');
  }
}

async function saveWeeklyStockData() {
  try {
    const stockData = collectStockData(productsStock);
    const dayIndex = parseInt(daySelect.value);

    const response = await fetch('/api/stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockData.map(item => ({
        productId: item.productId,
        dayIndex: dayIndex,
        capacity: item.capacity
      })))
    });

    if (!response.ok) throw new Error('Błąd zapisywania stanów');

    showStockMessage(`Zapisano stany dla ${DAYS_OF_WEEK[dayIndex]}`, 'success');
    loadStockOverview();
  } catch (error) {
    console.error('Błąd zapisywania stanów:', error);
    showStockMessage('Błąd zapisywania stanów', 'error');
  }
}

async function saveDateStockData() {
  if (!currentDate) {
    showStockMessage('Wybierz datę', 'error');
    return;
  }

  try {
    const stockData = collectStockData(dateProductsStock);
    const dayIndex = (currentDate.getDay() + 6) % 7;

    const response = await fetch('/api/stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockData.map(item => ({
        productId: item.productId,
        dayIndex: dayIndex,
        capacity: item.capacity
      })))
    });

    if (!response.ok) throw new Error('Błąd zapisywania stanów');

    showStockMessage(`Zapisano stany dla ${currentDate.toLocaleDateString('pl-PL')}`, 'success');
    loadStockOverview();
  } catch (error) {
    console.error('Błąd zapisywania stanów:', error);
    showStockMessage('Błąd zapisywania stanów', 'error');
  }
}

function collectStockData(container) {
  const inputs = container.querySelectorAll('.stock-input');
  const stockData = [];

  inputs.forEach(input => {
    const productId = input.dataset.productId;
    const capacity = parseInt(input.value) || 0;

    if (productId) {
      stockData.push({ productId, capacity });
    }
  });

  return stockData;
}

async function loadStockOverview() {
  try {
    const response = await fetch('/api/stock/overview');
    if (!response.ok) throw new Error('Błąd pobierania przeglądu');
    const overview = await response.json();

    renderStockOverview(overview);
  } catch (error) {
    console.error('Błąd ładowania przeglądu:', error);
  }
}

function renderStockOverview(overview) {
  if (!stockOverview) return;

  stockOverview.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'stock-table';

  // Header
  const header = document.createElement('tr');
  header.innerHTML = `
    <th>Produkt</th>
    <th>Poniedziałek</th>
    <th>Wtorek</th>
    <th>Środa</th>
    <th>Czwartek</th>
    <th>Piątek</th>
    <th>Sobota</th>
    <th>Niedziela</th>
  `;
  table.appendChild(header);

  // Rows for each product
  overview.forEach(product => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="product-name">${product.name}</td>
      <td>${product.stock[0] || 0}</td>
      <td>${product.stock[1] || 0}</td>
      <td>${product.stock[2] || 0}</td>
      <td>${product.stock[3] || 0}</td>
      <td>${product.stock[4] || 0}</td>
      <td>${product.stock[5] || 0}</td>
      <td>${product.stock[6] || 0}</td>
    `;
    table.appendChild(row);
  });

  stockOverview.appendChild(table);
}

function showStockMessage(message, type) {
  // Create or update message element
  let messageEl = document.querySelector('.stock-message');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.className = 'stock-message';
    document.body.appendChild(messageEl);
  }

  messageEl.textContent = message;
  messageEl.className = `stock-message ${type}`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    if (messageEl) {
      messageEl.remove();
    }
  }, 3000);
}

// Initialize stock management when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeStockManagement();
});
