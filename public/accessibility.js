const availabilityGrid = document.getElementById('availabilityGrid');
const availabilityError = document.getElementById('availabilityError');
const availabilityDateInput = document.getElementById('availabilityDate');
const availabilityStock = document.getElementById('availabilityStock');

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

document.addEventListener('DOMContentLoaded', () => {
  loadAvailabilitySchedule();
  initializeFlatpickr();
});

function initializeFlatpickr() {
  if (!availabilityDateInput) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 1);

  flatpickr(availabilityDateInput, {
    minDate: tomorrow,
    maxDate: maxDate,
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d F Y",
    locale: "pl",
    inline: true,
    onChange: function(selectedDates, dateStr, instance) {
      const selectedDate = selectedDates[0];
      if (selectedDate) {
        handleDatePicked(selectedDate);
      }
    }
  });
}

async function loadAvailabilitySchedule() {
  if (!availabilityGrid) {
    return;
  }

  try {
    toggleAvailabilityError(false);
    availabilityGrid.classList.add('is-loading');

    const res = await fetch('/api/availability');
    if (!res.ok) {
      throw new Error('Nie udało się pobrać danych o dostępności');
    }

    const data = await res.json();
    renderAvailabilityCards(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Błąd pobierania dostępności:', error);
    renderAvailabilityCards([]);
    toggleAvailabilityError(true, 'Nie udało się załadować harmonogramu. Spróbuj ponownie później.');
  } finally {
    availabilityGrid.classList.remove('is-loading');
  }
}

async function handleDatePicked(date) {
  if (!(date instanceof Date)) return;
  const dayIndex = (date.getDay() + 6) % 7; // convert JS (Sun=0) to Mon=0..Sun=6
  const dayName = DAYS_OF_WEEK[dayIndex];

  try {
    if (availabilityStock) availabilityStock.textContent = 'Ładuję produkty...';

    // Load products available on this specific day
    const res = await fetch(`/api/products/day/${dayIndex}`);
    if (!res.ok) throw new Error('Błąd pobierania produktów');
    const products = await res.json();

    // Update the selected date display
    const selectedDateElement = document.getElementById('selectedAvailabilityDate');
    if (selectedDateElement) {
      selectedDateElement.textContent = `${dayName}, ${date.toLocaleDateString('pl-PL')}`;
    }

    renderProductsForDay(products, dayName);
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
    if (availabilityStock) availabilityStock.textContent = 'Nie udało się pobrać produktów dla wybranej daty.';
  }
}

function renderProductsForDay(products, dayName) {
  if (!availabilityStock) {
    return;
  }

  if (!Array.isArray(products) || !products.length) {
    availabilityStock.innerHTML = `
      <h3>Dostępne produkty na ${dayName}</h3>
      <p>Brak dostępnych produktów na wybrany dzień.</p>
    `;
    return;
  }

  const title = document.createElement('h3');
  title.textContent = `Dostępne produkty na ${dayName}`;

  const list = document.createElement('ul');
  list.className = 'availability-stock-list';

  products.forEach((product) => {
    const li = document.createElement('li');
    li.className = 'availability-stock-item';
    li.innerHTML = `
      <div class="product-info">
        <span class="product-name">${product.name}</span>
        <span class="product-price">${product.price} zł</span>
      </div>
      <div class="product-description">${product.description || ''}</div>
    `;
    list.appendChild(li);
  });

  availabilityStock.innerHTML = '';
  availabilityStock.appendChild(title);
  availabilityStock.appendChild(list);
}

function renderStockList(items) {
  if (!availabilityStock) {
    return;
  }
  if (!Array.isArray(items) || !items.length) {
    availabilityStock.innerHTML = '<p>Brak danych magazynowych.</p>';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'availability-stock-list';
  items.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'availability-stock-item';
    const name = document.createElement('span');
    name.className = 'availability-stock-name';
    name.textContent = it && it.name ? it.name : (it.productId || 'Produkt');
    const qty = document.createElement('span');
    qty.className = 'availability-stock-qty';
    qty.textContent = `pozostało: ${Number(it && it.remaining) || 0}`;
    li.append(name, qty);
    list.appendChild(li);
  });
  availabilityStock.innerHTML = '';
  availabilityStock.appendChild(list);
}


function renderAvailabilityCards(schedule) {
  if (!availabilityGrid) {
    return;
  }

  availabilityGrid.innerHTML = '';

  const data = schedule.length ? schedule : DAYS_OF_WEEK.map((dayName, dayIndex) => ({
    dayIndex,
    dayName,
    details: '',
    time: '',
    entries: [],
    updatedAt: null
  }));

  data.forEach((day, index) => {
    availabilityGrid.appendChild(createAvailabilityCard(day, index));
  });
}

function createAvailabilityCard(day, index) {
  const card = document.createElement('article');
  card.className = 'availability-card';
  card.style.setProperty('--card-index', index);

  const heading = document.createElement('header');
  heading.className = 'availability-card__header';

  const title = document.createElement('h3');
  title.textContent = day.dayName || DAYS_OF_WEEK[day.dayIndex] || '';
  heading.appendChild(title);

  const timeInfo = document.createElement('p');
  timeInfo.className = 'availability-card__time';
  heading.appendChild(timeInfo);

  const body = document.createElement('div');
  body.className = 'availability-card__body';

  if (day.details) {
    const details = document.createElement('p');
    details.className = 'availability-card__details';
    details.textContent = day.details;
    body.appendChild(details);
  }

  const normalizeTime = (value) => {
    if (!value) {
      return '';
    }
    const match = value.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match) {
      return '';
    }
    const hour = match[1].padStart(2, '0');
    const minute = match[2] ?? '00';
    return `${hour}:${minute}`;
  };

  const entries = Array.isArray(day.entries)
    ? day.entries
        .filter((entry) => entry && (entry.product || entry.availableFrom))
        .map((entry) => {
          const product = entry.product || '';
          const availableFromRaw = entry.availableFrom || '';
          const normalizedTime = normalizeTime(availableFromRaw);
          return {
            product,
            availableFrom: normalizedTime || availableFromRaw,
            sortKey: normalizedTime || availableFromRaw
          };
        })
    : [];

  const sortedEntries = entries.slice().sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (sortedEntries.length) {
    const firstWithTime = sortedEntries.find((entry) => entry.availableFrom);
    if (firstWithTime && firstWithTime.availableFrom) {
      timeInfo.textContent = `Najwcześniej dostępne od ${firstWithTime.availableFrom}`;
    } else {
      timeInfo.textContent = 'Wypieki dostępne w ciągu dnia.';
    }

    const list = document.createElement('ul');
    list.className = 'availability-card__list';

    sortedEntries.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'availability-card__list-item';

      const product = document.createElement('span');
      product.className = 'availability-card__list-product';
      product.textContent = entry.product || 'Produkt';
      item.appendChild(product);

      const time = document.createElement('span');
      time.className = 'availability-card__list-time';
      time.textContent = entry.availableFrom
        ? `od ${entry.availableFrom}`
        : 'godzina zostanie podana';
      item.appendChild(time);

      list.appendChild(item);
    });

    body.appendChild(list);
  } else {
    timeInfo.textContent = 'Brak zaplanowanych pozycji na ten dzień.';

    const empty = document.createElement('p');
    empty.className = 'availability-card__empty';
    empty.textContent = 'Szczegółowe godziny produktów pojawią się wkrótce.';
    body.appendChild(empty);
  }

  card.append(heading, body);
  return card;
}

function toggleAvailabilityError(visible, message = '') {
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
