const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Połączenie z MongoDB Atlas
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Połączono z MongoDB'))
  .catch(err => console.error(err));

// Modele
const Product = mongoose.model('Product', new mongoose.Schema({
  name: String,
  price: Number,
  desc: String
}));

// ENDPOINTY API

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
app.post('/api/products', async (req, res) => {
  console.log('BODY z frontendu:', req.body);
  try {
    const product = new Product(req.body);
    await product.save();
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd dodawania produktu' });
  }
});

// Start serwera
app.listen(port, () => {
  console.log(`🚀 Serwer działa na http://localhost:${port}`);
});
