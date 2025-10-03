// Koszyk klienta w sesji
let cart = JSON.parse(sessionStorage.getItem("cart")) || [];

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const orderMessage = document.getElementById("orderMessage");

const currencyFormatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });

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

function showOrderMessage(type, message) {
  if (!orderMessage) {
    return;
  }

  orderMessage.classList.remove('success', 'error', 'is-visible');
  if (type) {
    orderMessage.classList.add(type);
  }
  orderMessage.textContent = message;

  requestAnimationFrame(() => {
    orderMessage.classList.add('is-visible');
  });
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
    if (cartTotal) {
      cartTotal.textContent = formatPrice(0);
      cartTotal.classList.remove('pulse');
    }
    return;
  }

  cart.forEach((item, index) => {
    const unitPrice = parsePrice(item.price);
    const itemTotal = unitPrice * item.quantity;
    total += itemTotal;

    const card = document.createElement('div');
    card.className = 'cart-item-card';
    card.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${item.name}</span>
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

  if (cartTotal) {
    cartTotal.textContent = formatPrice(total);
    triggerPulse(cartTotal, 'pulse');
  }
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

    const order = {
      email,
      phone,
      comment,
      payment,
      products: cart
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
        showOrderMessage('success', 'Zamówienie złożone! Wkrótce dostaniesz maila z potwierdzeniem.');
        cart = [];
        saveCart();
        orderForm.reset();
      } else {
        showOrderMessage('error', 'Błąd składania zamówienia. Spróbuj ponownie.');
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
});
