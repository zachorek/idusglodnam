const hostForm = document.getElementById("hostForm");
const hostMessage = document.getElementById("hostMessage");
const productGrid = document.getElementById("productGrid");
const categoryForm = document.getElementById("categoryForm");
const categoryMessage = document.getElementById("categoryMessage");
const categoryList = document.getElementById("categoryList");
const categorySelect = document.getElementById("categorySelect");
const imageInput = document.getElementById("image");

let categoriesCache = [];

if (categoryList) {
  fetchCategories();
  categoryList.addEventListener("click", handleCategoryListClick);
}

if (productGrid) {
  fetchProducts();
}

if (categoryForm) {
  categoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("categoryName").value.trim();

    if (!name) {
      categoryMessage.innerHTML = '<p style=\"color:red\">Nazwa kategorii jest wymagana</p>';
      return;
    }

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (!res.ok) {
        throw new Error('Błąd odpowiedzi serwera');
      }

      const data = await res.json();
      categoryMessage.innerHTML = `<p style="color:green">Dodano kategorię "${data.name}"</p>`;
      categoryForm.reset();
      await fetchCategories();
    } catch (err) {
      console.error(err);
      categoryMessage.innerHTML = '<p style="color:red">Błąd dodawania kategorii</p>';
    }
  });
}

if (categorySelect) {
  populateCategorySelect();
}

if (hostForm) {
  hostForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const priceValue = document.getElementById("price").value;
    const desc = document.getElementById("desc").value.trim();
    const category = categorySelect ? categorySelect.value : '';
    const imageFile = imageInput && imageInput.files ? imageInput.files[0] : null;

    if (!imageFile) {
      hostMessage.innerHTML = '<p style="color:red">Dodaj zdjęcie produktu</p>';
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('price', priceValue);
    formData.append('desc', desc);
    formData.append('category', category);
    formData.append('image', imageFile);

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        body: formData
      });

      let data = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        data = null;
      }

      if (!res.ok) {
        const message = data && data.error ? data.error : 'Błąd dodawania produktu';
        throw new Error(message);
      }

      if (!data) {
        throw new Error('Nieoczekiwany błąd serwera');
      }

      hostMessage.innerHTML = `<p style="color:green">Produkt "${data.name}" został dodany!</p>`;
      hostForm.reset();
      if (imageInput) {
        imageInput.value = '';
      }
      if (productGrid) {
        fetchProducts();
      }
    } catch (err) {
      console.error(err);
      const message = err && err.message ? err.message : 'Błąd dodawania produktu';
      hostMessage.innerHTML = `<p style="color:red">${message}</p>`;
    }
  });
}


async function fetchCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    categoriesCache = await res.json();
    renderCategoryList();
    populateCategorySelect();
  } catch (err) {
    console.error('Błąd pobierania kategorii:', err);
    if (categoryMessage) {
      categoryMessage.innerHTML = '<p style="color:red">Nie udało się pobrać kategorii</p>';
    }
  }
}

function renderCategoryList() {
  if (!categoryList) {
    return;
  }

  categoryList.innerHTML = '';

  if (!categoriesCache.length) {
    categoryList.innerHTML = '<p>Brak kategorii</p>';
    return;
  }

  categoriesCache.forEach((category, index) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('category-item');
    wrapper.dataset.id = category._id;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = category.name;

    const actions = document.createElement('div');
    actions.classList.add('category-actions');

    const upBtn = document.createElement('button');
    upBtn.classList.add('move-up');
    upBtn.dataset.index = index;
    upBtn.textContent = '↑';
    if (index === 0) {
      upBtn.disabled = true;
    }

    const downBtn = document.createElement('button');
    downBtn.classList.add('move-down');
    downBtn.dataset.index = index;
    downBtn.textContent = '↓';
    if (index === categoriesCache.length - 1) {
      downBtn.disabled = true;
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-category');
    deleteBtn.dataset.id = category._id;
    deleteBtn.textContent = 'Usuń';

    actions.append(upBtn, downBtn, deleteBtn);
    wrapper.append(nameSpan, actions);
    categoryList.appendChild(wrapper);
  });
}

function populateCategorySelect() {
  if (!categorySelect) {
    return;
  }

  const previousValue = categorySelect.value;
  categorySelect.innerHTML = '<option value="">-- Wybierz kategorię --</option>';
  categoriesCache.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.name;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });

  if (previousValue) {
    categorySelect.value = previousValue;
    if (categorySelect.value !== previousValue) {
      categorySelect.value = '';
    }
  }
}

async function handleCategoryListClick(event) {
  const target = event.target;

  if (target.classList.contains('delete-category')) {
    const id = target.dataset.id;
    if (!id) {
      return;
    }

    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Błąd odpowiedzi serwera');
      }
      await fetchCategories();
    } catch (err) {
      console.error('Błąd usuwania kategorii:', err);
      if (categoryMessage) {
        categoryMessage.innerHTML = '<p style="color:red">Nie udało się usunąć kategorii</p>';
      }
    }
    return;
  }

  if (target.classList.contains('move-up') || target.classList.contains('move-down')) {
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }

    const direction = target.classList.contains('move-up') ? -1 : 1;
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= categoriesCache.length) {
      return;
    }

    await reorderCategories(index, newIndex);
  }
}

async function reorderCategories(currentIndex, newIndex) {
  const updated = categoriesCache.slice();
  const [moved] = updated.splice(currentIndex, 1);
  updated.splice(newIndex, 0, moved);

  try {
    const res = await fetch('/api/categories/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: updated.map((category) => category._id) })
    });

    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    categoriesCache = await res.json();
    renderCategoryList();
    populateCategorySelect();
  } catch (err) {
    console.error('Błąd zmiany kolejności kategorii:', err);
    if (categoryMessage) {
      categoryMessage.innerHTML = '<p style="color:red">Nie udało się zmienić kolejności kategorii</p>';
    }
  }
}

async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    const products = await res.json();

    if (!productGrid) {
      return;
    }

    productGrid.innerHTML = '';
    products.forEach((product) => {
      const imageSrc = product.imageData || product.imageUrl;
      const card = document.createElement('div');
      card.classList.add('product-card');
      card.innerHTML = `
        ${imageSrc ? `<img src="${imageSrc}" alt="${product.name}" class="product-thumb">` : ''}
        <div class="product-info">
          <h3>${product.name}</h3>
          <p>${product.desc}</p>
          <p><strong>${product.price} zł</strong></p>
          <p>Kategoria: <em>${product.category}</em></p>
          <button class="delete-btn" data-id="${product._id}">Usuń</button>
        </div>
      `;
      productGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
  }
}

// Obsługa usuwania produktu
document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!target.classList.contains('delete-btn')) {
    return;
  }

  const id = target.getAttribute('data-id');
  if (!id) {
    return;
  }

  if (!confirm('Na pewno chcesz usunąć ten produkt?')) {
    return;
  }

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    fetchProducts();
  } catch (err) {
    alert('❌ Błąd podczas usuwania produktu');
    console.error(err);
  }
});
