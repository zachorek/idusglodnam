// Host stock management functionality
const daySelect = document.getElementById('daySelect');
const productsStock = document.getElementById('productsStock');
const saveWeeklyStock = document.getElementById('saveWeeklyStock');
const dateSelect = document.getElementById('dateSelect');
const dateProductsStock = document.getElementById('dateProductsStock');
const saveDateStock = document.getElementById('saveDateStock');
const stockOverview = document.getElementById('stockOverview');

let products = [];
let currentDayIndex = 0;
let currentDate = null;

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  setupDatePicker();
  setupEventListeners();
});

function setupDatePicker() {
  if (dateSelect) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    flatpickr(dateSelect, {
      minDate: tomorrow,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d F Y",
      locale: "pl",
      onChange: function(selectedDates, dateStr, instance) {
        currentDate = selectedDates[0];
        if (currentDate) {
          loadDateStock(currentDate);
        }
      }
    });
  }
}

function setupEventListeners() {
  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      currentDayIndex = parseInt(e.target.value);
      loadDayStock(currentDayIndex);
    });
  }

  if (saveWeeklyStock) {
    saveWeeklyStock.addEventListener('click', saveWeeklyStockData);
  }

  if (saveDateStock) {
    saveDateStock.addEventListener('click', saveDateStockData);
  }
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Błąd pobierania produktów');
    products = await response.json();
    renderProductsStock(productsStock, products, currentDayIndex);
    loadStockOverview();
  } catch (error) {
    console.error('Błąd ładowania produktów:', error);
    showMessage('Błąd ładowania produktów', 'error');
  }
}

function renderProductsStock(container, products, dayIndex) {
  if (!container) return;

  container.innerHTML = '';

  products.forEach(product => {
    const productDiv = document.createElement('div');
    productDiv.className = 'product-stock-item';
    productDiv.innerHTML = `
      <div class="product-info">
        <span class="product-name">${product.name}</span>
        <span class="product-price">${product.price} zł</span>
      </div>
      <div class="stock-control">
        <label for="stock-${product._id}">Ilość:</label>
        <input type="number"
               id="stock-${product._id}"
               class="stock-input"
               min="0"
               value="0"
               data-product-id="${product._id}">
      </div>
    `;
    container.appendChild(productDiv);
  });
}

async function loadDayStock(dayIndex) {
  try {
    const response = await fetch(`/api/stock/${dayIndex}`);
    if (!response.ok) throw new Error('Błąd pobierania stanów');
    const stockData = await response.json();

    // Update input values with current stock
    stockData.forEach(item => {
      const input = document.querySelector(`#stock-${item.productId}`);
      if (input) {
        input.value = item.remaining;
      }
    });

    showMessage(`Załadowano stany dla ${DAYS_OF_WEEK[dayIndex]}`, 'success');
  } catch (error) {
    console.error('Błąd ładowania stanów:', error);
    showMessage('Błąd ładowania stanów', 'error');
  }
}

async function loadDateStock(date) {
  if (!date) return;

  try {
    const dayIndex = (date.getDay() + 6) % 7; // Convert to Monday=0 format
    const response = await fetch(`/api/stock/${dayIndex}`);
    if (!response.ok) throw new Error('Błąd pobierania stanów');
    const stockData = await response.json();

    // Render products for specific date
    renderProductsStock(dateProductsStock, products, dayIndex);

    // Update input values with current stock
    stockData.forEach(item => {
      const input = dateProductsStock.querySelector(`#stock-${item.productId}`);
      if (input) {
        input.value = item.remaining;
      }
    });

    showMessage(`Załadowano stany dla ${date.toLocaleDateString('pl-PL')}`, 'success');
  } catch (error) {
    console.error('Błąd ładowania stanów dla daty:', error);
    showMessage('Błąd ładowania stanów dla daty', 'error');
  }
}

async function saveWeeklyStockData() {
  try {
    const stockData = collectStockData(productsStock);
    const dayIndex = parseInt(daySelect.value);

    const response = await fetch('/api/stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockData.map(item => ({
        productId: item.productId,
        dayIndex: dayIndex,
        capacity: item.capacity
      })))
    });

    if (!response.ok) throw new Error('Błąd zapisywania stanów');

    showMessage(`Zapisano stany dla ${DAYS_OF_WEEK[dayIndex]}`, 'success');
    loadStockOverview();
  } catch (error) {
    console.error('Błąd zapisywania stanów:', error);
    showMessage('Błąd zapisywania stanów', 'error');
  }
}

async function saveDateStockData() {
  if (!currentDate) {
    showMessage('Wybierz datę', 'error');
    return;
  }

  try {
    const stockData = collectStockData(dateProductsStock);
    const dayIndex = (currentDate.getDay() + 6) % 7;

    const response = await fetch('/api/stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockData.map(item => ({
        productId: item.productId,
        dayIndex: dayIndex,
        capacity: item.capacity
      })))
    });

    if (!response.ok) throw new Error('Błąd zapisywania stanów');

    showMessage(`Zapisano stany dla ${currentDate.toLocaleDateString('pl-PL')}`, 'success');
    loadStockOverview();
  } catch (error) {
    console.error('Błąd zapisywania stanów:', error);
    showMessage('Błąd zapisywania stanów', 'error');
  }
}

function collectStockData(container) {
  const inputs = container.querySelectorAll('.stock-input');
  const stockData = [];

  inputs.forEach(input => {
    const productId = input.dataset.productId;
    const capacity = parseInt(input.value) || 0;

    if (productId) {
      stockData.push({ productId, capacity });
    }
  });

  return stockData;
}

async function loadStockOverview() {
  try {
    const response = await fetch('/api/stock/overview');
    if (!response.ok) throw new Error('Błąd pobierania przeglądu');
    const overview = await response.json();

    renderStockOverview(overview);
  } catch (error) {
    console.error('Błąd ładowania przeglądu:', error);
  }
}

function renderStockOverview(overview) {
  if (!stockOverview) return;

  stockOverview.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'stock-table';

  // Header
  const header = document.createElement('tr');
  header.innerHTML = `
    <th>Produkt</th>
    <th>Poniedziałek</th>
    <th>Wtorek</th>
    <th>Środa</th>
    <th>Czwartek</th>
    <th>Piątek</th>
    <th>Sobota</th>
    <th>Niedziela</th>
  `;
  table.appendChild(header);

  // Rows for each product
  overview.forEach(product => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="product-name">${product.name}</td>
      <td>${product.stock[0] || 0}</td>
      <td>${product.stock[1] || 0}</td>
      <td>${product.stock[2] || 0}</td>
      <td>${product.stock[3] || 0}</td>
      <td>${product.stock[4] || 0}</td>
      <td>${product.stock[5] || 0}</td>
      <td>${product.stock[6] || 0}</td>
    `;
    table.appendChild(row);
  });

  stockOverview.appendChild(table);
}

function showMessage(message, type) {
  // Create or update message element
  let messageEl = document.querySelector('.stock-message');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.className = 'stock-message';
    document.body.appendChild(messageEl);
  }

  messageEl.textContent = message;
  messageEl.className = `stock-message ${type}`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    if (messageEl) {
      messageEl.remove();
    }
  }, 3000);
}
