const productGrid = document.getElementById("productGrid");

// Koszyk klienta w sesji
let cart = JSON.parse(sessionStorage.getItem("cart")) || [];
const cartCount = document.getElementById("cartCount");

// Pobranie produktów z backendu
async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    const products = await res.json();

    productGrid.innerHTML = "";
    products.forEach(p => {
      const card = document.createElement("div");
      card.classList.add("product-card");
      card.innerHTML = `
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        <p><strong>${p.price} zł</strong></p>
        <button onclick="addToCart('${p._id}', ${p.price}, '${p.name}')">Dodaj do koszyka</button>
      `;
      productGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
  }
}

// Dodanie produktu do koszyka
function addToCart(id, price, name) {
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ id, price, name, quantity: 1 });
  }
  saveCart();
}

// Zapis i aktualizacja licznika koszyka
function saveCart() {
  sessionStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
}

// Aktualizacja licznika w pasku
function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalItems;
}

// Inicjalizacja przy załadowaniu strony
window.addEventListener("DOMContentLoaded", () => {
  fetchProducts();
  updateCartCount();
});
