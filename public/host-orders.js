const reportsContainer = document.getElementById('orderReportsContainer');
const reportsMessage = document.getElementById('orderReportsMessage');
const orderReportsDescription = document.getElementById('orderReportsDescription');
const calendarInput = document.getElementById('ordersDatePicker');
const calendarMessage = document.getElementById('calendarOrdersMessage');
const calendarContainer = document.getElementById('calendarOrdersContainer');

const locale = 'pl-PL';
const currencyFormatter = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'PLN'
});

const reportsCache = new Map();
const ORDER_REPORT_DESCRIPTION_FALLBACK = 'Codziennie generujemy raport za poprzedni dzień i wysyłamy go na skonfigurowany adres e-mail.';

function describeOrderReportSchedule(settings) {
  if (!settings || typeof settings !== 'object') {
    return ORDER_REPORT_DESCRIPTION_FALLBACK;
  }

  if (settings.enabled === false) {
    return 'Automatyczne raporty są obecnie wyłączone. Możesz uruchomić raport ręcznie w razie potrzeby.';
  }

  const timeLabel = settings.scheduledTime || null;
  const timezone = settings.timezone || '';
  const targetEmail = settings.targetEmail || '';
  const sendsEmptyReport = settings.sendsEmptyReport !== false;

  const timeFragment = timeLabel ? `o ${timeLabel}` : 'o skonfigurowanej godzinie';
  const timezoneFragment = timezone ? ` (czas ${timezone})` : '';
  const emailFragment = targetEmail
    ? `wysyłamy go na adres ${targetEmail}`
    : 'wysyłamy go na skonfigurowany adres e-mail';
  const emptyReportFragment = sendsEmptyReport
    ? 'Nawet jeśli nie było zamówień, otrzymasz potwierdzenie z podsumowaniem.'
    : '';

  return `Codziennie ${timeFragment}${timezoneFragment} generujemy raport za poprzedni dzień i ${emailFragment}. ${emptyReportFragment}`.trim();
}

async function loadOrderReportSettings() {
  if (!orderReportsDescription) {
    return;
  }
  try {
    const response = await fetch('/api/settings/order-reports');
    if (!response.ok) {
      throw new Error('Nie udało się pobrać ustawień raportów zamówień.');
    }
    const settings = await response.json();
    orderReportsDescription.textContent = describeOrderReportSchedule(settings);
  } catch (err) {
    console.error(err);
    orderReportsDescription.textContent = ORDER_REPORT_DESCRIPTION_FALLBACK;
  }
}

function formatCurrency(value) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return currencyFormatter.format(number);
  }
  return value;
}

function formatDate(date) {
  if (!date) {
    return '';
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDateTime(date) {
  if (!date) {
    return '';
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTime(date) {
  if (!date) {
    return '';
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function normalizeDateString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function getReportLastFulfillmentDate(report) {
  if (!report) {
    return null;
  }
  const normalized = normalizeDateString(report.lastFulfillmentDate || report.reportDate);
  if (normalized) {
    return normalized;
  }
  const pickupDates = (report.orders || [])
    .map((order) => normalizeDateString(order && typeof order.pickupDate === 'string' ? order.pickupDate : ''))
    .filter(Boolean);
  if (!pickupDates.length) {
    return normalizeDateString(report.reportDate);
  }
  return pickupDates.reduce((latest, current) => (current > latest ? current : latest), pickupDates[0]);
}

function getReportFromCache(date) {
  if (!date) {
    return null;
  }
  const normalized = normalizeDateString(date);
  if (!normalized) {
    return null;
  }
  return reportsCache.get(normalized) || null;
}

function getPaymentStatus(order) {
  const value = order && order.payment ? String(order.payment).toLowerCase() : '';
  switch (value) {
    case 'online':
      return 'Zapłacone online';
    case 'place':
      return 'Płatność na miejscu';
    default: {
      const label = order && order.paymentLabel ? String(order.paymentLabel).trim() : '';
      return label || 'Brak danych';
    }
  }
}

function createFieldCell(label, value, extraClass = '') {
  const cell = document.createElement('div');
  cell.className = `order-report-entry__cell${extraClass ? ` ${extraClass}` : ''}`;

  const labelEl = document.createElement('span');
  labelEl.className = 'order-report-entry__label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'order-report-entry__value';
  if (value instanceof Node) {
    valueEl.appendChild(value);
  } else {
    valueEl.textContent = value;
  }

  cell.append(labelEl, valueEl);
  return cell;
}

function createProductsContent(order) {
  const container = document.createElement('div');
  container.className = 'order-report-entry__products-container';

  const list = document.createElement('ul');
  list.className = 'order-report-entry__products';

  const products = Array.isArray(order.products) ? order.products : [];
  if (products.length) {
    products.forEach((product) => {
      const item = document.createElement('li');
      const quantity = Number(product.quantity) || 0;
      const total = formatCurrency(product.total);
      item.textContent = `${product.name || 'Produkt'} × ${quantity} — ${total}`;
      list.appendChild(item);
    });
  } else {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'Brak pozycji';
    list.appendChild(emptyItem);
  }

  container.appendChild(list);

  const summary = document.createElement('p');
  summary.className = 'order-report-entry__summary';
  summary.innerHTML = `<strong>Suma:</strong> ${formatCurrency(order.totalAfterDiscount)}`;
  container.appendChild(summary);

  if (order.discountCode) {
    const discountInfo = document.createElement('p');
    discountInfo.className = 'order-report-entry__discount';
    discountInfo.innerHTML = `<strong>Rabat:</strong> ${order.discountCode} (${order.discountPercent}% / -${formatCurrency(order.discountAmount)})`;
    container.appendChild(discountInfo);
  }

  if (order.comment) {
    const commentInfo = document.createElement('p');
    commentInfo.className = 'order-report-entry__comment';
    commentInfo.innerHTML = `<strong>Komentarz:</strong><br>${order.comment.replace(/\r?\n/g, '<br>')}`;
    container.appendChild(commentInfo);
  }

  return container;
}

function createOrderRow(order) {
  const wrapper = document.createElement('article');
  wrapper.className = 'order-report-entry';

  const sequenceNumber = Number(order.sequenceNumber);
  const hasSequenceNumber = Number.isFinite(sequenceNumber) && sequenceNumber > 0;

  const header = document.createElement('header');
  header.className = 'order-report-entry__header';

  const title = document.createElement('h4');
  title.textContent = hasSequenceNumber
    ? `Zamówienie #${sequenceNumber}`
    : `Zamówienie ${order.orderId || ''}`.trim();
  header.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'order-report-entry__meta';
  meta.textContent = [
    hasSequenceNumber ? `Numer: #${sequenceNumber}` : null,
    order.pickupDate ? `Odbiór: ${order.pickupDate}` : null,
    `Kwota: ${formatCurrency(order.totalAfterDiscount)}`,
    order.firstName ? `Klient: ${order.firstName}` : null
  ].filter(Boolean).join(' • ');
  header.appendChild(meta);

  wrapper.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'order-report-entry__grid';

  const fields = [
    { label: 'Numer w dniu', value: hasSequenceNumber ? `#${sequenceNumber}` : '—' },
    { label: 'ID zamówienia', value: order.orderId || '—' },
    { label: 'Godzina złożenia', value: formatTime(order.createdAt) || '—' },
    { label: 'Imię', value: order.firstName || '—' },
    { label: 'Adres email', value: order.email || '—' },
    { label: 'Telefon', value: order.phone || '—' }
  ];

  fields.forEach((field) => {
    grid.appendChild(createFieldCell(field.label, field.value));
  });

  grid.appendChild(createFieldCell('Produkty', createProductsContent(order), 'order-report-entry__cell--products'));
  grid.appendChild(createFieldCell('Forma płatności', getPaymentStatus(order)));

  const body = document.createElement('div');
  body.className = 'order-report-entry__body';
  body.appendChild(grid);

  wrapper.appendChild(body);
  return wrapper;
}

function renderReport(report) {
  const card = document.createElement('article');
  card.className = 'order-report-card';
  if (report && report.reportDate) {
    card.dataset.reportDate = report.reportDate;
  }

  const lastFulfillmentDate = getReportLastFulfillmentDate(report);

  const header = document.createElement('header');
  header.className = 'order-report-card__header';

  const title = document.createElement('h3');
  title.textContent = formatDate(`${report.reportDate}T00:00:00`) || report.reportDate;
  header.appendChild(title);

  const badge = document.createElement('span');
  badge.className = `order-report-status order-report-status--${report.emailStatus || 'pending'}`;
  badge.textContent = (() => {
    switch (report.emailStatus) {
      case 'sent':
        return 'Wysłano';
      case 'failed':
        return 'Błąd wysyłki';
      case 'skipped':
        return 'Pominięto';
      default:
        return 'Oczekuje';
    }
  })();
  header.appendChild(badge);

  card.appendChild(header);

  const meta = document.createElement('p');
  meta.className = 'order-report-card__meta';
  meta.textContent = [
    `Zamówienia: ${report.totals?.ordersCount ?? report.orders?.length ?? 0}`,
    `Łącznie: ${formatCurrency(report.totals?.grandTotal ?? 0)}`,
    report.sentAt ? `Wysłano: ${formatDateTime(report.sentAt)}` : null,
    lastFulfillmentDate ? `Ostatnia realizacja: ${formatDate(`${lastFulfillmentDate}T00:00:00`)}` : null
  ].filter(Boolean).join(' • ');
  card.appendChild(meta);

  if (report.failureReason) {
    const errorInfo = document.createElement('p');
    errorInfo.className = 'order-report-card__error';
    errorInfo.textContent = `Powód błędu: ${report.failureReason}`;
    card.appendChild(errorInfo);
  }

  const details = document.createElement('details');
  details.className = 'order-report-card__details';
  if ((report.orders || []).length) {
    details.open = report.emailStatus !== 'sent';
  }

  const summary = document.createElement('summary');
  summary.textContent = 'Pokaż szczegóły zamówień';
  details.appendChild(summary);

  if ((report.orders || []).length) {
    const ordersWrapper = document.createElement('div');
    ordersWrapper.className = 'order-report-card__orders';

    report.orders.forEach((order) => {
      ordersWrapper.appendChild(createOrderRow(order));
    });

    details.appendChild(ordersWrapper);
  } else {
    const empty = document.createElement('p');
    empty.className = 'order-report-card__empty';
    empty.textContent = 'Brak zamówień w tym dniu.';
    details.appendChild(empty);
  }

  card.appendChild(details);

  const actions = document.createElement('div');
  actions.className = 'order-report-card__actions';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'order-report-delete';
  deleteButton.textContent = 'Usuń raport';
  deleteButton.addEventListener('click', () => handleDeleteReport(report.reportDate, deleteButton));
  actions.appendChild(deleteButton);

  card.appendChild(actions);

  return card;
}

async function handleDeleteReport(reportDate, triggerButton) {
  const normalized = normalizeDateString(reportDate);
  if (!normalized) {
    window.alert('Nieprawidłowa data raportu.');
    return;
  }

  const formattedDate = formatDate(`${normalized}T00:00:00`) || normalized;
  const confirmed = window.confirm(`Czy na pewno chcesz usunąć raport z dnia ${formattedDate}?`);
  if (!confirmed) {
    return;
  }

  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.classList.add('is-loading');
    triggerButton.textContent = 'Usuwanie...';
  }

  reportsMessage.textContent = 'Usuwanie raportu...';

  try {
    const response = await fetch(`/api/order-reports/${normalized}`, { method: 'DELETE' });
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      throw new Error(error || 'Nie udało się usunąć raportu.');
    }

    reportsCache.delete(normalized);

    document.querySelectorAll(`.order-report-card[data-report-date="${normalized}"]`).forEach((card) => {
      if (card && card.parentElement) {
        card.parentElement.removeChild(card);
      }
    });

    if (calendarInput && normalizeDateString(calendarInput.value) === normalized) {
      calendarContainer.innerHTML = '';
      calendarMessage.textContent = 'Raport został usunięty. Wybierz inną datę, aby zobaczyć zamówienia.';
    }

    if (!reportsContainer.children.length) {
      reportsMessage.textContent = 'Brak dostępnych zestawień.';
    } else {
      reportsMessage.textContent = 'Raport został usunięty.';
      setTimeout(() => {
        if (reportsMessage.textContent === 'Raport został usunięty.') {
          reportsMessage.textContent = '';
        }
      }, 2500);
    }
  } catch (error) {
    console.error(error);
    reportsMessage.textContent = error.message || 'Nie udało się usunąć raportu.';
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.classList.remove('is-loading');
      triggerButton.textContent = 'Usuń raport';
    }
  }
}

function renderCalendarOrders(reportDate, report) {
  if (!calendarContainer) {
    return;
  }

  calendarContainer.innerHTML = '';

  if (!report || !Array.isArray(report.orders) || !report.orders.length) {
    const empty = document.createElement('p');
    empty.className = 'order-calendar-empty';
    empty.textContent = 'Brak zamówień dla wybranej daty.';
    calendarContainer.appendChild(empty);
    return;
  }

  const normalizedDate = normalizeDateString(reportDate) || report.reportDate;
  const heading = document.createElement('header');
  heading.className = 'order-calendar-header';

  const title = document.createElement('h3');
  title.textContent = `Zamówienia na ${formatDate(`${normalizedDate}T00:00:00`) || normalizedDate}`;
  heading.appendChild(title);

  const lastFulfillmentDate = getReportLastFulfillmentDate(report);
  const meta = document.createElement('p');
  meta.className = 'order-calendar-meta';
  meta.textContent = [
    `Łącznie zamówień: ${report.totals?.ordersCount ?? report.orders.length}`,
    `Suma: ${formatCurrency(report.totals?.grandTotal ?? 0)}`,
    lastFulfillmentDate ? `Ostatnia realizacja: ${formatDate(`${lastFulfillmentDate}T00:00:00`)}` : null
  ].filter(Boolean).join(' • ');
  heading.appendChild(meta);

  calendarContainer.appendChild(heading);

  const ordersWrapper = document.createElement('div');
  ordersWrapper.className = 'order-calendar-orders';

  report.orders.forEach((order) => {
    ordersWrapper.appendChild(createOrderRow(order));
  });

  calendarContainer.appendChild(ordersWrapper);
}

async function fetchPickupOrders(normalizedDate) {
  if (!normalizedDate) {
    return null;
  }

  const response = await fetch(`/api/orders/pickup/${normalizedDate}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error || 'Nie udało się pobrać zamówień dla tej daty.');
  }
  return response.json();
}

async function loadReportByDate(date) {
  const normalized = normalizeDateString(date);
  if (!normalized) {
    return null;
  }

  const cached = getReportFromCache(normalized);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(`/api/order-reports/${normalized}`);
    if (response.ok) {
      const report = await response.json();
      if (report && report.reportDate) {
        reportsCache.set(report.reportDate, report);
      }
      return report;
    }
    if (response.status !== 404) {
      const { error } = await response.json().catch(() => ({}));
      throw new Error(error || 'Nie udało się pobrać zestawienia zamówień.');
    }
  } catch (error) {
    if (error instanceof Error && error.message && error.message.includes('pobrać zestawienia')) {
      throw error;
    }
    console.error(error);
  }

  const pickupData = await fetchPickupOrders(normalized);
  if (pickupData && Array.isArray(pickupData.orders)) {
    const totals = pickupData.totals || {
      ordersCount: pickupData.orders.length,
      grandTotal: pickupData.orders.reduce((sum, order) => sum + (Number(order.totalAfterDiscount) || 0), 0)
    };
    totals.grandTotal = Number(totals.grandTotal.toFixed(2));

    return {
      reportDate: normalized,
      orders: pickupData.orders,
      totals,
      lastFulfillmentDate: pickupData.lastFulfillmentDate || normalized,
      emailStatus: 'live',
      source: 'live'
    };
  }

  return null;
}

async function showOrdersForDate(date, { skipInputSync = false, silentIfEmpty = false } = {}) {
  if (!calendarMessage || !calendarContainer) {
    return;
  }

  const normalized = normalizeDateString(date);
  if (!normalized) {
    calendarContainer.innerHTML = '';
    if (!silentIfEmpty) {
      calendarMessage.textContent = 'Wybierz datę, aby zobaczyć zamówienia.';
    }
    return;
  }

  if (!skipInputSync && calendarInput) {
    calendarInput.value = normalized;
  }

  calendarMessage.textContent = 'Ładowanie zamówień...';
  calendarContainer.innerHTML = '';

  try {
    const report = await loadReportByDate(normalized);
    if (!report || !Array.isArray(report.orders) || !report.orders.length) {
      calendarMessage.textContent = 'Brak zamówień dla wybranej daty.';
      return;
    }

    calendarMessage.textContent = '';
    renderCalendarOrders(normalized, report);
  } catch (error) {
    console.error(error);
    calendarMessage.textContent = 'Nie udało się pobrać zamówień dla wskazanej daty.';
  }
}

function initializeCalendar() {
  if (!calendarInput) {
    return;
  }

  calendarMessage.textContent = 'Wybierz datę, aby zobaczyć zamówienia.';

  calendarInput.addEventListener('change', (event) => {
    showOrdersForDate(event.target.value, { skipInputSync: true });
  });

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const todayValue = now.toISOString().slice(0, 10);
  calendarInput.value = todayValue;
  showOrdersForDate(todayValue, { skipInputSync: true, silentIfEmpty: true });
}

async function fetchOrderReports() {
  reportsMessage.textContent = 'Ładowanie zestawień...';
  try {
    const response = await fetch('/api/order-reports?limit=90');
    if (!response.ok) {
      throw new Error('Nie udało się pobrać danych');
    }
    const data = await response.json();
    reportsCache.clear();
    reportsContainer.innerHTML = '';

    if (!Array.isArray(data) || data.length === 0) {
      reportsMessage.textContent = 'Brak dostępnych zestawień.';
      return;
    }

    data.forEach((report) => {
      if (report && report.reportDate) {
        reportsCache.set(report.reportDate, report);
      }
      reportsContainer.appendChild(renderReport(report));
    });
    reportsMessage.textContent = '';

    if (calendarInput && calendarInput.value) {
      showOrdersForDate(calendarInput.value, { skipInputSync: true, silentIfEmpty: true });
    }
  } catch (error) {
    console.error(error);
    reportsMessage.textContent = 'Wystąpił błąd podczas pobierania zestawień zamówień.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadOrderReportSettings();
  fetchOrderReports();
  initializeCalendar();
});
