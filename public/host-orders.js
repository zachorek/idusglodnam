const reportsContainer = document.getElementById('orderReportsContainer');
const reportsMessage = document.getElementById('orderReportsMessage');

const locale = 'pl-PL';
const currencyFormatter = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'PLN'
});

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
    `Kwota: ${formatCurrency(order.totalAfterDiscount)}`
  ].filter(Boolean).join(' • ');
  header.appendChild(meta);

  wrapper.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'order-report-entry__grid';

  const fields = [
    { label: 'Numer w dniu', value: hasSequenceNumber ? `#${sequenceNumber}` : '—' },
    { label: 'ID zamówienia', value: order.orderId || '—' },
    { label: 'Godzina złożenia', value: formatTime(order.createdAt) || '—' },
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
    report.sentAt ? `Wysłano: ${formatDateTime(report.sentAt)}` : null
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

  return card;
}

async function fetchOrderReports() {
  reportsMessage.textContent = 'Ładowanie zestawień...';
  try {
    const response = await fetch('/api/order-reports?limit=90');
    if (!response.ok) {
      throw new Error('Nie udało się pobrać danych');
    }
    const data = await response.json();
    reportsContainer.innerHTML = '';

    if (!Array.isArray(data) || data.length === 0) {
      reportsMessage.textContent = 'Brak dostępnych zestawień.';
      return;
    }

    data.forEach((report) => {
      reportsContainer.appendChild(renderReport(report));
    });
    reportsMessage.textContent = '';
  } catch (error) {
    console.error(error);
    reportsMessage.textContent = 'Wystąpił błąd podczas pobierania zestawień zamówień.';
  }
}

document.addEventListener('DOMContentLoaded', fetchOrderReports);
