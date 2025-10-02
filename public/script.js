const productGrid = document.getElementById('productGrid');
const productModal = document.getElementById('productModal');
const productModalBody = document.getElementById('productModalBody');
const productModalClose = productModal ? productModal.querySelector('.modal-close') : null;

let lastFocusedElement = null;

if (productGrid) {
  productGrid.classList.remove('product-grid');
  productGrid.classList.add('category-container');
}

if (productModalClose) {
  productModalClose.addEventListener('click', closeProductModal);
}

if (productModal) {
  productModal.addEventListener('click', (event) => {
    if (event.target === productModal) {
      closeProductModal();
    }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && productModal && productModal.classList.contains('open')) {
      closeProductModal();
    }
  });
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
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Zobacz szczegóły produktu ${product.name || ''}`);

  const imageSrc = product.imageData || product.imageUrl;
  if (imageSrc) {
    const image = document.createElement('img');
    image.src = imageSrc;
    image.alt = product.name || '';
    image.classList.add('product-thumb');
    card.appendChild(image);
  }

  const content = document.createElement('div');
  content.classList.add('product-info');

  const title = document.createElement('h3');
  title.textContent = product.name;

  const desc = document.createElement('p');
  const descText = (product.desc || '').trim();
  const previewLimit = 160;
  let previewText = descText;
  let truncated = false;

  if (descText.length > previewLimit) {
    const slice = descText.slice(0, previewLimit);
    const lastSpace = slice.lastIndexOf(' ');
    previewText = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
    truncated = true;
  }

  desc.classList.add('product-desc');

  if (truncated) {
    desc.append(document.createTextNode(previewText + ' '));
    const more = document.createElement('span');
    more.classList.add('product-desc-more');
    more.textContent = '… więcej';
    desc.appendChild(more);
  } else {
    desc.textContent = previewText;
  }

  const price = document.createElement('p');
  price.innerHTML = `<strong>${product.price} zł</strong>`;

  const button = document.createElement('button');
  button.textContent = 'Dodaj do koszyka';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    addToCart(product._id, product.price, product.name);
  });

  content.append(title, desc, price, button);
  card.appendChild(content);

  card.addEventListener('click', () => openProductModal(product));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProductModal(product);
    }
  });

  return card;
}

function openProductModal(product) {
  if (!productModal || !productModalBody) {
    return;
  }

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  productModalBody.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.classList.add('modal-product');

  const imageSrc = product.imageData || product.imageUrl;
  if (imageSrc) {
    const image = document.createElement('img');
    image.src = imageSrc;
    image.alt = product.name || '';
    wrapper.appendChild(image);
  }

  const info = document.createElement('div');
  info.classList.add('modal-product-info');

  const title = document.createElement('h3');
  title.textContent = product.name;
  info.appendChild(title);

  if (product.desc) {
    const desc = document.createElement('p');
    desc.textContent = product.desc;
    info.appendChild(desc);
  }

  const price = document.createElement('p');
  price.innerHTML = `<strong>${product.price} zł</strong>`;
  info.appendChild(price);

  const button = document.createElement('button');
  button.textContent = 'Dodaj do koszyka';
  button.addEventListener('click', () => {
    addToCart(product._id, product.price, product.name);
    closeProductModal();
  });
  info.appendChild(button);

  wrapper.appendChild(info);
  productModalBody.appendChild(wrapper);

  productModal.classList.add('open');
  productModal.setAttribute('aria-hidden', 'false');

  if (productModalClose) {
    productModalClose.focus();
  }
}

function closeProductModal() {
  if (!productModal) {
    return;
  }

  if (!productModal.classList.contains('open')) {
    return;
  }

  if (productModalBody) {
    productModalBody.innerHTML = '';
  }

  productModal.classList.remove('open');
  productModal.setAttribute('aria-hidden', 'true');

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }

  lastFocusedElement = null;
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
