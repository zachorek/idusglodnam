const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      req.fileValidationError = 'Dozwolone są tylko pliki graficzne';
      return cb(null, false);
    }
    cb(null, true);
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Połączenie z MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Połączono z MongoDB'))
  .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));

// MODELE
const ALL_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';

function normalizeAvailabilityDayArray(raw) {
  if (raw === undefined || raw === null) {
    return [];
  }

  const collect = (value) => {
    if (Array.isArray(value)) {
      return value.flatMap(collect);
    }
    if (value === undefined || value === null) {
      return [];
    }
    const str = String(value).trim();
    if (!str) {
      return [];
    }
    if (/^(all|daily|codziennie)$/i.test(str)) {
      return ALL_DAY_INDICES;
    }
    const num = Number(str);
    if (Number.isInteger(num)) {
      return [num];
    }
    return [];
  };

  return Array.from(new Set(collect(raw).filter((num) => num >= 0 && num <= 6))).sort((a, b) => a - b);
}

function normalizeAvailabilityDaysInput(raw) {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (Array.isArray(raw)) {
    return normalizeAvailabilityDayArray(raw);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeAvailabilityDayArray(parsed);
      }
    } catch (err) {
      // ignore parse errors and fallback to comma separation
    }
    if (/^(all|daily|codziennie)$/i.test(trimmed)) {
      return ALL_DAY_INDICES;
    }
    return normalizeAvailabilityDayArray(trimmed.split(','));
  }

  return normalizeAvailabilityDayArray([raw]);
}

const Product = mongoose.model('Product', new mongoose.Schema({
  name: String,
  price: Number,
  desc: String,
  category: { type: String, required: true },
  imageData: String,
  imageUrl: String,
  availabilityDays: {
    type: [Number],
    default: [],
    set: normalizeAvailabilityDayArray
  }
}));

const Category = mongoose.model('Category', new mongoose.Schema({
  name: { type: String, required: true },
  order: { type: Number, default: 0 }
}));

const daysOfWeek = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

const availabilityEntrySchema = new mongoose.Schema({
  product: { type: String, default: '' },
  availableFrom: { type: String, default: '' }
}, { _id: false });

const availabilitySchema = new mongoose.Schema({
  dayIndex: { type: Number, required: true, min: 0, max: 6, unique: true },
  entries: { type: [availabilityEntrySchema], default: [] }
}, { timestamps: { createdAt: false, updatedAt: true } });

const Availability = mongoose.model('Availability', availabilitySchema);

const discountCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  percent: { type: Number, required: true, min: 0, max: 100 },
  createdAt: { type: Date, default: Date.now }
});

const DiscountCode = mongoose.model('DiscountCode', discountCodeSchema);

const aboutGalleryItemSchema = new mongoose.Schema({
  imageData: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const AboutContent = mongoose.model('AboutContent', new mongoose.Schema({
  heroImageData: String,
  heroText: { type: String, default: '' },
  gallery: { type: [aboutGalleryItemSchema], default: [] }
}, { timestamps: true }));

// Per-product per-day stock (capacity and reserved)
const productStockSchema = new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  dayIndex: { type: Number, required: true, min: 0, max: 6, index: true },
  capacity: { type: Number, required: true, min: 0, default: 0 },
  reserved: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });
productStockSchema.index({ productId: 1, dayIndex: 1 }, { unique: true });
const ProductStock = mongoose.model('ProductStock', productStockSchema);

// In-memory caches for frequently accessed collections
let cachedProducts = null;
let cachedProductsFetchedAt = 0;
let cachedCategories = null;
let cachedCategoriesFetchedAt = 0;
const CACHE_TTL_MS = 30 * 1000;

function getCachedValue(cacheRef, timestampRef) {
  if (!cacheRef) {
    return null;
  }
  if (Date.now() - timestampRef > CACHE_TTL_MS) {
    return null;
  }
  return cacheRef;
}

function setProductsCache(data) {
  cachedProducts = data;
  cachedProductsFetchedAt = Date.now();
}

function setCategoriesCache(data) {
  cachedCategories = data;
  cachedCategoriesFetchedAt = Date.now();
}

function invalidateProductsCache() {
  cachedProducts = null;
  cachedProductsFetchedAt = 0;
}

function invalidateCategoriesCache() {
  cachedCategories = null;
  cachedCategoriesFetchedAt = 0;
}

// API ENDPOINTY

// Pobierz wszystkie produkty
app.get('/api/products', async (req, res) => {
  try {
    const cached = getCachedValue(cachedProducts, cachedProductsFetchedAt);
    if (cached) {
      return res.json(cached);
    }

    const products = await Product.find().lean();
    setProductsCache(products);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania produktów' });
  }
});

app.get('/api/about', async (req, res) => {
  try {
    const about = await AboutContent.findOne().lean();
    const payload = {
      heroImageData: about && about.heroImageData ? about.heroImageData : '',
      heroText: about && about.heroText ? about.heroText : DEFAULT_ABOUT_TEXT,
      gallery: about && Array.isArray(about.gallery) ? about.gallery : []
    };
    if (!about) {
      payload.gallery = [];
    }
    res.json(payload);
  } catch (err) {
    console.error('Błąd pobierania sekcji O nas:', err);
    res.status(500).json({ error: 'Błąd pobierania sekcji O nas' });
  }
});

// STOCK API
// Remaining stock for all products on a given day
app.get('/api/stock/:dayIndex', async (req, res) => {
  const dayIndex = Number(req.params.dayIndex);
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return res.status(400).json({ error: 'Nieprawidłowy dzień tygodnia' });
  }
  try {
    const [products, stock] = await Promise.all([
      Product.find().lean(),
      ProductStock.find({ dayIndex }).lean()
    ]);
    const stockMap = new Map(stock.map((s) => [String(s.productId), s]));
    const result = products.map((p) => {
      const s = stockMap.get(String(p._id));
      const remaining = s ? Math.max(0, Number(s.capacity) - Number(s.reserved)) : 0;
      return { productId: String(p._id), name: p.name, remaining };
    });
    res.json(result);
  } catch (err) {
    console.error('Błąd pobierania stanów magazynowych:', err);
    res.status(500).json({ error: 'Błąd pobierania stanów magazynowych' });
  }
});

// Products available on a specific day
app.get('/api/products/day/:dayIndex', async (req, res) => {
  const dayIndex = Number(req.params.dayIndex);
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return res.status(400).json({ error: 'Nieprawidłowy dzień tygodnia' });
  }
  try {
    const [products, stock] = await Promise.all([
      Product.find().lean(),
      ProductStock.find({ dayIndex }).lean()
    ]);

    const stockMap = new Map(stock.map((s) => [String(s.productId), s]));

    // Filter products that have stock available on this day
    const availableProducts = products.filter((product) => {
      const stockInfo = stockMap.get(String(product._id));
      if (!stockInfo) return false;
      const remaining = Math.max(0, Number(stockInfo.capacity) - Number(stockInfo.reserved));
      return remaining > 0;
    });

    res.json(availableProducts);
  } catch (err) {
    console.error('Błąd pobierania produktów na dzień:', err);
    res.status(500).json({ error: 'Błąd pobierania produktów na dzień' });
  }
});

// Upsert capacities in bulk: [{ productId, dayIndex, capacity }]
app.put('/api/stock', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const normalized = items
    .map((item) => ({
      productId: item && item.productId ? String(item.productId) : '',
      dayIndex: Number(item && item.dayIndex),
      capacity: Math.max(0, Number(item && item.capacity))
    }))
    .filter((i) => i.productId && Number.isInteger(i.dayIndex) && i.dayIndex >= 0 && i.dayIndex <= 6 && Number.isFinite(i.capacity));

  if (!normalized.length) {
    return res.status(400).json({ error: 'Brak danych do zapisania' });
  }

  try {
    const ops = normalized.map((i) => ({
      updateOne: {
        filter: { productId: i.productId, dayIndex: i.dayIndex },
        update: { $set: { capacity: i.capacity }, $setOnInsert: { reserved: 0 } },
        upsert: true
      }
    }));
    if (ops.length) {
      await ProductStock.bulkWrite(ops, { ordered: false });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Błąd zapisu stanów magazynowych:', err);
    res.status(500).json({ error: 'Błąd zapisu stanów magazynowych' });
  }
});

// Stock overview for all products and days
app.get('/api/stock/overview', async (req, res) => {
  try {
    const [products, stock] = await Promise.all([
      Product.find().lean(),
      ProductStock.find().lean()
    ]);

    const stockMap = new Map();
    stock.forEach(s => {
      const key = `${s.productId}-${s.dayIndex}`;
      stockMap.set(key, s.capacity);
    });

    const overview = products.map(product => {
      const stock = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const key = `${product._id}-${dayIndex}`;
        stock.push(stockMap.get(key) || 0);
      }
      return {
        name: product.name,
        stock: stock
      };
    });

    res.json(overview);
  } catch (err) {
    console.error('Błąd pobierania przeglądu stanów:', err);
    res.status(500).json({ error: 'Błąd pobierania przeglądu stanów' });
  }
});

// Get per-day capacities for a product
app.get('/api/stock/capacity/:productId', async (req, res) => {
  const productId = String(req.params.productId || '');
  if (!productId) return res.status(400).json({ error: 'Brak identyfikatora produktu' });
  try {
    const docs = await ProductStock.find({ productId }).lean();
    const byDay = new Map(docs.map((d) => [Number(d.dayIndex), d]));
    const result = Array.from({ length: 7 }).map((_, dayIndex) => {
      const d = byDay.get(dayIndex);
      return { dayIndex, capacity: d ? Number(d.capacity) : 0, reserved: d ? Number(d.reserved) : 0 };
    });
    res.json(result);
  } catch (err) {
    console.error('Błąd pobierania pojemności produktu:', err);
    res.status(500).json({ error: 'Błąd pobierania pojemności produktu' });
  }
});

// Dodaj nowy produkt
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, price, desc, category } = req.body;
    const availabilityDays = normalizeAvailabilityDaysInput(req.body.availabilityDays);

    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Zdjęcie produktu jest wymagane' });
    }

    if (!name || !desc || !category) {
      return res.status(400).json({ error: 'Wszystkie pola produktu są wymagane' });
    }

    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice)) {
      return res.status(400).json({ error: 'Nieprawidłowa cena' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const imageData = `data:${req.file.mimetype};base64,${base64Image}`;

    const product = new Product({
      name: name ? name.trim() : name,
      price: numericPrice,
      desc: desc ? desc.trim() : desc,
      category,
      imageData,
      availabilityDays
    });

    await product.save();
    invalidateProductsCache();
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd dodawania produktu' });
  }
});

app.post('/api/about', upload.single('aboutImage'), async (req, res) => {
  try {
    const text = typeof req.body.aboutText === 'string' ? req.body.aboutText.trim() : '';
    const update = {};

    if (text) {
      update.heroText = text;
    }

    if (req.file) {
      const base64Image = req.file.buffer.toString('base64');
      update.heroImageData = `data:${req.file.mimetype};base64,${base64Image}`;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Brak danych do zapisania' });
    }

    const about = await AboutContent.findOneAndUpdate({}, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    const payload = {
      heroImageData: about && about.heroImageData ? about.heroImageData : '',
      heroText: about && about.heroText ? about.heroText : DEFAULT_ABOUT_TEXT,
      gallery: about && Array.isArray(about.gallery) ? about.gallery : []
    };
    res.json(payload);
  } catch (err) {
    console.error('Błąd zapisu sekcji O nas:', err);
    res.status(500).json({ error: 'Nie udało się zapisać sekcji O nas' });
  }
});

app.post('/api/about/gallery', upload.single('galleryImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Brak zdjęcia do zapisania' });
    }
    const base64Image = req.file.buffer.toString('base64');
    const imageData = `data:${req.file.mimetype};base64,${base64Image}`;
    const about = await AboutContent.findOneAndUpdate(
      {},
      { $push: { gallery: { imageData, createdAt: new Date() } } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ gallery: about && Array.isArray(about.gallery) ? about.gallery : [] });
  } catch (err) {
    console.error('Błąd dodawania zdjęcia do galerii:', err);
    res.status(500).json({ error: 'Nie udało się dodać zdjęcia do galerii' });
  }
});

app.delete('/api/about/gallery/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    if (!imageId) {
      return res.status(400).json({ error: 'Brak identyfikatora zdjęcia' });
    }
    const about = await AboutContent.findOne();
    if (!about) {
      return res.status(404).json({ error: 'Galeria jest pusta' });
    }
    const item = about.gallery.id(imageId);
    if (!item) {
      return res.status(404).json({ error: 'Nie znaleziono zdjęcia w galerii' });
    }
    item.deleteOne();
    await about.save();
    res.json({ gallery: about.gallery });
  } catch (err) {
    console.error('Błąd usuwania zdjęcia z galerii:', err);
    res.status(500).json({ error: 'Nie udało się usunąć zdjęcia z galerii' });
  }
});

// Pobierz wszystkie kategorie
app.get('/api/categories', async (req, res) => {
  try {
    const cached = getCachedValue(cachedCategories, cachedCategoriesFetchedAt);
    if (cached) {
      return res.json(cached);
    }

    const categories = await Category.find().sort({ order: 1, name: 1 }).lean();
    setCategoriesCache(categories);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania kategorii' });
  }
});

// Dodaj kategorię
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    const lastCategory = await Category.findOne({ order: { $ne: null } }).sort({ order: -1 });
    const nextOrder = lastCategory && typeof lastCategory.order === 'number' ? lastCategory.order + 1 : 0;
    const category = new Category({ name, order: nextOrder });
    await category.save();
    invalidateCategoriesCache();
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: 'Błąd dodawania kategorii' });
  }
});

// Usuń kategorię
app.delete('/api/categories/:id', async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    invalidateCategoriesCache();
    res.json({ message: 'Kategoria usunięta' });
  } catch (err) {
    res.status(500).json({ error: 'Błąd usuwania kategorii' });
  }
});

app.put('/api/categories/reorder', async (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Nieprawidłowy format kolejności kategorii' });
  }

  try {
    const bulkOps = order.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } }
      }
    }));

    if (bulkOps.length) {
      await Category.bulkWrite(bulkOps);
    }

    const categories = await Category.find().sort({ order: 1, name: 1 }).lean();
    setCategoriesCache(categories);
    res.json(categories);
  } catch (err) {
    console.error('Błąd zmiany kolejności kategorii:', err);
    res.status(500).json({ error: 'Błąd zmiany kolejności kategorii' });
  }
});

app.get('/api/availability', async (req, res) => {
  try {
    const records = await Availability.find().lean();
    const mapped = new Map(records.map((record) => [record.dayIndex, record]));
    const schedule = daysOfWeek.map((dayName, dayIndex) => {
      const record = mapped.get(dayIndex) || {};
      return {
        dayIndex,
        dayName,
        entries: Array.isArray(record.entries)
          ? record.entries.map((entry) => ({
              product: entry && typeof entry.product === 'string' ? entry.product : '',
              availableFrom: entry && typeof entry.availableFrom === 'string' ? entry.availableFrom : ''
            }))
          : [],
        updatedAt: record.updatedAt || null
      };
    });

    res.json(schedule);
  } catch (err) {
    console.error('Błąd pobierania dostępności:', err);
    res.status(500).json({ error: 'Błąd pobierania dostępności' });
  }
});

app.put('/api/availability/:dayIndex', async (req, res) => {
  const dayIndex = Number(req.params.dayIndex);
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return res.status(400).json({ error: 'Nieprawidłowy dzień tygodnia' });
  }

  const rawDetails = typeof req.body.details === 'string' ? req.body.details : '';
  const rawTime = typeof req.body.time === 'string' ? req.body.time : '';
  const rawEntries = Array.isArray(req.body.entries) ? req.body.entries : [];

  const details = rawDetails.trim().slice(0, 800);
  const time = rawTime.trim().slice(0, 120);
  const entries = rawEntries
    .slice(0, 20)
    .map((entry) => {
      const product = entry && typeof entry.product === 'string' ? entry.product.trim().slice(0, 200) : '';
      const availableFrom = entry && typeof entry.availableFrom === 'string' ? entry.availableFrom.trim().slice(0, 80) : '';
      return { product, availableFrom };
    })
    .filter((entry) => entry.product || entry.availableFrom);

  try {
    const updated = await Availability.findOneAndUpdate(
      { dayIndex },
      {
        dayIndex,
        entries
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      dayIndex: updated.dayIndex,
      dayName: daysOfWeek[updated.dayIndex],
      entries: Array.isArray(updated.entries)
        ? updated.entries.map((entry) => ({
            product: entry && typeof entry.product === 'string' ? entry.product : '',
            availableFrom: entry && typeof entry.availableFrom === 'string' ? entry.availableFrom : ''
          }))
        : [],
      updatedAt: updated.updatedAt
    });
  } catch (err) {
    console.error('Błąd zapisu dostępności:', err);
    res.status(500).json({ error: 'Błąd zapisu dostępności' });
  }
});

app.get('/api/discount-codes', async (req, res) => {
  try {
    const codes = await DiscountCode.find().sort({ code: 1 }).lean();
    res.json(codes);
  } catch (err) {
    console.error('Błąd pobierania kodów rabatowych:', err);
    res.status(500).json({ error: 'Błąd pobierania kodów rabatowych' });
  }
});

app.post('/api/discount-codes', async (req, res) => {
  try {
    const rawCode = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const rawPercent = Number(req.body.percent);

    if (!rawCode || rawCode.length > 40) {
      return res.status(400).json({ error: 'Kod rabatowy jest wymagany' });
    }

    if (!Number.isFinite(rawPercent) || rawPercent <= 0 || rawPercent > 100) {
      return res.status(400).json({ error: 'Procent rabatu musi być z zakresu 1-100' });
    }

    const existing = await DiscountCode.findOne({ code: rawCode });
    if (existing) {
      return res.status(409).json({ error: 'Taki kod rabatowy już istnieje' });
    }

    const code = await DiscountCode.create({ code: rawCode, percent: rawPercent });
    res.json(code);
  } catch (err) {
    console.error('Błąd zapisu kodu rabatowego:', err);
    res.status(500).json({ error: 'Błąd zapisu kodu rabatowego' });
  }
});

app.delete('/api/discount-codes/:id', async (req, res) => {
  try {
    await DiscountCode.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Błąd usuwania kodu rabatowego:', err);
    res.status(500).json({ error: 'Błąd usuwania kodu rabatowego' });
  }
});

// -------------------------
// Obsługa ładnych ścieżek
// -------------------------

// Strona główna
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ścieżki bez .html
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, 'public', `${page}.html`);
  res.sendFile(filePath, err => {
    if (err) next(); // jeśli pliku nie ma → przekazuje do dalszej obsługi
  });
});

const Order = mongoose.model("Order", new mongoose.Schema({
  email: String,
  phone: String,
  comment: String,
  payment: String,
  products: [
    {
      id: String,
      name: String,
      price: Number,
      quantity: Number
    }
  ],
  discountCode: { type: String, default: '' },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalBeforeDiscount: { type: Number, default: 0 },
  totalAfterDiscount: { type: Number, default: 0 },
  pickupDayIndex: { type: Number, min: 0, max: 6 },
  createdAt: { type: Date, default: Date.now }
}));

app.post("/api/orders", async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const pickupDayIndex = Number(req.body.pickupDayIndex);
    if (!Number.isInteger(pickupDayIndex) || pickupDayIndex < 0 || pickupDayIndex > 6) {
      return res.status(400).json({ error: 'Wybierz dzień odbioru (0-6).' });
    }

    const normalizedProducts = products
      .map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: Number(product.quantity)
      }))
      .filter((product) => product.name && Number.isFinite(product.price) && Number.isFinite(product.quantity) && product.quantity > 0);

    const totalBeforeDiscount = Number(normalizedProducts.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));

    const submittedCode = typeof req.body.discountCode === 'string' ? req.body.discountCode.trim().toUpperCase() : '';
    let discountPercent = 0;
    let discountCode = '';

    if (submittedCode) {
      const codeRecord = await DiscountCode.findOne({ code: submittedCode }).lean();
      if (!codeRecord) {
        return res.status(400).json({ error: 'Nieprawidłowy kod rabatowy' });
      }
      discountPercent = Number(codeRecord.percent) || 0;
      discountCode = codeRecord.code;
    }

    const discountAmount = Number((totalBeforeDiscount * discountPercent / 100).toFixed(2));
    const totalAfterDiscount = Math.max(0, Number((totalBeforeDiscount - discountAmount).toFixed(2)));

    // Reserve stock atomically for the selected day
    const insufficient = [];
    for (const item of normalizedProducts) {
      const productId = String(item.id || '');
      const qty = Number(item.quantity) || 0;
      if (!productId || qty <= 0) continue;
      const updated = await ProductStock.findOneAndUpdate(
        { productId, dayIndex: pickupDayIndex, $expr: { $lte: [ { $add: ['$reserved', qty] }, '$capacity' ] } },
        { $inc: { reserved: qty } },
        { new: true }
      );
      if (!updated) {
        insufficient.push(item.name || productId);
      }
    }

    if (insufficient.length) {
      return res.status(400).json({ error: `Brak wystarczającej ilości: ${insufficient.join(', ')} na wybrany dzień.` });
    }

    const order = new Order({
      email: typeof req.body.email === 'string' ? req.body.email : '',
      phone: typeof req.body.phone === 'string' ? req.body.phone : '',
      comment: typeof req.body.comment === 'string' ? req.body.comment : '',
      payment: typeof req.body.payment === 'string' ? req.body.payment : '',
      products: normalizedProducts,
      pickupDayIndex,
      discountCode,
      discountPercent,
      discountAmount,
      totalBeforeDiscount,
      totalAfterDiscount
    });

    await order.save();
    res.json({ message: "Zamówienie zapisane", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Błąd zapisu zamówienia" });
  }
});

// Usuń produkt
app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produkt nie istnieje' });
    }

    await product.deleteOne();
    invalidateProductsCache();
    res.json({ message: '✅ Produkt usunięty' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '❌ Błąd usuwania produktu' });
  }
});

app.post('/api/login-host', (req, res) => {
  const { password } = req.body;
  if (password === process.env.HOST_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Nieprawidłowe hasło" });
  }
});

// -------------------------

// Start serwera
app.listen(port, () => {
  console.log(`🚀 Serwer działa na http://localhost:${port}`);
});
