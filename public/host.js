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

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
let availabilityMessageTimer = null;

let categoriesCache = [];

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
    details: '',
    time: '',
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
      card.innerHTML = `
        ${imageSrc ? `<img src="${imageSrc}" alt="${product.name}" class="product-thumb">` : ''}
        <div class="product-info">
          <h3>${product.name}</h3>
          <p>${product.desc}</p>
          <p><strong>${product.price} zł</strong></p>
          <p>Kategoria: <em>${product.category}</em></p>
          <button class="delete-btn" data-id="${product._id}">Usuń</button>
        </div>
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
