// Koszyk klienta w sesji
let cart = JSON.parse(sessionStorage.getItem("cart")) || [];

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const orderMessage = document.getElementById("orderMessage");
const cartDiscountRow = document.getElementById("cartDiscountRow");
const cartDiscountLabel = document.getElementById("cartDiscountLabel");
const cartDiscountAmount = document.getElementById("cartDiscountAmount");
const cartFinalTotal = document.getElementById("cartFinalTotal");
const discountCodeInputEl = document.getElementById("discountCodeInput");
const applyDiscountButton = document.getElementById("applyDiscountButton");
const removeDiscountButton = document.getElementById("removeDiscountButton");
const discountFeedback = document.getElementById("discountFeedback");
const pickupDateInput = document.getElementById("pickupDate");

const currencyFormatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const PRODUCT_DAY_LABELS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const PRODUCT_DAY_ABBREVIATIONS = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];

let availableDiscountCodes = [];
let activeDiscount = null;
let lastSummaryTotals = {
  totalBeforeDiscount: 0,
  discountAmount: 0,
  totalAfterDiscount: 0
};
let selectedPickupDate = null;

function parseAvailabilityValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    if (value.daily === true && !Array.isArray(value.days) && !Array.isArray(value.availabilityDays) && !Array.isArray(value.availableDays)) {
      return PRODUCT_DAY_ABBREVIATIONS.map((_, index) => index);
    }
    if (Array.isArray(value.days)) {
      return value.days;
    }
    if (Array.isArray(value.availabilityDays)) {
      return value.availabilityDays;
    }
    if (Array.isArray(value.availableDays)) {
      return value.availableDays;
    }
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
      // ignore parse errors, fallback to comma split
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

function buildCartItemAvailabilityMarkup(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }
  const availabilitySource = item.availability ?? item.availabilityDays ?? item.availableDays;
  if (availabilitySource === undefined || availabilitySource === null) {
    return '';
  }
  const availability = normalizeAvailabilityDaysForRender(availabilitySource);
  if (availability.daily) {
    const label = 'Dostępne codziennie';
    return `
      <div class="cart-item-availability" aria-label="Dni dostępności">
        <span class="cart-item-availability-badge cart-item-availability-badge--daily" aria-label="${label}" title="${label}">codziennie</span>
      </div>
    `.trim();
  }
  if (!availability.days.length) {
    const label = 'Brak określonych dni dostępności';
    return `
      <div class="cart-item-availability" aria-label="Dni dostępności">
        <span class="cart-item-availability-badge cart-item-availability-badge--muted" aria-label="${label}" title="${label}">--</span>
      </div>
    `.trim();
  }
  const badges = availability.days.map((index) => {
    const abbr = PRODUCT_DAY_ABBREVIATIONS[index] || '?';
    const label = PRODUCT_DAY_LABELS[index] ? `Dostępne w ${PRODUCT_DAY_LABELS[index]}` : 'Dostępność nieznana';
    return `<span class="cart-item-availability-badge" aria-label="${label}" title="${label}">${abbr}</span>`;
  }).join('');
  return `<div class="cart-item-availability" aria-label="Dni dostępności">${badges}</div>`;
}

function formatPickupDateForApi(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function notifyStockRefresh(dateStr) {
  if (!dateStr) {
    return;
  }
  const payload = { date: dateStr, ts: Date.now() };
  try {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel('chachor-stock');
      channel.postMessage(payload);
      channel.close();
    }
  } catch (err) {
    // ignore broadcast errors
  }
  try {
    const serialized = JSON.stringify(payload);
    localStorage.setItem('chachor_stock_refresh_signal', serialized);
    localStorage.setItem('chachor_stock_refresh_latest', serialized);
  } catch (err) {
    // ignore storage errors
  }
}

function parsePrice(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const sanitized = value.replace(/[^0-9,.-]/g, '').replace(',', '.');
    const numeric = Number(sanitized);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function formatPrice(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return currencyFormatter.format(Math.max(0, numeric));
}

function triggerPulse(element, className) {
  if (!element) {
    return;
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function showOrderMessage(type, message, { html = false } = {}) {
  if (!orderMessage) {
    return;
  }

  orderMessage.classList.remove('success', 'error', 'is-visible');
  if (type) {
    orderMessage.classList.add(type);
  }
  if (html) {
    orderMessage.innerHTML = message;
  } else {
    orderMessage.textContent = message;
  }

  requestAnimationFrame(() => {
    orderMessage.classList.add('is-visible');
  });
}

function showDiscountFeedback(type, message) {
  if (!discountFeedback) {
    return;
  }
  discountFeedback.classList.remove('success', 'error');
  if (type) {
    discountFeedback.classList.add(type);
  }
  discountFeedback.textContent = message;
}

function storeActiveDiscount() {
  if (activeDiscount) {
    sessionStorage.setItem('cartDiscount', JSON.stringify(activeDiscount));
  } else {
    sessionStorage.removeItem('cartDiscount');
  }
}

async function loadDiscountCodes() {
  try {
    showDiscountFeedback('', '');
    const res = await fetch('/api/discount-codes');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    availableDiscountCodes = await res.json();
    restoreDiscountFromStorage();
  } catch (error) {
    console.error('Błąd pobierania kodów rabatowych:', error);
    availableDiscountCodes = [];
    showDiscountFeedback('error', 'Nie udało się pobrać kodów rabatowych.');
    removeActiveDiscount({ silent: true });
  }
}

function normalizeDiscountInput(value) {
  return (value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function applyDiscount(codeValue) {
  showDiscountFeedback('', '');
  const normalized = normalizeDiscountInput(codeValue);
  if (!normalized) {
    showDiscountFeedback('error', 'Wpisz kod rabatowy.');
    return;
  }

  const match = availableDiscountCodes.find((item) => item && typeof item.code === 'string' && item.code.toUpperCase() === normalized);

  if (!match) {
    showDiscountFeedback('error', 'Nieprawidłowy kod rabatowy.');
    return;
  }

  const percent = Number(match.percent);
  if (!Number.isFinite(percent) || percent <= 0) {
    showDiscountFeedback('error', 'Kod rabatowy jest nieaktywny.');
    return;
  }

  activeDiscount = {
    code: match.code.toUpperCase(),
    percent
  };
  storeActiveDiscount();
  updateSummaryTotals(lastSummaryTotals.totalBeforeDiscount);
  if (discountCodeInputEl) {
    discountCodeInputEl.value = activeDiscount.code;
  }
  if (removeDiscountButton) {
    removeDiscountButton.classList.remove('hidden');
  }
  showDiscountFeedback('success', `Zastosowano kod ${activeDiscount.code}.`);
}

function removeActiveDiscount(options = {}) {
  const hadDiscount = !!(activeDiscount && activeDiscount.code);
  activeDiscount = null;
  storeActiveDiscount();
  updateSummaryTotals(lastSummaryTotals.totalBeforeDiscount);
  if (discountCodeInputEl) {
    discountCodeInputEl.value = '';
  }
  if (removeDiscountButton) {
    removeDiscountButton.classList.add('hidden');
  }
  if (hadDiscount && !options.silent) {
    showDiscountFeedback('success', 'Kod rabatowy został usunięty.');
  }
}

if (applyDiscountButton) {
  applyDiscountButton.addEventListener('click', () => {
    applyDiscount(discountCodeInputEl ? discountCodeInputEl.value : '');
  });
}

if (discountCodeInputEl) {
  discountCodeInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyDiscount(discountCodeInputEl.value);
    }
  });
}

if (removeDiscountButton) {
  removeDiscountButton.addEventListener('click', () => {
    removeActiveDiscount();
  });
}

function restoreDiscountFromStorage() {
  const stored = sessionStorage.getItem('cartDiscount');
  if (!stored) {
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.code) {
      const match = availableDiscountCodes.find((item) => item && typeof item.code === 'string' && item.code.toUpperCase() === parsed.code.toUpperCase());
      if (match) {
        activeDiscount = {
          code: match.code.toUpperCase(),
          percent: Number(match.percent)
        };
        storeActiveDiscount();
        if (discountCodeInputEl) {
          discountCodeInputEl.value = activeDiscount.code;
        }
        if (removeDiscountButton) {
          removeDiscountButton.classList.remove('hidden');
        }
        showDiscountFeedback('success', `Zastosowano kod ${activeDiscount.code}.`);
        updateSummaryTotals(lastSummaryTotals.totalBeforeDiscount);
        return;
      }
    }
  } catch (err) {
    console.warn('Nie udało się odczytać zapisanego kodu rabatowego:', err);
  }

  sessionStorage.removeItem('cartDiscount');
  activeDiscount = null;
  updateSummaryTotals(lastSummaryTotals.totalBeforeDiscount);
}

function updateSummaryTotals(totalBeforeDiscount) {
  lastSummaryTotals.totalBeforeDiscount = totalBeforeDiscount;
  let discountAmount = 0;
  let finalTotal = totalBeforeDiscount;

  const hasPositiveTotal = totalBeforeDiscount > 0;

  if (hasPositiveTotal && activeDiscount && Number.isFinite(activeDiscount.percent) && activeDiscount.percent > 0) {
    discountAmount = Number((totalBeforeDiscount * activeDiscount.percent / 100).toFixed(2));
    finalTotal = Math.max(0, Number((totalBeforeDiscount - discountAmount).toFixed(2)));

    if (cartDiscountRow) {
      cartDiscountRow.classList.remove('hidden');
    }
    if (cartDiscountLabel && activeDiscount) {
      cartDiscountLabel.textContent = `Rabat (${activeDiscount.percent}% - ${activeDiscount.code})`;
    }
    if (cartDiscountAmount) {
      cartDiscountAmount.textContent = `-${formatPrice(discountAmount)}`;
    }
    if (removeDiscountButton) {
      removeDiscountButton.classList.remove('hidden');
    }
  } else {
    if (cartDiscountRow) {
      cartDiscountRow.classList.add('hidden');
    }
    if (removeDiscountButton) {
      removeDiscountButton.classList.add('hidden');
    }
    if (cartDiscountAmount) {
      cartDiscountAmount.textContent = `-${formatPrice(0)}`;
    }
    if (cartDiscountLabel) {
      cartDiscountLabel.textContent = 'Rabat';
    }
  }

  lastSummaryTotals.discountAmount = discountAmount;
  lastSummaryTotals.totalAfterDiscount = finalTotal;

  if (cartTotal) {
    cartTotal.textContent = formatPrice(totalBeforeDiscount);
  }
  if (cartFinalTotal) {
    cartFinalTotal.textContent = formatPrice(finalTotal);
    triggerPulse(cartFinalTotal, 'pulse');
  }
}

// Zapis koszyka w sessionStorage i aktualizacja widoku
function saveCart() {
  sessionStorage.setItem("cart", JSON.stringify(cart));
  updateCart();
  updateCartCount();
}

// Aktualizacja licznika koszyka w pasku
function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) {
    cartCount.textContent = totalItems;
  }
}

// Wyświetlenie koszyka w cart.html
function updateCart() {
  if (!cartItems) {
    return;
  }

  cartItems.innerHTML = "";
  let total = 0;

  if (!cart.length) {
    cartItems.innerHTML = `
      <div class="cart-empty-state">
        <strong>Koszyk jest pusty.</strong>
        <p>Dodaj pyszne wypieki i zobacz, jak rośnie Twoje zamówienie.</p>
        <a class="cart-empty-action" href="/index">Wróć do zakupów</a>
      </div>
    `;
    updateSummaryTotals(0);
    return;
  }

  cart.forEach((item, index) => {
    const unitPrice = parsePrice(item.price);
    const itemTotal = unitPrice * item.quantity;
    total += itemTotal;

    const card = document.createElement('div');
    card.className = 'cart-item-card';
    const availabilityMarkup = buildCartItemAvailabilityMarkup(item);
    card.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${item.name}</span>
        ${availabilityMarkup}
        <div class="cart-item-meta">
          <span class="cart-item-price">${formatPrice(unitPrice)} / szt.</span>
          <span class="cart-item-total">${formatPrice(itemTotal)}</span>
        </div>
      </div>
      <div class="cart-item-actions">
        <div class="quantity-controls" role="group" aria-label="Ilość dla ${item.name}">
          <button class="quantity-btn" type="button" onclick="changeQuantity(${index}, -1)" aria-label="Zmniejsz ilość">-</button>
          <span class="quantity-value">${item.quantity}</span>
          <button class="quantity-btn" type="button" onclick="changeQuantity(${index}, 1)" aria-label="Zwiększ ilość">+</button>
        </div>
        <button class="remove-btn" type="button" onclick="removeItem(${index})" aria-label="Usuń ${item.name}">&times;</button>
      </div>
    `;

    cartItems.appendChild(card);
  });

  updateSummaryTotals(total);
}

// Zmiana ilości produktu
function changeQuantity(index, delta) {
  const item = cart[index];
  if (!item) {
    return;
  }

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart.splice(index, 1);
  }
  saveCart();
}

// Usuwanie produktu
function removeItem(index) {
  if (typeof cart[index] === 'undefined') {
    return;
  }
  cart.splice(index, 1);
  saveCart();
}

// Obsługa formularza zamówienia
const orderForm = document.getElementById("orderForm");
if (orderForm) {
  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!cart.length) {
      showOrderMessage('error', 'Koszyk jest pusty! Dodaj coś pysznego, zanim złożysz zamówienie.');
      return;
    }

    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const comment = document.getElementById("comment").value.trim();
    const paymentInput = orderForm.querySelector("input[name='payment']:checked");
    const payment = paymentInput ? paymentInput.value : 'place';

    if (!(selectedPickupDate instanceof Date)) {
      showOrderMessage('error', 'Wybierz datę odbioru z kalendarza.');
      return;
    }
    const pickupDateStr = formatPickupDateForApi(selectedPickupDate);
    if (!pickupDateStr) {
      showOrderMessage('error', 'Wybierz prawidłową datę odbioru.');
      return;
    }
    const pickupDayIndex = (selectedPickupDate.getDay() + 6) % 7;

    // pre-check remaining stock for selected day
    try {
      const res = await fetch(`/api/stock/date/${pickupDateStr}`);
      if (res.ok) {
        const stock = await res.json();
        const stockMap = new Map(stock.map((s) => [String(s.productId), Number(s.remaining) || 0]));
        const insufficient = [];
        cart.forEach((item) => {
          const remaining = stockMap.get(String(item.id));
          if (remaining !== undefined && item.quantity > remaining) {
            insufficient.push({ name: item.name, left: remaining });
          }
        });
        if (insufficient.length) {
          const list = insufficient.map((x) => `<li><strong>${x.name}</strong>: dostępne ${x.left} szt.</li>`).join('');
          const msg = `Za duża ilość w koszyku na wybrany dzień.<ul>${list}</ul><a href="/accessibility">Sprawdź dostępność</a>`;
          showOrderMessage('error', msg, { html: true });
          return;
        }
      }
    } catch (_) {
      // ignore pre-check errors; server will validate
    }

    const order = {
      email,
      phone,
      comment,
      payment,
      products: cart,
      pickupDate: pickupDateStr,
      pickupDayIndex,
      discountCode: activeDiscount ? activeDiscount.code : '',
      discountPercent: activeDiscount ? activeDiscount.percent : 0,
      discountAmount: lastSummaryTotals.discountAmount,
      totalBeforeDiscount: lastSummaryTotals.totalBeforeDiscount,
      totalAfterDiscount: lastSummaryTotals.totalAfterDiscount
    };

    const submitButton = orderForm.querySelector('.cart-submit');
    if (submitButton) {
      submitButton.disabled = true;
      if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText = submitButton.textContent;
      }
      submitButton.textContent = 'Wysyłam zamówienie...';
    }

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });

      if (response.ok) {
        notifyStockRefresh(pickupDateStr);
        showOrderMessage('success', 'Zamówienie złożone! Wkrótce dostaniesz maila z potwierdzeniem.');
        cart = [];
        saveCart();
        orderForm.reset();
        removeActiveDiscount({ silent: true });
        showDiscountFeedback('', '');
      } else {
        let errorMessage = 'Błąd składania zamówienia. Spróbuj ponownie.';
        try {
          const errorData = await response.json();
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (err) {
          /* ignoruj błąd parsowania */
        }

        showOrderMessage('error', errorMessage);

        if (/kod rabatowy/i.test(errorMessage)) {
          removeActiveDiscount({ silent: true });
          showDiscountFeedback('error', errorMessage);
        }
      }
    } catch (error) {
      console.error(error);
      showOrderMessage('error', 'Błąd połączenia z serwerem. Spróbuj ponownie później.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalText || 'Złóż zamówienie';
      }
    }
  });
}

// Inicjalizacja przy załadowaniu strony
window.addEventListener("DOMContentLoaded", () => {
  updateCart();
  updateCartCount();
  loadDiscountCodes();
  initializeFlatpickr();
});

function initializeFlatpickr() {
  if (!pickupDateInput) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 1);

  const baseLocale = (typeof flatpickr !== 'undefined' && flatpickr.l10ns && flatpickr.l10ns.pl)
    ? flatpickr.l10ns.pl
    : null;
  const localeConfig = baseLocale
    ? { ...baseLocale, firstDayOfWeek: 1 }
    : { firstDayOfWeek: 1 };

  flatpickr(pickupDateInput, {
    minDate: tomorrow,
    maxDate: maxDate,
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d F Y",
    locale: localeConfig,
    inline: true,
    onChange: function(selectedDates, dateStr, instance) {
      selectedPickupDate = selectedDates[0] || null;
    }
  });
}
