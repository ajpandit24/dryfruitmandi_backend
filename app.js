const express = require('express');
const cors = require('cors');
const orderRouter = require('./src/routes/orderRoutes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/orders', orderRouter);

module.exports = app;