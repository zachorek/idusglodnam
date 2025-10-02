const productGrid = document.getElementById('productGrid');
if (productGrid) {
  productGrid.classList.remove('product-grid');
  productGrid.classList.add('category-container');
}

let cart = JSON.parse(sessionStorage.getItem('cart')) || [];
const cartCount = document.getElementById('cartCount');

async function fetchProducts() {
  if (!productGrid) {
    return;
  }

  try {
    const [categoriesRes, productsRes] = await Promise.all([
      fetch('/api/categories'),
      fetch('/api/products')
    ]);

    if (!categoriesRes.ok || !productsRes.ok) {
      throw new Error('Błąd odpowiedzi serwera');
    }

    const categories = await categoriesRes.json();
    const products = await productsRes.json();

    renderProductsByCategory(categories, products);
  } catch (err) {
    console.error('Błąd pobierania produktów:', err);
    productGrid.innerHTML = '<p class="error-message">Nie udało się załadować produktów.</p>';
  }
}

function renderProductsByCategory(categories, products) {
  if (!productGrid) {
    return;
  }

  productGrid.innerHTML = '';

  const categorized = new Map();
  categories.forEach((category) => {
    categorized.set(category.name, []);
  });

  const uncategorized = [];

  products.forEach((product) => {
    const bucket = categorized.get(product.category);
    if (bucket) {
      bucket.push(product);
    } else {
      uncategorized.push(product);
    }
  });

  categories.forEach((category) => {
    const items = categorized.get(category.name) || [];
    if (!items.length) {
      return;
    }
    productGrid.appendChild(createCategorySection(category.name, items));
  });

  if (uncategorized.length) {
    productGrid.appendChild(createCategorySection('Pozostałe', uncategorized));
  }

  if (!productGrid.children.length) {
    productGrid.innerHTML = '<p class="empty-state">Brak produktów do wyświetlenia.</p>';
  }
}

function createCategorySection(title, items) {
  const section = document.createElement('section');
  section.classList.add('category-group');

  const heading = document.createElement('h3');
  heading.classList.add('category-title');
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement('div');
  list.classList.add('category-products');

  items.forEach((product) => {
    list.appendChild(createProductCard(product));
  });

  section.appendChild(list);
  return section;
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.classList.add('product-card');

  const title = document.createElement('h3');
  title.textContent = product.name;

  const desc = document.createElement('p');
  desc.textContent = product.desc;

  const price = document.createElement('p');
  price.innerHTML = `<strong>${product.price} zł</strong>`;

  const button = document.createElement('button');
  button.textContent = 'Dodaj do koszyka';
  button.addEventListener('click', () => addToCart(product._id, product.price, product.name));

  card.append(title, desc, price, button);
  return card;
}

function addToCart(id, price, name) {
  const existing = cart.find((item) => item.id === id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id, price, name, quantity: 1 });
  }
  saveCart();
}

function saveCart() {
  sessionStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) {
    cartCount.textContent = totalItems;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (productGrid) {
    fetchProducts();
  }
  updateCartCount();
});
