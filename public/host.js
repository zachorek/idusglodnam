const hostForm = document.getElementById("hostForm");
const hostMessage = document.getElementById("hostMessage");
const productGrid = document.getElementById("productGrid");
const categoryForm = document.getElementById("categoryForm");
const categoryMessage = document.getElementById("categoryMessage");
const categoryList = document.getElementById("categoryList");

if (categoryForm) {
  fetchCategories();
}

if (productGrid) {
  fetchProducts();
}

categoryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("categoryName").value;

  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await res.json();
    categoryMessage.innerHTML = `<p style="color:green">Dodano kategorię "${data.name}"</p>`;
    categoryForm.reset();
    fetchCategories();
  } catch (err) {
    console.error(err);
    categoryMessage.innerHTML = `<p style="color:red">Błąd dodawania kategorii</p>`;
  }
});

async function fetchCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();

    categoryList.innerHTML = "";
    categories.forEach(c => {
      const div = document.createElement("div");
      div.classList.add("category-item");
      div.innerHTML = `
        <span>${c.name}</span>
        <button class="delete-category" data-id="${c._id}">Usuń</button>
      `;
      categoryList.appendChild(div);
    });

    document.querySelectorAll(".delete-category").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        await fetch(`/api/categories/${id}`, { method: "DELETE" });
        fetchCategories();
      });
    });

  } catch (err) {
    console.error('Błąd pobierania kategorii:', err);
  }
}

async function loadCategoriesIntoSelect() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    const select = document.getElementById("categorySelect");

    select.innerHTML = `<option value="">-- Wybierz kategorię --</option>`;
    categories.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Błąd ładowania kategorii:", err);
  }
}

// uruchom po załadowaniu
if (document.getElementById("categorySelect")) {
  loadCategoriesIntoSelect();
}


hostForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const price = parseFloat(document.getElementById("price").value);
  const desc = document.getElementById("desc").value;
  const category = document.getElementById("categorySelect").value;

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, desc, category })
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
        <p>Kategoria: <em>${p.category}</em></p>
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