const availabilityGrid = document.getElementById('availabilityGrid');
const availabilityError = document.getElementById('availabilityError');

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

document.addEventListener('DOMContentLoaded', () => {
  loadAvailabilitySchedule();
});

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
