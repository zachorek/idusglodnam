const hostForm = document.getElementById("hostForm");
const hostMessage = document.getElementById("hostMessage");
const productGrid = document.getElementById("productGrid");
if (productGrid) {
  fetchProducts();
}

hostForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const price = parseFloat(document.getElementById("price").value);
  const desc = document.getElementById("desc").value;

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, desc })
    });

    const data = await res.json();
    hostMessage.innerHTML = `<p style="color:green">Produkt "${data.name}" został dodany!</p>`;
    hostForm.reset();
  } catch (err) {
    console.error(err);
    hostMessage.innerHTML = `<p style="color:red">Błąd dodawania produktu</p>`;
  }
});

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
        <button class="delete-btn" data-id="${p._id}">Usuń</button>
      `;
      productGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
  }
}
// Obsługa usuwania produktu
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('delete-btn')) {
    const id = e.target.getAttribute('data-id');

    if (confirm('Na pewno chcesz usunąć ten produkt?')) {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        fetchProducts(); // odśwież listę
      } else {
        alert('❌ Błąd podczas usuwania produktu');
      }
    }
  }
});