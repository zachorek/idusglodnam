// Koszyk klienta w sesji
let cart = JSON.parse(sessionStorage.getItem("cart")) || [];

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");

// Zapis koszyka w sessionStorage i aktualizacja widoku
function saveCart() {
  sessionStorage.setItem("cart", JSON.stringify(cart));
  updateCart();
  updateCartCount();
}

// Aktualizacja licznika koszyka w pasku
function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalItems;
}

// Wyświetlenie koszyka w cart.html
function updateCart() {
  cartItems.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    const div = document.createElement("div");
    div.classList.add("cart-row");
    div.innerHTML = `
      <span>${item.name} - ${item.price} zł</span>
      <div class="quantity-controls">
        <button onclick="changeQuantity(${index}, -1)">-</button>
        <span>${item.quantity}</span>
        <button onclick="changeQuantity(${index}, 1)">+</button>
        <button onclick="removeItem(${index})">🗑️</button>
      </div>
    `;
    cartItems.appendChild(div);
    total += item.price * item.quantity;
  });

  cartTotal.innerHTML = `<strong>Razem: ${total} zł</strong>`;

  // zawsze synchronizujemy licznik w pasku
  updateCartCount();
}

// Zmiana ilości produktu
function changeQuantity(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  saveCart();
}

// Usuwanie produktu
function removeItem(index) {
  cart.splice(index, 1);
  saveCart();
}

// Obsługa formularza zamówienia
const orderForm = document.getElementById("orderForm");
if (orderForm) {
  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (cart.length === 0) {
      alert("Koszyk jest pusty!");
      return;
    }

    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const comment = document.getElementById("comment").value;
    const payment = document.querySelector("input[name='payment']:checked").value;

    const order = {
      email,
      phone,
      comment,
      payment,
      products: cart
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order)
      });

      if (res.ok) {
        document.getElementById("orderMessage").innerHTML = "<p style='color:green'>Zamówienie złożone! Dostaniesz maila z potwierdzeniem.</p>";
        cart = [];
        saveCart();
      } else {
        document.getElementById("orderMessage").innerHTML = "<p style='color:red'>Błąd składania zamówienia.</p>";
      }
    } catch (err) {
      console.error(err);
      document.getElementById("orderMessage").innerHTML = "<p style='color:red'>Błąd połączenia z serwerem.</p>";
    }
  });
}

// Inicjalizacja przy załadowaniu strony
window.addEventListener("DOMContentLoaded", () => {
  updateCart();
  updateCartCount();
});
