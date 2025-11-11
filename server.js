const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns');
const multer = require('multer');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const heicConvert = require('heic-convert');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const CLOUDFLARE_R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  || process.env.CLOUDFLARE_ACCESS_KEY_ID
  || process.env.R2_ACCESS_KEY_ID
  || '';
const CLOUDFLARE_R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  || process.env.CLOUDFLARE_SECRET_ACCESS_KEY
  || process.env.R2_SECRET_ACCESS_KEY
  || '';
const CLOUDFLARE_R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET
  || process.env.R2_BUCKET
  || process.env.CLOUDFLARE_BUCKET
  || '';
const CLOUDFLARE_R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  || process.env.CLOUDFLARE_ACCOUNT_ID
  || '';
const CLOUDFLARE_R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT
  || (CLOUDFLARE_R2_ACCOUNT_ID ? `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
const CLOUDFLARE_R2_PUBLIC_BASE_URL = (process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL
  || process.env.CLOUDFLARE_PUBLIC_BASE_URL
  || '').replace(/\/*$/, '');

const isCloudflareStorageConfigured = Boolean(
  CLOUDFLARE_R2_ACCESS_KEY_ID
  && CLOUDFLARE_R2_SECRET_ACCESS_KEY
  && CLOUDFLARE_R2_BUCKET
  && CLOUDFLARE_R2_ENDPOINT
  && CLOUDFLARE_R2_PUBLIC_BASE_URL
);

let cloudflareStorageClient = null;
if (isCloudflareStorageConfigured) {
  cloudflareStorageClient = new S3Client({
    region: 'auto',
    endpoint: CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY
    }
  });
} else {
  console.warn('⚠️ Cloudflare storage is not fully configured. Set CLOUDFLARE_R2_* environment variables to enable image uploads.');
}

const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif'
};

function guessFileExtension(mimetype) {
  if (!mimetype || typeof mimetype !== 'string') {
    return '';
  }
  const lower = mimetype.toLowerCase();
  if (MIME_EXTENSION_MAP[lower]) {
    return MIME_EXTENSION_MAP[lower];
  }
  const slashIndex = lower.lastIndexOf('/');
  if (slashIndex === -1) {
    return '';
  }
  const candidate = lower.slice(slashIndex + 1).replace(/[^a-z0-9]+/g, '');
  return candidate || '';
}

function buildCloudflareObjectKey(prefix, mimetype) {
  const normalizedPrefix = prefix
    ? String(prefix)
        .trim()
        .replace(/[^a-z0-9/_-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
    : '';
  const extension = guessFileExtension(mimetype);
  const uniqueComponent = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  const uniqueName = `${Date.now()}-${uniqueComponent}`;
  const prefixPath = normalizedPrefix ? `${normalizedPrefix.replace(/\/+$/, '')}/` : '';
  return `${prefixPath}${uniqueName}${extension ? `.${extension}` : ''}`;
}

function buildCloudflarePublicUrl(key) {
  if (!key || !CLOUDFLARE_R2_PUBLIC_BASE_URL) {
    return '';
  }
  const sanitizedKey = String(key).replace(/^\/+/, '');
  return `${CLOUDFLARE_R2_PUBLIC_BASE_URL}/${sanitizedKey}`;
}

function resolveKeyFromUrl(possibleUrl) {
  if (!possibleUrl || typeof possibleUrl !== 'string') {
    return null;
  }
  const trimmed = possibleUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) {
    return null;
  }
  if (!trimmed.includes('://')) {
    return trimmed.replace(/^\/+/, '');
  }
  const sanitizedBase = CLOUDFLARE_R2_PUBLIC_BASE_URL;
  if (sanitizedBase && trimmed.startsWith(`${sanitizedBase}/`)) {
    return trimmed.slice(sanitizedBase.length + 1);
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/^\/+/, '');
  } catch (err) {
    return null;
  }
}

async function uploadImageToCloudflare(buffer, mimetype, prefix) {
  if (!isCloudflareStorageConfigured || !cloudflareStorageClient) {
    throw new Error('Cloudflare storage is not configured.');
  }
  if (!buffer || !buffer.length) {
    throw new Error('Brak danych zdjęcia do przesłania.');
  }
  const key = buildCloudflareObjectKey(prefix, mimetype);
  const command = new PutObjectCommand({
    Bucket: CLOUDFLARE_R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype
  });
  await cloudflareStorageClient.send(command);
  return {
    key,
    url: buildCloudflarePublicUrl(key)
  };
}

async function deleteImageFromCloudflare(storedKeyOrUrl) {
  if (!isCloudflareStorageConfigured || !cloudflareStorageClient) {
    return;
  }
  const key = resolveKeyFromUrl(storedKeyOrUrl);
  if (!key) {
    return;
  }
  try {
    const command = new DeleteObjectCommand({
      Bucket: CLOUDFLARE_R2_BUCKET,
      Key: key
    });
    await cloudflareStorageClient.send(command);
  } catch (err) {
    console.error(`⚠️ Nie udało się usunąć pliku ${key} z Cloudflare:`, err);
  }
}

const HEIC_MIME_REGEX = /^image\/hei[cf]/i;

async function normalizeUploadedImage(file) {
  if (!file || !file.buffer) {
    throw new Error('Brak zdjęcia do zapisania.');
  }
  const mimetype = typeof file.mimetype === 'string' ? file.mimetype : '';
  if (HEIC_MIME_REGEX.test(mimetype)) {
    try {
      const convertedBuffer = await heicConvert({
        buffer: file.buffer,
        format: 'JPEG',
        quality: 1
      });
      return {
        buffer: Buffer.from(convertedBuffer),
        mimetype: 'image/jpeg'
      };
    } catch (err) {
      console.error('Błąd konwersji HEIC na JPEG:', err);
      throw new Error('Nie udało się przetworzyć zdjęcia HEIC. Spróbuj ponownie z JPG lub PNG.');
    }
  }
  return {
    buffer: file.buffer,
    mimetype: mimetype || 'application/octet-stream'
  };
}

async function uploadNormalizedImage(file, prefix) {
  const processed = await normalizeUploadedImage(file);
  return uploadImageToCloudflare(processed.buffer, processed.mimetype, prefix);
}

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

app.get('/', (req, res) => {
  res.redirect('/about');
});

app.use(express.static(path.join(__dirname, 'public')));

// Połączenie z MongoDB Atlas
const SHOULD_SKIP_MONGO = String(process.env.SKIP_MONGO || '').toLowerCase() === 'true'
  || process.env.NODE_ENV === 'test';

if (!SHOULD_SKIP_MONGO) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('✅ Połączono z MongoDB');
      purgeOldOrders();
      purgeOldOrderReports();
      startDailyOrderSummaryJob();
    })
    .catch((err) => console.error('❌ Błąd połączenia z MongoDB:', err));
} else {
  console.warn('ℹ️ Pominięto połączenie z MongoDB (tryb testowy lub SKIP_MONGO=true).');
}

// MODELE
const ALL_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_ABOUT_TEXT = 'Chachor Piecze to niewielki zespół piekarzy i cukierników, którzy robią codzienne wypieki w rytmie miasta.';
const DEFAULT_ACCESSIBILITY_TAGLINE = 'Sprawdź, co serwujemy w poszczególne dni tygodnia i kiedy możesz odebrać swoje wypieki.';

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

function isTruthy(value) {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

const Product = mongoose.model('Product', new mongoose.Schema({
  name: String,
  price: Number,
  desc: String,
  category: { type: String, required: true },
  imageData: String,
  imageUrl: String,
  imageKey: String,
  isBlocked: { type: Boolean, default: false },
  availabilityDays: {
    type: [Number],
    default: [],
    set: normalizeAvailabilityDayArray
  }
}));

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  order: { type: Number, default: 0 },
  tileImageData: { type: String, default: '' },
  tileImageUrl: { type: String, default: '' },
  tileImageKey: { type: String, default: '' },
  tileImageAlt: { type: String, default: '' }
});

const Category = mongoose.model('Category', CategorySchema);

const daysOfWeek = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

function formatDayList(dayIndices) {
  if (!Array.isArray(dayIndices) || !dayIndices.length) {
    return '';
  }
  return dayIndices
    .map((dayIndex) => (Number.isInteger(dayIndex) && daysOfWeek[dayIndex]) ? daysOfWeek[dayIndex] : `Dzień ${Number(dayIndex) + 1}`)
    .join(', ');
}

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
  imageData: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  imageKey: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const AboutContent = mongoose.model('AboutContent', new mongoose.Schema({
  heroImageData: String,
  heroImageUrl: { type: String, default: '' },
  heroImageKey: { type: String, default: '' },
  heroText: { type: String, default: '' },
  gallery: { type: [aboutGalleryItemSchema], default: [] }
}, { timestamps: true }));

const AccessibilityContent = mongoose.model('AccessibilityContent', new mongoose.Schema({
  heroImageData: { type: String, default: '' },
  heroImageUrl: { type: String, default: '' },
  heroImageKey: { type: String, default: '' }
}, { timestamps: true }));

const PICKUP_TIME_CACHE_TTL_MS = 5 * 60 * 1000;
const pickupTimeCache = new Map();

function invalidatePickupTimeCache(dayIndex) {
  if (Number.isInteger(dayIndex)) {
    pickupTimeCache.delete(dayIndex);
    return;
  }
  pickupTimeCache.clear();
}

function normalizePickupTimeString(value) {
  if (!value || (typeof value !== 'string' && typeof value !== 'number')) {
    return '';
  }
  const raw = String(value).trim();
  if (!raw) {
    return '';
  }
  const match = /^(\d{1,2})(?::(\d{1,2}))?$/u.exec(raw);
  if (!match) {
    return '';
  }
  const hour = Number(match[1]);
  const minute = match[2] !== undefined ? Number(match[2]) : 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return '';
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return '';
  }
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

async function fetchPickupReadyTimeForDay(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return '';
  }
  const cached = pickupTimeCache.get(dayIndex);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.value;
  }
  let value = '';
  try {
    const record = await Availability.findOne({ dayIndex }).lean();
    if (record && Array.isArray(record.entries)) {
      const times = record.entries
        .map((entry) => normalizePickupTimeString(entry && entry.availableFrom))
        .filter(Boolean)
        .sort();
      value = times.length ? times[0] : '';
    }
  } catch (err) {
    console.warn('Nie udało się pobrać godzin odbioru dla dnia', dayIndex, err);
  }
  pickupTimeCache.set(dayIndex, {
    value,
    expires: now + PICKUP_TIME_CACHE_TTL_MS
  });
  return value;
}

async function resolvePickupReadyTimeLabel(order) {
  if (!order) {
    return '';
  }
  let dayIndex = Number.isInteger(order.pickupDayIndex) ? order.pickupDayIndex : null;
  if (!Number.isInteger(dayIndex)) {
    dayIndex = getDayIndexFromDateString(order.pickupDate);
  }
  if (!Number.isInteger(dayIndex)) {
    return '';
  }
  const time = await fetchPickupReadyTimeForDay(dayIndex);
  return time ? `od ${time}` : '';
}

function parsePickupTimesInput(raw) {
  if (raw === undefined || raw === null) {
    return new Map();
  }
  let parsed = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return new Map();
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return new Map();
    }
  }
  const map = new Map();
  const assignValue = (dayIndexCandidate, value) => {
    const dayIndex = Number(dayIndexCandidate);
    const normalizedTime = normalizePickupTimeString(value);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6 || !normalizedTime) {
      return;
    }
    map.set(dayIndex, normalizedTime);
  };
  if (Array.isArray(parsed)) {
    parsed.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const dayKey = entry.dayIndex !== undefined ? entry.dayIndex : entry.day;
      const value = entry.availableFrom || entry.time || entry.value;
      assignValue(dayKey, value);
    });
  } else if (parsed && typeof parsed === 'object') {
    Object.entries(parsed).forEach(([key, value]) => {
      assignValue(key, value);
    });
  }
  return map;
}

function filterPickupTimesByAvailability(pickupTimesMap, availabilityDays) {
  if (!pickupTimesMap || pickupTimesMap.size === 0) {
    return new Map();
  }
  const allowedDays = Array.isArray(availabilityDays)
    ? availabilityDays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  if (!allowedDays.length) {
    return new Map();
  }
  const allowedSet = new Set(allowedDays);
  const filtered = new Map();
  pickupTimesMap.forEach((time, dayIndex) => {
    if (allowedSet.has(dayIndex)) {
      filtered.set(dayIndex, time);
    }
  });
  return filtered;
}

function validatePickupTimesForAvailability(availabilityDays, pickupTimesMap) {
  const normalizedAvailability = Array.isArray(availabilityDays)
    ? availabilityDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const availabilitySet = new Set(normalizedAvailability);
  const missingDays = [];
  const extraDays = [];

  if (!pickupTimesMap || pickupTimesMap.size === 0) {
    if (availabilitySet.size) {
      missingDays.push(...Array.from(availabilitySet.values()));
      return { valid: false, missingDays, extraDays };
    }
    return { valid: true, missingDays, extraDays };
  }

  availabilitySet.forEach((dayIndex) => {
    if (!pickupTimesMap.has(dayIndex)) {
      missingDays.push(dayIndex);
    }
  });

  pickupTimesMap.forEach((_, dayIndex) => {
    if (!availabilitySet.has(dayIndex)) {
      extraDays.push(dayIndex);
    }
  });

  return {
    valid: missingDays.length === 0 && extraDays.length === 0,
    missingDays,
    extraDays
  };
}

function buildPickupTimesValidationMessage(validationResult) {
  if (!validationResult || validationResult.valid) {
    return '';
  }
  const parts = [];
  if (validationResult.missingDays && validationResult.missingDays.length) {
    parts.push(`Brak godzin odbioru dla: ${formatDayList(validationResult.missingDays)}.`);
  }
  if (validationResult.extraDays && validationResult.extraDays.length) {
    parts.push(`Godziny odbioru można ustawić tylko w dniach dostępności. Usuń wpisy dla: ${formatDayList(validationResult.extraDays)}.`);
  }
  return parts.join(' ') || 'Nieprawidłowe godziny odbioru.';
}

async function upsertPickupTimesForProduct(productName, availabilityDays, pickupTimesMap) {
  if (!productName || !Array.isArray(availabilityDays) || !availabilityDays.length) {
    return;
  }
  if (!pickupTimesMap || pickupTimesMap.size === 0) {
    return;
  }
  const filtered = filterPickupTimesByAvailability(pickupTimesMap, availabilityDays);
  if (!filtered.size) {
    return;
  }
  for (const [dayIndex, availableFrom] of filtered.entries()) {
    await upsertSingleAvailabilityEntry(dayIndex, productName, availableFrom);
  }
}

async function upsertSingleAvailabilityEntry(dayIndex, productName, availableFrom) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6 || !productName || !availableFrom) {
    return;
  }
  const trimmedName = productName.trim();
  try {
    const record = await Availability.findOne({ dayIndex });
    if (!record) {
      await Availability.create({
        dayIndex,
        entries: [{ product: trimmedName, availableFrom }]
      });
      invalidatePickupTimeCache(dayIndex);
      return;
    }
    const entries = Array.isArray(record.entries) ? record.entries : [];
    const normalizedTarget = trimmedName.toLowerCase();
    const existingIndex = entries.findIndex((entry) => String(entry && entry.product || '').trim().toLowerCase() === normalizedTarget);
    if (existingIndex === -1) {
      entries.push({ product: trimmedName, availableFrom });
    } else {
      entries[existingIndex].product = trimmedName;
      entries[existingIndex].availableFrom = availableFrom;
    }
    record.entries = entries;
    await record.save();
    invalidatePickupTimeCache(dayIndex);
  } catch (err) {
    console.error(`Nie udało się zaktualizować godzin odbioru dla dnia ${dayIndex}:`, err);
  }
}

async function removeProductFromAvailability(productName) {
  if (!productName) {
    return;
  }
  const normalized = String(productName).trim().toLowerCase();
  if (!normalized) {
    return;
  }
  try {
    const records = await Availability.find();
    await Promise.all(records.map(async (record) => {
      if (!record || !Array.isArray(record.entries) || !record.entries.length) {
        return;
      }
      const filteredEntries = record.entries.filter((entry) => {
        const entryName = String(entry && entry.product ? entry.product : '').trim().toLowerCase();
        return entryName !== normalized;
      });
      if (filteredEntries.length === record.entries.length) {
        return;
      }
      record.entries = filteredEntries;
      await record.save();
      invalidatePickupTimeCache(record.dayIndex);
    }));
  } catch (err) {
    console.error('Nie udało się usunąć produktu z harmonogramu dostępności:', err);
  }
}

// Per-product per-day stock (capacity and reserved)
const productStockSchema = new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  dayIndex: { type: Number, required: true, min: 0, max: 6, index: true },
  capacity: { type: Number, required: true, min: 0, default: 0 },
  reserved: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });
productStockSchema.index({ productId: 1, dayIndex: 1 }, { unique: true });
const ProductStock = mongoose.model('ProductStock', productStockSchema);

const productDailyStockSchema = new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  capacity: { type: Number, required: true, min: 0, default: 0 },
  reserved: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });
productDailyStockSchema.index({ productId: 1, date: 1 }, { unique: true });
const ProductDailyStock = mongoose.model('ProductDailyStock', productDailyStockSchema);

// In-memory caches for frequently accessed collections
let cachedProducts = null;
let cachedProductsFetchedAt = 0;
let cachedCategories = null;
let cachedCategoriesFetchedAt = 0;
const CACHE_TTL_MS = 30 * 1000;

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0) {
    return number;
  }
  return fallback;
}

const ORDER_RETENTION_DAYS = parsePositiveInteger(process.env.ORDER_RETENTION_DAYS, 7);
const ORDER_REPORT_RETENTION_DAYS = parsePositiveInteger(process.env.ORDER_REPORT_RETENTION_DAYS, 0);
const DAILY_ORDERS_EMAIL = process.env.DAILY_ORDERS_EMAIL || 'zamowienia@chachorpiecze.pl';
const DAILY_ORDERS_CRON = process.env.DAILY_ORDERS_CRON || '1 0 * * *';
const DAILY_ORDERS_TIMEZONE = process.env.DAILY_ORDERS_TIMEZONE || 'Europe/Warsaw';
const DAILY_ORDERS_ENABLED = String(process.env.DAILY_ORDERS_ENABLED || 'true').toLowerCase() !== 'false';
const DEFAULT_LOCALE = process.env.APP_LOCALE || 'pl-PL';

function parseDailyCronExpression(cronExpression) {
  if (!cronExpression || typeof cronExpression !== 'string') {
    return null;
  }
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }
  const [minutePart, hourPart, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') {
    return null;
  }
  if (!/^\d+$/.test(minutePart) || !/^\d+$/.test(hourPart)) {
    return null;
  }
  const minute = Number(minutePart);
  const hour = Number(hourPart);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }
  return { hour, minute };
}

function formatCronDailyTime(cronExpression) {
  const parsed = parseDailyCronExpression(cronExpression);
  if (!parsed) {
    return null;
  }
  const hours = parsed.hour.toString().padStart(2, '0');
  const minutes = parsed.minute.toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

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

let mailTransporter = null;
let mailTransporterInitAttempted = false;

const MAIL_DNS_SERVERS = (process.env.MAIL_DNS_SERVERS || '')
  .split(',')
  .map((entry) => entry && entry.trim())
  .filter(Boolean);

if (MAIL_DNS_SERVERS.length) {
  try {
    dns.setServers(MAIL_DNS_SERVERS);
    console.log(`📮 Mail DNS servers set to: ${MAIL_DNS_SERVERS.join(', ')}`);
  } catch (err) {
    console.error('⚠️ Nie udało się ustawić MAIL_DNS_SERVERS:', err.message || err);
  }
}

const MAIL_PROVIDER_PRESETS = {
  gmail: { service: 'gmail', secure: true },
  outlook: { host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true },
  office365: { host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true },
  hotmail: { host: 'smtp-mail.outlook.com', port: 587, secure: false, requireTLS: true },
  live: { host: 'smtp-mail.outlook.com', port: 587, secure: false, requireTLS: true },
  yahoo: { service: 'yahoo', secure: true },
  forpsi: { host: 'smtp.forpsi.com', port: 587, secure: false, requireTLS: true }
};

function resolveMailTransportConfig(authUser, authPass) {
  const transportConfig = {
    auth: {
      user: authUser,
      pass: authPass
    }
  };
  let defaultServername = '';

  const provider = (process.env.MAIL_PROVIDER || '').toLowerCase();
  if (provider && MAIL_PROVIDER_PRESETS[provider]) {
    Object.assign(transportConfig, MAIL_PROVIDER_PRESETS[provider]);
  }
  if (transportConfig.host) {
    defaultServername = transportConfig.host;
  }

  const service = process.env.MAIL_SERVICE;
  if (service) {
    transportConfig.service = service;
  }

  const host = process.env.MAIL_HOST;
  if (host) {
    transportConfig.host = host;
    delete transportConfig.service;
  }
  if (transportConfig.host) {
    defaultServername = transportConfig.host;
  }

  const hostAddress = process.env.MAIL_HOST_ADDRESS
    || process.env.MAIL_SMTP_ADDRESS
    || process.env.MAIL_CONNECT_HOST;
  if (hostAddress) {
    transportConfig.host = hostAddress;
    delete transportConfig.service;
  }

  const port = process.env.MAIL_PORT;
  if (port) {
    const parsedPort = Number(port);
    if (!Number.isNaN(parsedPort)) {
      transportConfig.port = parsedPort;
    }
  }

  const secureEnv = process.env.MAIL_SECURE;
  if (secureEnv !== undefined) {
    transportConfig.secure = /^true|1$/i.test(secureEnv);
  } else if (!transportConfig.service && transportConfig.port === undefined && transportConfig.secure === undefined) {
    transportConfig.secure = true;
  }

  const requireTls = process.env.MAIL_REQUIRE_TLS;
  if (requireTls !== undefined) {
    transportConfig.requireTLS = /^true|1$/i.test(requireTls);
  }

  const rejectUnauthorized = process.env.MAIL_TLS_REJECT_UNAUTHORIZED;
  if (rejectUnauthorized !== undefined) {
    transportConfig.tls = {
      ...(transportConfig.tls || {}),
      rejectUnauthorized: !/^false|0$/i.test(rejectUnauthorized)
    };
  }

  const tlsMinVersion = process.env.MAIL_TLS_MIN_VERSION;
  if (tlsMinVersion) {
    transportConfig.tls = {
      ...(transportConfig.tls || {}),
      minVersion: tlsMinVersion
    };
  }

  const tlsServername = process.env.MAIL_TLS_SERVERNAME
    || process.env.MAIL_SERVERNAME
    || (hostAddress ? (process.env.MAIL_HOST || defaultServername) : '')
    || defaultServername;
  if (tlsServername) {
    transportConfig.tls = {
      ...(transportConfig.tls || {}),
      servername: tlsServername
    };
  }

  if (!transportConfig.service && !transportConfig.host) {
    Object.assign(transportConfig, MAIL_PROVIDER_PRESETS.gmail);
  }

  const authMethod = process.env.MAIL_AUTH_METHOD;
  if (authMethod) {
    transportConfig.authMethod = authMethod;
  }

  const authType = process.env.MAIL_AUTH_TYPE;
  if (authType) {
    transportConfig.auth = {
      ...(transportConfig.auth || {}),
      type: authType
    };
  }

  const ignoreTls = process.env.MAIL_IGNORE_TLS;
  if (ignoreTls !== undefined) {
    transportConfig.ignoreTLS = /^true|1$/i.test(ignoreTls);
  }

  return transportConfig;
}

function getMailTransporter() {
  if (mailTransporterInitAttempted) {
    return mailTransporter;
  }
  mailTransporterInitAttempted = true;

  const authUser = process.env.MAIL_USER || process.env.MAIL_USERNAME;
  const authPass = process.env.MAIL_PASSWORD || process.env.MAIL_PASS;
  if (!authUser || !authPass) {
    console.warn('⚠️ Mailing disabled: missing MAIL_USER/MAIL_PASSWORD environment variables.');
    return null;
  }

  const transportConfig = resolveMailTransportConfig(authUser, authPass);

  try {
    mailTransporter = nodemailer.createTransport(transportConfig);
  } catch (err) {
    console.error('❌ Błąd konfiguracji systemu mailowego:', err);
    mailTransporter = null;
  }

  return mailTransporter;
}

function formatPrice(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? number.toFixed(2) : '0.00'} zł`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function describePayment(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return '';
  }
  switch (normalized.toLowerCase()) {
    case 'place':
      return 'Płatność na miejscu';
    case 'online':
      return 'Płatność przez internet';
    default:
      return normalized;
  }
}

function createOrderEmailContent(order) {
  const safeOrder = order || {};
  const products = Array.isArray(safeOrder.products) ? safeOrder.products : [];
  const pickupDate = typeof safeOrder.pickupDate === 'string' ? safeOrder.pickupDate : '';
  const payment = typeof safeOrder.payment === 'string' ? safeOrder.payment : '';
  const comment = typeof safeOrder.comment === 'string' ? safeOrder.comment : '';
  const discountPercent = Number(safeOrder.discountPercent) || 0;
  const discountAmount = Number(safeOrder.discountAmount) || 0;
  const pickupReadyTimeLabel = typeof safeOrder.pickupReadyTimeLabel === 'string'
    ? safeOrder.pickupReadyTimeLabel.trim()
    : '';

  const pickupDateDisplay = pickupDate ? formatDateForDisplay(`${pickupDate}T00:00:00`) : '';

  const summaryLines = [
    'Dzień dobry,',
    '',
    'Potwierdzamy otrzymanie zamówienia w Chachor Piecze.',
    ''
  ];

  if (products.length) {
    summaryLines.push('Zamówione produkty:');
    products.forEach((product) => {
      const name = product && product.name ? product.name : 'Produkt';
      const quantity = Number(product && product.quantity) || 0;
      const price = Number(product && product.price) || 0;
      summaryLines.push(`- ${name} x${quantity} — ${formatPrice(price * quantity)}`);
    });
    summaryLines.push('');
  }

  if (discountPercent > 0) {
    summaryLines.push(`Rabat (${discountPercent}%): -${formatPrice(discountAmount)}`);
  }
  summaryLines.push(`Do zapłaty: ${formatPrice(safeOrder.totalAfterDiscount)}`);
  const paymentLabel = describePayment(payment);
  if (paymentLabel) {
    summaryLines.push(`Forma płatności: ${paymentLabel}`);
  }
  if (pickupDate) {
    summaryLines.push(`Data odbioru: ${pickupDateDisplay || pickupDate}`);
  }
  if (pickupReadyTimeLabel) {
    summaryLines.push(`Godzina odbioru: ${pickupReadyTimeLabel}`);
  }
  if (comment) {
    summaryLines.push('');
    summaryLines.push('Komentarz do zamówienia:');
    summaryLines.push(comment);
  }
  summaryLines.push('');
  summaryLines.push('Do zobaczenia w piekarni!');

  const text = summaryLines.join('\n');

  const productRows = products.map((product) => {
    const name = escapeHtml(product && product.name ? product.name : 'Produkt');
    const quantity = Number(product && product.quantity) || 0;
    const price = Number(product && product.price) || 0;
    return `
              <tr>
                <td>${name}</td>
                <td>${quantity}</td>
                <td>${formatPrice(price * quantity)}</td>
              </tr>
            `;
  }).join('');

  const productsTableHtml = products.length ? `
          <table class="products-table" role="presentation" cellpadding="0" cellspacing="0">
            <thead>
              <tr>
                <th scope="col">Produkt</th>
                <th scope="col">Ilość</th>
                <th scope="col">Kwota</th>
              </tr>
            </thead>
            <tbody>
${productRows.trim()}
            </tbody>
          </table>
        ` : `
          <p class="products-empty">Brak zamówionych produktów.</p>
        `;

  const discountRowHtml = discountPercent > 0
    ? `
          <div class="summary-row">
            <strong>Rabat (${discountPercent}%):&nbsp;</strong>
            <span class="summary-value">-${formatPrice(discountAmount)}</span>
          </div>
        `
    : '';

  const pickupTimeRowHtml = pickupReadyTimeLabel
    ? `
            <div class="summary-row summary-row--link">
              <strong>Godzina odbioru:&nbsp;</strong>
              <span class="summary-value">${escapeHtml(pickupReadyTimeLabel)}</span>
            </div>
        `
    : `
            <div class="summary-row summary-row--link">
              <strong>Godziny odbioru:&nbsp;</strong>
              <span class="summary-value"><a class="summary-link" href="https://chachorpiecze.pl/accessibility" target="_blank" rel="noopener noreferrer">Sprawdź od której możesz odebrać zamówienie</a></span>
            </div>
        `;

  const commentBlockHtml = comment
    ? `
          <div class="summary-row summary-row--comment">
            <strong>Komentarz do zamówienia:&nbsp;</strong>
            <span class="summary-value">${escapeHtml(comment).replace(/\r?\n/g, '<br>')}</span>
          </div>
        `
    : '';

  const assetsBaseUrl = (process.env.EMAIL_ASSETS_BASE_URL || process.env.APP_PUBLIC_URL || '').replace(/\/$/, '');
  const logoUrl = process.env.EMAIL_LOGO_URL || (assetsBaseUrl ? `${assetsBaseUrl}/images/logo.png` : '');

  const brandLogoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Chachor Piecze" class="brand-logo" width="160" style="max-width: 160px; height: auto; display: block; margin: 0 auto 10px;" />`
    : `<div class="brand-name">Chachor Piecze</div>`;

  const html = `<!DOCTYPE html>
  <html lang="pl">
  <head>
    <meta charset="UTF-8">
    <title>Potwierdzenie zamówienia – Chachor Piecze</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
      body { margin: 0; padding: 0; background: #fdf5eb; color: #3c2a1e; }
      .email-wrapper { width: 100%; padding: 24px 12px; background: #fdf5eb; }
      .email-container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 22px; padding: 32px 28px; box-shadow: 0 24px 48px rgba(92, 67, 45, 0.18); }
      .brand-hero { text-align: center; margin-bottom: 28px; padding: 28px 18px 24px; background: linear-gradient(135deg, rgba(252, 224, 184, 0.4), rgba(210, 176, 146, 0.25)); border-radius: 18px; border: 1px solid rgba(136, 94, 61, 0.12); }
      .brand-logo { max-width: 180px; height: auto; display: block; margin: 0 auto 12px; }
      .brand-name { font-size: 1.9rem; letter-spacing: 0.08em; text-transform: uppercase; color: #6d3d23; margin: 0 0 6px; }
      .brand-subtitle { margin: 6px 0 0; font-size: 0.95rem; color: rgba(96, 67, 43, 0.78); }
      p { line-height: 1.6; margin: 12px 0; }
      .intro { font-size: 1rem; color: rgba(60, 42, 30, 0.92); }
      .products-section { margin: 28px 0; }
      .products-table { width: 100%; border-collapse: collapse; background: #fffaf3; border-radius: 16px; overflow: hidden; border: 1px solid rgba(109, 61, 35, 0.18); }
      .products-table thead { background: linear-gradient(135deg, #f3d9bf, #e7c3a1); color: #4a2d1c; }
      .products-table th, .products-table td { padding: 14px 16px; text-align: left; font-size: 0.95rem; border-bottom: 1px solid rgba(109, 61, 35, 0.12); }
      .products-table th { text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.05em; }
      .products-table tr:last-child td { border-bottom: none; }
      .products-empty { margin: 0; padding: 18px; border-radius: 16px; background: rgba(255, 255, 255, 0.86); border: 1px dashed rgba(109, 61, 35, 0.28); text-align: center; color: rgba(60, 42, 30, 0.75); font-weight: 600; }
      .summary-card { margin: 24px 0; padding: 22px 24px; border-radius: 18px; background: linear-gradient(135deg, rgba(248, 231, 211, 0.88), rgba(240, 211, 181, 0.85)); border: 1px solid rgba(109, 61, 35, 0.2); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45); }
      .summary-row { display: flex; justify-content: space-between; align-items: baseline; margin: 12px 0; font-size: 1rem; gap: 12px; }
      .summary-row strong { color: #4a2d1c; }
      .summary-value { flex: 1; color: #3c2a1e; text-align: right; }
      .summary-row--comment { align-items: baseline; }
      .summary-row--comment .summary-value,
      .summary-row--link .summary-value { text-align: left; }
      .summary-link { color: #4a2d1c; text-decoration: none; font-weight: 600; }
      .summary-link:focus, .summary-link:hover { text-decoration: underline; }
      .summary-row--spaced { margin-bottom: 18px; }
      .total-amount { font-size: 1rem; font-weight: 600; color: #4a2d1c; display: inline-block; }
      .closing { margin-top: 24px; font-weight: 600; color: rgba(60, 42, 30, 0.85); }
      .footer-note { margin-top: 32px; font-size: 0.85rem; text-align: center; color: rgba(96, 67, 43, 0.75); }
      @media (max-width: 600px) {
        .email-container { padding: 26px 18px; border-radius: 18px; }
        .brand-hero { padding: 24px 16px 22px; }
        .summary-row { flex-direction: column; align-items: flex-start; margin: 10px 0; }
        .products-table th, .products-table td { padding: 12px; }
        .total-amount { font-size: 1rem; }
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-container">
        <header class="brand-hero">
          ${brandLogoHtml}
          <p class="brand-subtitle">Świeże wypieki każdego dnia</p>
        </header>
        <main>
          <p class="intro">Dzień dobry,</p>
          <p class="intro">Potwierdzamy otrzymanie zamówienia w Chachor Piecze.</p>
          <section class="products-section">
            <h2 class="section-title" style="font-size:1.1rem;font-weight:600;margin:0 0 12px;color:#6d3d23;">Zamówione produkty</h2>
${productsTableHtml.trim()}
          </section>
          <section class="summary-card">
${discountRowHtml.trim()}
            <div class="summary-row summary-row--spaced">
              <strong>Do zapłaty:&nbsp;</strong>
              <span class="summary-value total-amount">${formatPrice(safeOrder.totalAfterDiscount)}</span>
            </div>
${paymentLabel ? `
            <div class="summary-row">
              <strong>Forma płatności:&nbsp;</strong>
              <span class="summary-value">${escapeHtml(paymentLabel)}</span>
            </div>
` : ''}
${pickupDate ? `
            <div class="summary-row">
              <strong>Data odbioru:&nbsp;</strong>
              <span class="summary-value">${escapeHtml(pickupDateDisplay || pickupDate)}</span>
            </div>
` : ''}
${pickupTimeRowHtml.trim()}
${commentBlockHtml.trim()}
          </section>
          <p class="closing">Do zobaczenia w piekarni!</p>
        </main>
        <footer class="footer-note">
          Dziękujemy za zamówienie w Chachor Piecze ❤️
        </footer>
      </div>
    </div>
  </body>
  </html>`;

  return { text, html };
}

async function sendOrderConfirmationEmail(order) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return;
  }

  const recipient = order && typeof order.email === 'string' ? order.email.trim() : '';
  if (!recipient) {
    return;
  }

  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER || process.env.MAIL_USERNAME;
  if (!fromAddress) {
    console.warn('⚠️ Mailing pominięty: brak adresu nadawcy (MAIL_FROM).');
    return;
  }

  try {
    const pickupReadyTimeLabel = await resolvePickupReadyTimeLabel(order);
    if (pickupReadyTimeLabel) {
      order.pickupReadyTimeLabel = pickupReadyTimeLabel;
    }
  } catch (err) {
    console.warn('Nie udało się ustalić godziny odbioru dla zamówienia:', err);
  }

  const fromName = process.env.MAIL_FROM_NAME || 'Chachor Piecze';
  const { text, html } = createOrderEmailContent(order);

  try {
    await transporter.sendMail({
      from: fromName ? `${fromName.replace(/"/g, "'")} <${fromAddress}>` : fromAddress,
      to: recipient,
      subject: 'Potwierdzenie zamówienia w Chachor Piecze',
      text,
      html
    });
    console.log(`📧 Wysłano potwierdzenie zamówienia do ${recipient}`);
  } catch (err) {
    console.error('❌ Nie udało się wysłać potwierdzenia zamówienia:', err);
  }
}

function getStartOfDay(dateLike) {
  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike || Date.now());
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function getPreviousDayRange(referenceDate = new Date()) {
  const end = getStartOfDay(referenceDate);
  if (!end) {
    return null;
  }
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { start, end, reportDate: normalizeDateInput(start) };
}

function formatDateForDisplay(dateInput, options = {}) {
  if (!dateInput) {
    return '';
  }
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return typeof dateInput === 'string' ? dateInput : '';
  }
  const formatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  });
  return formatter.format(date);
}

function formatDateTimeForDisplay(dateInput) {
  return formatDateForDisplay(dateInput, { hour: '2-digit', minute: '2-digit' });
}

function formatTimeForDisplay(dateInput) {
  if (!dateInput) {
    return '';
  }
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return typeof dateInput === 'string' ? dateInput : '';
  }
  const formatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit'
  });
  return formatter.format(date);
}

function summarizeOrdersForReport(orders) {
  const totals = orders.reduce((acc, order) => {
    const amount = Number(order.totalAfterDiscount) || 0;
    acc.grandTotal += amount;
    return acc;
  }, { grandTotal: 0 });

  totals.ordersCount = orders.length;
  totals.grandTotal = Number(totals.grandTotal.toFixed(2));
  return totals;
}

function mapOrderToReportEntry(order, index = 0) {
  if (!order) {
    return null;
  }

  const products = Array.isArray(order.products) ? order.products : [];
  const mappedProducts = products.map((product) => {
    const quantity = Number(product && product.quantity) || 0;
    const price = Number(product && product.price) || 0;
    return {
      name: product && typeof product.name === 'string' ? product.name : '',
      quantity,
      price,
      total: Number((price * quantity).toFixed(2))
    };
  });

  return {
    orderId: String(order._id || order.orderId || ''),
    email: typeof order.email === 'string' ? order.email : '',
    phone: typeof order.phone === 'string' ? order.phone : '',
    payment: typeof order.payment === 'string' ? order.payment : '',
    paymentLabel: describePayment(order.payment),
    comment: typeof order.comment === 'string' ? order.comment : '',
    pickupDate: typeof order.pickupDate === 'string' ? order.pickupDate : '',
    discountCode: typeof order.discountCode === 'string' ? order.discountCode : '',
    discountPercent: Number(order.discountPercent) || 0,
    discountAmount: Number(order.discountAmount) || 0,
    totalBeforeDiscount: Number(order.totalBeforeDiscount) || 0,
    totalAfterDiscount: Number(order.totalAfterDiscount) || 0,
    createdAt: order.createdAt ? new Date(order.createdAt) : null,
    products: mappedProducts,
    sequenceNumber: Number.isFinite(index) ? index + 1 : null
  };
}

function getPaymentReportStatus(order) {
  const raw = order && typeof order.payment === 'string' ? order.payment.trim().toLowerCase() : '';
  switch (raw) {
    case 'online':
      return 'Zapłacone online';
    case 'place':
      return 'Płatność na miejscu';
    default: {
      if (order && typeof order.paymentLabel === 'string' && order.paymentLabel.trim()) {
        return order.paymentLabel.trim();
      }
      return 'Brak danych';
    }
  }
}

function createDailyOrdersEmailPayload(reportDate, orders, totals) {
  const displayDate = formatDateForDisplay(`${reportDate}T00:00:00`);
  const subjectPrefix = process.env.DAILY_ORDERS_EMAIL_SUBJECT || 'Zestawienie zamówień';
  const subject = `${subjectPrefix} - ${displayDate || reportDate}`;
  const hasOrders = Array.isArray(orders) && orders.length > 0;

  const headerLines = [
    `Zestawienie zamówień z dnia ${displayDate || reportDate}`,
    '',
    `Liczba zamówień: ${totals.ordersCount}`,
    `Łączna kwota do zapłaty: ${formatPrice(totals.grandTotal)}`
  ];
  if (!hasOrders) {
    headerLines.push('Brak zamówień w poprzednim dniu.');
  }

  const textOrders = orders.map((order) => {
    const orderProducts = Array.isArray(order.products) ? order.products : [];
    const sequenceLabel = Number.isFinite(order.sequenceNumber) && order.sequenceNumber > 0
      ? `#${order.sequenceNumber}`
      : 'brak';
    const lines = [
      `Numer w dniu: ${sequenceLabel}`,
      `ID zamówienia: ${order.orderId || 'brak'}`,
      `Godzina złożenia: ${formatTimeForDisplay(order.createdAt) || 'brak'}`,
      `Adres email: ${order.email || 'brak'}`,
      `Telefon: ${order.phone || 'brak'}`,
      'Produkty:'
    ];

    if (orderProducts.length) {
      orderProducts.forEach((product) => {
        lines.push(`  • ${product.name} × ${product.quantity} — ${formatPrice(product.total)}`);
      });
    } else {
      lines.push('  • brak pozycji');
    }

    if (order.discountCode) {
      lines.push(`Rabat: ${order.discountCode} (${order.discountPercent}% / -${formatPrice(order.discountAmount)})`);
    }

    lines.push(`Kwota do zapłaty: ${formatPrice(order.totalAfterDiscount)}`);
    lines.push(`Forma płatności: ${getPaymentReportStatus(order)}`);

    if (order.comment) {
      lines.push(`Komentarz: ${order.comment}`);
    }

    return lines.join('\n');
  }).join('\n\n');

  const headerText = headerLines.join('\n');
  const text = hasOrders ? `${headerText}\n\n${textOrders}` : `${headerText}\n`;

  const orderRows = orders.map((order) => {
    const orderProducts = Array.isArray(order.products) ? order.products : [];
    const productsHtml = orderProducts.length
      ? `<ul style="margin:0;padding-left:18px;">${orderProducts.map((product) => (
        `<li>${escapeHtml(product.name)} × ${product.quantity} — ${formatPrice(product.total)}</li>`
      )).join('')}</ul>`
      : '<em>Brak pozycji</em>';

    const discountHtml = order.discountCode
      ? `<p style="margin:8px 0 0;"><strong>Rabat:</strong> ${escapeHtml(order.discountCode)} (${order.discountPercent}% / -${formatPrice(order.discountAmount)})</p>`
      : '';

    const commentHtml = order.comment
      ? `<p style="margin:8px 0 0;"><strong>Komentarz:</strong><br>${escapeHtml(order.comment).replace(/\r?\n/g, '<br>')}</p>`
      : '';

    const paymentStatus = getPaymentReportStatus(order);
    const sequenceCell = Number.isFinite(order.sequenceNumber) && order.sequenceNumber > 0
      ? `#${order.sequenceNumber}`
      : '';

    return `
      <tr>
        <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(sequenceCell)}</td>
        <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(order.orderId || '')}</td>
        <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(formatTimeForDisplay(order.createdAt) || '')}</td>
        <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(order.email || '')}</td>
        <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(order.phone || '')}</td>
        <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">
          ${productsHtml}
          <p style="margin:8px 0 0;"><strong>Kwota:</strong> ${formatPrice(order.totalAfterDiscount)}</p>
          ${discountHtml}
          ${commentHtml}
        </td>
        <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(paymentStatus)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f1f1f;">
      <h2 style="margin-bottom:8px;">Zestawienie zamówień z dnia ${escapeHtml(displayDate || reportDate)}</h2>
      <p><strong>Liczba zamówień:</strong> ${totals.ordersCount}</p>
      <p><strong>Łączna kwota do zapłaty:</strong> ${formatPrice(totals.grandTotal)}</p>
      ${hasOrders ? '' : '<p>Brak zamówień w poprzednim dniu.</p>'}
      ${orders.length ? `
        <table style="border-collapse:collapse;width:100%;margin-top:16px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th align="left" style="padding:8px;border:1px solid #ddd;">Numer w dniu</th>
              <th align="left" style="padding:8px;border:1px solid #ddd;">Nr zamówienia</th>
              <th align="left" style="padding:8px;border:1px solid #ddd;">Godzina złożenia</th>
              <th align="left" style="padding:8px;border:1px solid #ddd;">Adres email</th>
              <th align="left" style="padding:8px;border:1px solid #ddd;">Telefon</th>
              <th align="left" style="padding:8px;border:1px solid #ddd;">Produkty</th>
              <th align="left" style="padding:8px;border:1px solid #ddd;">Płatność</th>
            </tr>
          </thead>
          <tbody>
            ${orderRows}
          </tbody>
        </table>
      ` : '<p>Brak zamówień w poprzednim dniu.</p>'}
    </div>
  `;

  return { subject, text, html };
}

function getDailyOrderReportSettings() {
  return {
    enabled: DAILY_ORDERS_ENABLED,
    targetEmail: DAILY_ORDERS_EMAIL,
    cronExpression: DAILY_ORDERS_CRON,
    timezone: DAILY_ORDERS_TIMEZONE,
    scheduledTime: formatCronDailyTime(DAILY_ORDERS_CRON),
    sendsEmptyReport: true
  };
}

async function purgeOldOrders() {
  if (!ORDER_RETENTION_DAYS) {
    return;
  }
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - ORDER_RETENTION_DAYS);
  try {
    await Order.deleteMany({ createdAt: { $lt: cutoff } });
  } catch (err) {
    console.error('❌ Błąd podczas usuwania starych zamówień:', err);
  }
}

async function purgeOldOrderReports() {
  if (!ORDER_REPORT_RETENTION_DAYS) {
    return;
  }
  const cutoff = getStartOfDay(new Date());
  if (!cutoff) {
    return;
  }
  cutoff.setDate(cutoff.getDate() - ORDER_REPORT_RETENTION_DAYS);
  const cutoffDate = normalizeDateInput(cutoff);
  if (!cutoffDate) {
    return;
  }
  try {
    await OrderReport.deleteMany({ reportDate: { $lte: cutoffDate } });
  } catch (err) {
    console.error('❌ Błąd podczas usuwania starych zestawień zamówień:', err);
  }
}

async function processDailyOrders(referenceDate = new Date()) {
  const range = getPreviousDayRange(referenceDate);
  if (!range) {
    return;
  }

  const { start, end, reportDate } = range;

  try {
    const orders = await Order.find({
      createdAt: {
        $gte: start,
        $lt: end
      }
    })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const transporter = getMailTransporter();
    const targetEmail = DAILY_ORDERS_EMAIL;

    const reportOrders = orders
      .map((order, index) => mapOrderToReportEntry(order, index))
      .filter(Boolean);

    const totals = summarizeOrdersForReport(reportOrders);
    const pickupDates = reportOrders
      .map((order) => normalizeDateInput(order.pickupDate))
      .filter((value) => typeof value === 'string' && value.length === 10);
    const lastFulfillmentDate = pickupDates.length
      ? pickupDates.reduce((latest, current) => (current > latest ? current : latest), pickupDates[0])
      : reportDate;
    const emailPayload = createDailyOrdersEmailPayload(reportDate, reportOrders, totals);

    const reportUpdate = {
      collectedAt: new Date(),
      lastFulfillmentDate,
      sentTo: targetEmail,
      emailSubject: emailPayload.subject,
      orders: reportOrders,
      totals
    };

    let emailStatus = 'skipped';
    let failureReason = '';
    let sentAt = null;

    if (!targetEmail) {
      failureReason = 'Brak adresu docelowego (DAILY_ORDERS_EMAIL).';
      console.warn('⚠️ Pominięto wysyłkę zestawienia zamówień: brak adresu docelowego.');
    } else if (!transporter) {
      failureReason = 'Brak skonfigurowanego transportu email.';
      console.warn('⚠️ Pominięto wysyłkę zestawienia zamówień: brak konfiguracji mailera.');
    } else {
      try {
        await transporter.sendMail({
          from: process.env.MAIL_FROM || process.env.MAIL_USER || process.env.MAIL_USERNAME || targetEmail,
          to: targetEmail,
          subject: emailPayload.subject,
          text: emailPayload.text,
          html: emailPayload.html
        });
        sentAt = new Date();
        emailStatus = 'sent';
        console.log(`📬 Wysłano dzienne zestawienie zamówień na adres ${targetEmail} (${reportOrders.length} zamówień).`);
      } catch (err) {
        emailStatus = 'failed';
        failureReason = err && err.message ? err.message : 'Nieznany błąd wysyłki';
        console.error('❌ Błąd wysyłki dziennego zestawienia zamówień:', err);
      }
    }

    reportUpdate.sentAt = sentAt;
    reportUpdate.emailStatus = emailStatus;
    reportUpdate.failureReason = failureReason;

    await OrderReport.findOneAndUpdate(
      { reportDate },
      { $set: reportUpdate },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await purgeOldOrders();
    await purgeOldOrderReports();
  } catch (err) {
    console.error('❌ Błąd przygotowania dziennego zestawienia zamówień:', err);
  }
}

function startDailyOrderSummaryJob() {
  if (!DAILY_ORDERS_ENABLED) {
    console.warn('ℹ️ Automatyczne zestawienia zamówień są wyłączone (DAILY_ORDERS_ENABLED=false).');
    return;
  }
  try {
    cron.schedule(DAILY_ORDERS_CRON, () => {
      processDailyOrders(new Date());
    }, {
      timezone: DAILY_ORDERS_TIMEZONE
    });
    console.log(`🕐 Zaplanowano dzienne wysyłki zamówień (cron: "${DAILY_ORDERS_CRON}", strefa: ${DAILY_ORDERS_TIMEZONE}).`);
  } catch (err) {
    console.error('❌ Nie udało się uruchomić harmonogramu zamówień:', err);
  }
}
function normalizeDateInput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return null;
}

function getDayIndexFromDateString(dateStr) {
  const normalized = normalizeDateInput(dateStr);
  if (!normalized) {
    return null;
  }
  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return (date.getDay() + 6) % 7;
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

app.get('/api/accessibility-content', async (req, res) => {
  try {
    const content = await AccessibilityContent.findOne().lean();
    res.json({
      heroImageData: content && content.heroImageData ? content.heroImageData : '',
      heroImageUrl: content && content.heroImageUrl ? content.heroImageUrl : '',
      tagline: DEFAULT_ACCESSIBILITY_TAGLINE
    });
  } catch (err) {
    console.error('Błąd pobierania sekcji dostępności:', err);
    res.status(500).json({ error: 'Błąd pobierania sekcji dostępności' });
  }
});

app.post('/api/accessibility-content', upload.single('accessibilityHeroImage'), async (req, res) => {
  try {
    const shouldRemoveImage = isTruthy(req.body && req.body.removeImage);
    const hasNewImage = Boolean(req.file);

    if (!hasNewImage && !shouldRemoveImage) {
      return res.status(400).json({ error: 'Brak danych do zapisania' });
    }

    const updateSet = {};
    let uploadedHeroImage = null;
    let previousContent = null;

    if (hasNewImage || shouldRemoveImage) {
      previousContent = await AccessibilityContent.findOne();
    }

    if (hasNewImage) {
      try {
        uploadedHeroImage = await uploadNormalizedImage(req.file, 'accessibility/hero');
      } catch (uploadErr) {
        console.error('Błąd przesyłania zdjęcia sekcji dostępności do Cloudflare:', uploadErr);
        return res.status(500).json({ error: 'Nie udało się zapisać zdjęcia sekcji.' });
      }
      updateSet.heroImageUrl = uploadedHeroImage.url;
      updateSet.heroImageKey = uploadedHeroImage.key;
      updateSet.heroImageData = '';
    }

    if (shouldRemoveImage && !hasNewImage) {
      updateSet.heroImageUrl = '';
      updateSet.heroImageKey = '';
      updateSet.heroImageData = '';
    }

    const content = await AccessibilityContent.findOneAndUpdate(
      {},
      { $set: updateSet },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (uploadedHeroImage && previousContent) {
      const previousKey = previousContent.heroImageKey || previousContent.heroImageUrl;
      if (previousKey && previousKey !== uploadedHeroImage.key) {
        await deleteImageFromCloudflare(previousKey);
      }
    } else if (shouldRemoveImage && !hasNewImage && previousContent) {
      const previousKey = previousContent.heroImageKey || previousContent.heroImageUrl;
      if (previousKey) {
        await deleteImageFromCloudflare(previousKey);
      }
    }

    res.json({
      heroImageData: content && content.heroImageData ? content.heroImageData : '',
      heroImageUrl: content && content.heroImageUrl ? content.heroImageUrl : '',
      tagline: DEFAULT_ACCESSIBILITY_TAGLINE
    });
  } catch (err) {
    console.error('Błąd zapisu sekcji dostępności:', err);
    res.status(500).json({ error: 'Nie udało się zapisać sekcji dostępności' });
  }
});

app.get('/api/about', async (req, res) => {
  try {
    const about = await AboutContent.findOne().lean();
    const payload = {
      heroImageData: about && about.heroImageData ? about.heroImageData : '',
      heroImageUrl: about && about.heroImageUrl ? about.heroImageUrl : '',
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
      const capacity = s ? Math.max(0, Number(s.capacity) || 0) : 0;
      const remaining = capacity;
      return {
        productId: String(p._id),
        name: p.name,
        capacity,
        reserved: 0,
        remaining,
        dayIndex
      };
    });
    res.json(result);
  } catch (err) {
    console.error('Błąd pobierania stanów magazynowych:', err);
    res.status(500).json({ error: 'Błąd pobierania stanów magazynowych' });
  }
});

app.get('/api/stock/date/:date', async (req, res) => {
  const normalizedDate = normalizeDateInput(req.params.date);
  if (!normalizedDate) {
    return res.status(400).json({ error: 'Nieprawidłowa data' });
  }
  const dayIndex = getDayIndexFromDateString(normalizedDate);
  if (dayIndex === null) {
    return res.status(400).json({ error: 'Nie można ustalić dnia tygodnia dla daty' });
  }
  try {
    const [products, weeklyStock, dailyStock] = await Promise.all([
      Product.find().lean(),
      ProductStock.find({ dayIndex }).lean(),
      ProductDailyStock.find({ date: normalizedDate }).lean()
    ]);

    const weeklyMap = new Map(weeklyStock.map((doc) => [String(doc.productId), Math.max(0, Number(doc.capacity) || 0)]));
    const dailyMap = new Map(dailyStock.map((doc) => [String(doc.productId), doc]));

    const result = products.map((product) => {
      const productId = String(product._id);
      const override = dailyMap.get(productId);
      const weeklyCapacity = weeklyMap.get(productId) || 0;
      const capacity = override ? Math.max(0, Number(override.capacity) || 0) : weeklyCapacity;
      const reserved = override ? Math.max(0, Number(override.reserved) || 0) : 0;
      const remaining = Math.max(0, capacity - reserved);
      return {
        productId,
        name: product.name,
        capacity,
        reserved,
        remaining,
        source: override ? 'date' : 'weekly',
        date: normalizedDate,
        dayIndex
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Błąd pobierania stanów dla daty:', err);
    res.status(500).json({ error: 'Błąd pobierania stanów dla daty' });
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

// Upsert capacities in bulk. Supports weekly templates ({ productId, dayIndex, capacity })
// and date overrides ({ productId, date, capacity }).
app.put('/api/stock', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const weeklyItems = [];
  const dailyItems = [];

  items.forEach((item) => {
    if (!item) {
      return;
    }
    const productId = item.productId ? String(item.productId) : '';
    const capacity = Math.max(0, Number(item.capacity));
    if (!productId || !Number.isFinite(capacity)) {
      return;
    }

    const normalizedDate = normalizeDateInput(item.date);
    if (normalizedDate) {
      dailyItems.push({ productId, date: normalizedDate, capacity });
      return;
    }

    const dayIndex = Number(item.dayIndex);
    if (Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 6) {
      weeklyItems.push({ productId, dayIndex, capacity });
    }
  });

  if (!weeklyItems.length && !dailyItems.length) {
    return res.status(400).json({ error: 'Brak danych do zapisania' });
  }

  try {
    if (weeklyItems.length) {
      const weeklyOps = weeklyItems.map((i) => ({
        updateOne: {
          filter: { productId: i.productId, dayIndex: i.dayIndex },
          update: { $set: { capacity: i.capacity }, $setOnInsert: { reserved: 0 } },
          upsert: true
        }
      }));
      await ProductStock.bulkWrite(weeklyOps, { ordered: false });
    }

    if (dailyItems.length) {
      for (const item of dailyItems) {
        const doc = await ProductDailyStock.findOneAndUpdate(
          { productId: item.productId, date: item.date },
          { $set: { capacity: item.capacity }, $setOnInsert: { reserved: 0 } },
          { upsert: true, new: true }
        );
        if (doc && doc.reserved > item.capacity) {
          await ProductDailyStock.updateOne({ _id: doc._id }, { $set: { reserved: item.capacity } });
        }
      }
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
    const pickupTimesMap = parsePickupTimesInput(req.body.pickupTimes);
    const pickupTimesProvided = pickupTimesMap && pickupTimesMap.size > 0;
    if (pickupTimesProvided) {
      const pickupValidation = validatePickupTimesForAvailability(availabilityDays, pickupTimesMap);
      if (!pickupValidation.valid) {
        const message = buildPickupTimesValidationMessage(pickupValidation);
        return res.status(400).json({ error: message });
      }
    }
    const pickupValidation = validatePickupTimesForAvailability(availabilityDays, pickupTimesMap);
    if (!pickupValidation.valid) {
      const message = buildPickupTimesValidationMessage(pickupValidation);
      return res.status(400).json({ error: message });
    }

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

    let uploadedImage;
    try {
      uploadedImage = await uploadNormalizedImage(req.file, 'products');
    } catch (uploadErr) {
      console.error('Błąd przesyłania zdjęcia produktu do Cloudflare:', uploadErr);
      return res.status(500).json({ error: 'Nie udało się zapisać zdjęcia produktu.' });
    }

    const product = new Product({
      name: name ? name.trim() : name,
      price: numericPrice,
      desc: desc ? desc.trim() : desc,
      category,
      imageUrl: uploadedImage.url,
      imageKey: uploadedImage.key,
      availabilityDays
    });

    await product.save();
    await upsertPickupTimesForProduct(product.name, availabilityDays, pickupTimesMap);
    invalidateProductsCache();
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd dodawania produktu' });
  }
});

// Edytuj istniejący produkt
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Produkt nie istnieje' });
    }

    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }

    const { name, price, desc, category } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedDesc = typeof desc === 'string' ? desc.trim() : '';
    const normalizedCategory = typeof category === 'string' ? category.trim() : '';
    if (!trimmedName || !trimmedDesc || !normalizedCategory) {
      return res.status(400).json({ error: 'Wszystkie pola produktu są wymagane' });
    }

    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice)) {
      return res.status(400).json({ error: 'Nieprawidłowa cena' });
    }

    const availabilityDays = normalizeAvailabilityDaysInput(req.body.availabilityDays);
    const pickupTimesMap = parsePickupTimesInput(req.body.pickupTimes);

    const updateSet = {
      name: trimmedName,
      desc: trimmedDesc,
      category: normalizedCategory,
      price: numericPrice,
      availabilityDays
    };

    let uploadedImage = null;
    const previousAssetReference = product.imageKey || product.imageUrl || '';

    if (req.file) {
      try {
        uploadedImage = await uploadNormalizedImage(req.file, 'products');
      } catch (uploadErr) {
        console.error('Błąd przesyłania nowego zdjęcia produktu do Cloudflare:', uploadErr);
        return res.status(500).json({ error: 'Nie udało się zapisać zdjęcia produktu.' });
      }
      updateSet.imageUrl = uploadedImage.url;
      updateSet.imageKey = uploadedImage.key;
      updateSet.imageData = '';
    }

    Object.assign(product, updateSet);
    await product.save();
    await upsertPickupTimesForProduct(product.name, availabilityDays, pickupTimesMap);
    invalidateProductsCache();

    if (uploadedImage && previousAssetReference && previousAssetReference !== uploadedImage.key && previousAssetReference !== uploadedImage.url) {
      try {
        await deleteImageFromCloudflare(previousAssetReference);
      } catch (cleanupErr) {
        console.error('Błąd czyszczenia poprzedniego zdjęcia produktu w Cloudflare:', cleanupErr);
      }
    }

    res.json(product.toObject());
  } catch (err) {
    console.error('Błąd aktualizacji produktu:', err);
    res.status(500).json({ error: 'Nie udało się zaktualizować produktu' });
  }
});

app.patch('/api/products/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Produkt nie istnieje' });
    }

    const { isBlocked } = req.body || {};
    if (typeof isBlocked !== 'boolean') {
      return res.status(400).json({ error: 'Brak prawidłowego statusu blokady.' });
    }

    product.isBlocked = isBlocked;
    await product.save();
    invalidateProductsCache();
    res.json(product.toObject());
  } catch (err) {
    console.error('Błąd zmiany statusu produktu:', err);
    res.status(500).json({ error: 'Nie udało się zmienić statusu produktu' });
  }
});

app.post('/api/about', upload.single('aboutImage'), async (req, res) => {
  try {
    const text = typeof req.body.aboutText === 'string' ? req.body.aboutText.trim() : '';
    const updateSet = {};
    const updateUnset = {};
    let previousAboutDoc = null;
    let uploadedHeroImage = null;

    if (text) {
      updateSet.heroText = text;
    }

    if (req.file) {
      previousAboutDoc = await AboutContent.findOne();
      try {
        uploadedHeroImage = await uploadNormalizedImage(req.file, 'about/hero');
      } catch (uploadErr) {
        console.error('Błąd przesyłania zdjęcia sekcji O nas do Cloudflare:', uploadErr);
        return res.status(500).json({ error: 'Nie udało się zapisać zdjęcia sekcji.' });
      }
      updateSet.heroImageUrl = uploadedHeroImage.url;
      updateSet.heroImageKey = uploadedHeroImage.key;
      updateUnset.heroImageData = '';
    }

    if (!Object.keys(updateSet).length) {
      return res.status(400).json({ error: 'Brak danych do zapisania' });
    }

    const updatePayload = { $set: updateSet };
    if (Object.keys(updateUnset).length) {
      updatePayload.$unset = updateUnset;
    }

    const about = await AboutContent.findOneAndUpdate(
      {},
      updatePayload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (uploadedHeroImage && about) {
      const previousKey = previousAboutDoc && (previousAboutDoc.heroImageKey || previousAboutDoc.heroImageUrl);
      if (previousKey && previousKey !== uploadedHeroImage.key) {
        await deleteImageFromCloudflare(previousKey);
      }
    }

    const payload = {
      heroImageData: about && about.heroImageData ? about.heroImageData : '',
      heroImageUrl: about && about.heroImageUrl ? about.heroImageUrl : '',
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
    let uploadedImage = null;
    try {
      uploadedImage = await uploadNormalizedImage(req.file, 'about/gallery');
    } catch (uploadErr) {
      console.error('Błąd przesyłania zdjęcia galerii do Cloudflare:', uploadErr);
      return res.status(500).json({ error: 'Nie udało się zapisać zdjęcia galerii.' });
    }
    const about = await AboutContent.findOneAndUpdate(
      {},
      { $push: { gallery: { imageUrl: uploadedImage.url, imageKey: uploadedImage.key, createdAt: new Date() } } },
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
    const assetReference = item.imageKey || item.imageUrl;
    item.deleteOne();
    await about.save();
    if (assetReference) {
      await deleteImageFromCloudflare(assetReference);
    }
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

app.put('/api/categories/:id/tile-image', upload.single('tileImage'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Brak identyfikatora kategorii' });
    }
    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Kategoria nie istnieje' });
    }

    const altRaw = Object.prototype.hasOwnProperty.call(req.body, 'alt') ? String(req.body.alt || '') : undefined;
    if (!req.file && altRaw === undefined) {
      return res.status(400).json({ error: 'Brak danych do aktualizacji' });
    }

    let previousAssetReference = null;
    if (req.file) {
      try {
        const uploadedImage = await uploadNormalizedImage(req.file, 'categories/tiles');
        previousAssetReference = category.tileImageKey || category.tileImageUrl;
        category.tileImageUrl = uploadedImage.url;
        category.tileImageKey = uploadedImage.key;
        category.tileImageData = '';
      } catch (uploadErr) {
        console.error('Błąd przesyłania zdjęcia kafelka kategorii do Cloudflare:', uploadErr);
        return res.status(500).json({ error: 'Nie udało się zapisać grafiki kategorii.' });
      }
      if (altRaw === undefined) {
        category.tileImageAlt = category.tileImageAlt || '';
      }
    }

    if (altRaw !== undefined) {
      category.tileImageAlt = altRaw.trim().slice(0, 180);
    }

    await category.save();
    invalidateCategoriesCache();
    if (previousAssetReference && previousAssetReference !== category.tileImageKey) {
      await deleteImageFromCloudflare(previousAssetReference);
    }

    res.json({
      _id: category._id,
      tileImageData: category.tileImageData,
      tileImageUrl: category.tileImageUrl,
      tileImageAlt: category.tileImageAlt
    });
  } catch (err) {
    console.error('Błąd zapisu grafiki kategorii:', err);
    res.status(500).json({ error: 'Nie udało się zapisać grafiki kategorii' });
  }
});

app.delete('/api/categories/:id/tile-image', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Brak identyfikatora kategorii' });
    }
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Kategoria nie istnieje' });
    }
    const assetReference = category.tileImageKey || category.tileImageUrl;
    category.tileImageData = '';
    category.tileImageUrl = '';
    category.tileImageKey = '';
    category.tileImageAlt = '';
    await category.save();
    invalidateCategoriesCache();
    if (assetReference) {
      await deleteImageFromCloudflare(assetReference);
    }
    res.json({ message: 'Grafika usunięta' });
  } catch (err) {
    console.error('Błąd usuwania grafiki kategorii:', err);
    res.status(500).json({ error: 'Nie udało się usunąć grafiki kategorii' });
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

    invalidatePickupTimeCache(dayIndex);

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
  pickupDate: { type: String, default: '' },
  pickupDayIndex: { type: Number, min: 0, max: 6 },
  createdAt: { type: Date, default: Date.now }
}));

const orderReportProductSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: false });

const orderReportEntrySchema = new mongoose.Schema({
  sequenceNumber: { type: Number },
  orderId: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  payment: { type: String, default: '' },
  paymentLabel: { type: String, default: '' },
  comment: { type: String, default: '' },
  pickupDate: { type: String, default: '' },
  discountCode: { type: String, default: '' },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalBeforeDiscount: { type: Number, default: 0 },
  totalAfterDiscount: { type: Number, default: 0 },
  createdAt: { type: Date },
  products: { type: [orderReportProductSchema], default: [] }
}, { _id: false });

const OrderReport = mongoose.model('OrderReport', new mongoose.Schema({
  reportDate: { type: String, required: true, unique: true },
  collectedAt: { type: Date, default: Date.now },
  sentAt: { type: Date },
  sentTo: { type: String, default: '' },
  emailSubject: { type: String, default: '' },
  emailStatus: { type: String, default: 'pending' },
  failureReason: { type: String, default: '' },
  lastFulfillmentDate: { type: String, default: '' },
  orders: { type: [orderReportEntrySchema], default: [] },
  totals: {
    ordersCount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 }
  }
}, { timestamps: true }));

app.post("/api/orders", async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const pickupDate = normalizeDateInput(req.body.pickupDate);
    if (!pickupDate) {
      return res.status(400).json({ error: 'Wybierz datę odbioru.' });
    }
    const pickupDayIndex = getDayIndexFromDateString(pickupDate);
    if (pickupDayIndex === null) {
      return res.status(400).json({ error: 'Nie można ustalić dnia tygodnia dla wybranej daty.' });
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

    const weeklyStockDocs = await ProductStock.find({ dayIndex: pickupDayIndex }).lean();
    const weeklyCapacityMap = new Map(weeklyStockDocs.map((doc) => [String(doc.productId), Math.max(0, Number(doc.capacity) || 0)]));

    // Reserve stock atomically for the selected day
    const insufficient = [];
    const reservations = [];
    for (const item of normalizedProducts) {
      const productId = String(item.id || '');
      const qty = Number(item.quantity) || 0;
      if (!productId || qty <= 0) continue;

      const fallbackCapacity = weeklyCapacityMap.get(productId) || 0;

      await ProductDailyStock.findOneAndUpdate(
        { productId, date: pickupDate },
        { $setOnInsert: { capacity: fallbackCapacity, reserved: 0 } },
        { upsert: true, new: true }
      );

      await ProductStock.findOneAndUpdate(
        { productId, dayIndex: pickupDayIndex },
        { $setOnInsert: { capacity: fallbackCapacity, reserved: 0 } },
        { upsert: true, new: true }
      );

      const reservedUpdate = await ProductDailyStock.findOneAndUpdate(
        { productId, date: pickupDate, $expr: { $lte: [{ $add: ['$reserved', qty] }, '$capacity'] } },
        { $inc: { reserved: qty } },
        { new: true }
      );
      if (!reservedUpdate) {
        insufficient.push(item.name || productId);
        break;
      }
      reservations.push({ productId, qty });
    }

    if (insufficient.length) {
      if (reservations.length) {
        await Promise.all(reservations.map((entry) => (
          ProductDailyStock.updateOne(
            { productId: entry.productId, date: pickupDate, reserved: { $gte: entry.qty } },
            { $inc: { reserved: -entry.qty } }
          )
        )));
      }
      return res.status(400).json({ error: `Brak wystarczającej ilości: ${insufficient.join(', ')} na wybrany dzień.` });
    }

    const order = new Order({
      email: typeof req.body.email === 'string' ? req.body.email : '',
      phone: typeof req.body.phone === 'string' ? req.body.phone : '',
      comment: typeof req.body.comment === 'string' ? req.body.comment : '',
      payment: typeof req.body.payment === 'string' ? req.body.payment : '',
      products: normalizedProducts,
      pickupDate,
      pickupDayIndex,
      discountCode,
      discountPercent,
      discountAmount,
      totalBeforeDiscount,
      totalAfterDiscount
    });

    const savedOrder = await order.save();
    res.json({ message: "Zamówienie zapisane", order: savedOrder });

    sendOrderConfirmationEmail(savedOrder.toObject());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Błąd zapisu zamówienia" });
  }
});

app.get('/api/settings/order-reports', (req, res) => {
  res.json(getDailyOrderReportSettings());
});

app.get('/api/order-reports', async (req, res) => {
  try {
    const limit = parsePositiveInteger(req.query.limit, 30);
    await purgeOldOrderReports();
    const reports = await OrderReport.find()
      .sort({ reportDate: -1 })
      .limit(limit)
      .lean();
    res.json(reports);
  } catch (err) {
    console.error('❌ Błąd pobierania zestawień zamówień:', err);
    res.status(500).json({ error: 'Nie udało się pobrać zestawień zamówień' });
  }
});

app.get('/api/order-reports/:reportDate', async (req, res) => {
  try {
    const reportDate = normalizeDateInput(req.params.reportDate);
    if (!reportDate) {
      return res.status(400).json({ error: 'Nieprawidłowa data zestawienia' });
    }
    const report = await OrderReport.findOne({ reportDate }).lean();
    if (!report) {
      return res.status(404).json({ error: 'Nie znaleziono zestawienia dla wskazanej daty' });
    }
    res.json(report);
  } catch (err) {
    console.error('❌ Błąd pobierania zestawienia zamówień:', err);
    res.status(500).json({ error: 'Nie udało się pobrać zestawienia zamówień' });
  }
});

app.delete('/api/order-reports/:reportDate', async (req, res) => {
  try {
    const reportDate = normalizeDateInput(req.params.reportDate);
    if (!reportDate) {
      return res.status(400).json({ error: 'Nieprawidłowa data zestawienia' });
    }
    const deleted = await OrderReport.findOneAndDelete({ reportDate }).lean();
    if (!deleted) {
      return res.status(404).json({ error: 'Nie znaleziono zestawienia do usunięcia' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Błąd usuwania zestawienia zamówień:', err);
    res.status(500).json({ error: 'Nie udało się usunąć zestawienia zamówień' });
  }
});

app.get('/api/orders/pickup/:pickupDate', async (req, res) => {
  try {
    const pickupDate = normalizeDateInput(req.params.pickupDate);
    if (!pickupDate) {
      return res.status(400).json({ error: 'Nieprawidłowa data odbioru' });
    }

    const orders = await Order.find({ pickupDate })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const mappedOrders = orders
      .map((order, index) => mapOrderToReportEntry(order, index))
      .filter(Boolean);
    const totals = summarizeOrdersForReport(mappedOrders);
    const pickupDates = mappedOrders
      .map((order) => normalizeDateInput(order.pickupDate))
      .filter((value) => typeof value === 'string' && value.length === 10);
    const lastFulfillmentDate = pickupDates.length
      ? pickupDates.reduce((latest, current) => (current > latest ? current : latest), pickupDates[0])
      : pickupDate;

    res.json({
      pickupDate,
      orders: mappedOrders,
      totals,
      lastFulfillmentDate
    });
  } catch (err) {
    console.error('❌ Błąd pobierania zamówień dla wybranej daty odbioru:', err);
    res.status(500).json({ error: 'Nie udało się pobrać zamówień dla tej daty' });
  }
});

app.post('/api/order-reports/run', async (req, res) => {
  try {
    const { date, password } = req.body || {};
    if (!password || password !== process.env.HOST_PASSWORD) {
      return res.status(401).json({ error: 'Brak autoryzacji do uruchomienia raportu' });
    }

    let referenceDate = new Date();
    if (date) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Nieprawidłowa data referencyjna' });
      }
      referenceDate = parsed;
    }

    await processDailyOrders(referenceDate);
    res.json({ success: true, message: 'Raport został przygotowany' });
  } catch (err) {
    console.error('❌ Błąd ręcznego uruchomienia raportu zamówień:', err);
    res.status(500).json({ error: 'Nie udało się uruchomić raportu' });
  }
});

// Usuń produkt
app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produkt nie istnieje' });
    }

    const assetReference = product.imageKey || product.imageUrl;
    const productName = typeof product.name === 'string' ? product.name.trim() : '';
    await product.deleteOne();
    invalidateProductsCache();
    await removeProductFromAvailability(productName);
    if (assetReference) {
      await deleteImageFromCloudflare(assetReference);
    }
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
function startServer() {
  return app.listen(port, () => {
    console.log(`🚀 Serwer działa na http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  createDailyOrdersEmailPayload,
  getDailyOrderReportSettings
};
