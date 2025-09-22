let cart = [];
const productGrid = document.getElementById("productGrid");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");

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

function addToCart(id, price, name) {
  cart.push({ id, price, name });
  renderCart();
}

function renderCart() {
  cartItems.innerHTML = "";
  let total = 0;
  cart.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.name} - ${item.price} zł`;
    cartItems.appendChild(li);
    total += item.price;
  });
  cartTotal.innerHTML = `<strong>Razem: ${total} zł</strong>`;
}

// Pobierz produkty po załadowaniu strony
window.addEventListener('DOMContentLoaded', fetchProducts);
