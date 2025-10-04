const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
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

// API ENDPOINTY

// Pobierz wszystkie produkty
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania produktów' });
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
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd dodawania produktu' });
  }
});

// Pobierz wszystkie kategorie
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1, name: 1 });
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
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: 'Błąd dodawania kategorii' });
  }
});

// Usuń kategorię
app.delete('/api/categories/:id', async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
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

    const categories = await Category.find().sort({ order: 1, name: 1 });
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
  createdAt: { type: Date, default: Date.now }
}));

app.post("/api/orders", async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];

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

    const order = new Order({
      email: typeof req.body.email === 'string' ? req.body.email : '',
      phone: typeof req.body.phone === 'string' ? req.body.phone : '',
      comment: typeof req.body.comment === 'string' ? req.body.comment : '',
      payment: typeof req.body.payment === 'string' ? req.body.payment : '',
      products: normalizedProducts,
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
