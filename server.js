
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const { Readable } = require('stream');
const csv = require('csv-parser');
const axios = require('axios'); // Added missing axios import
const orderRouter = require('./src/routes/orderRoutes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/orders', orderRouter);

const allowOrigins = [
    'http://localhost:5173',
    'http://localhost:5000',
    'https://dryfruitmandifrontend.vercel.app',
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            console.error(`CORS Blocked for Origin: ${origin}`);
            callback(new Error('Not allowed by CORS policy'));
        }
    }
}));

app.use(express.json());

// Main shared Google Sheets Published CSV link
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJV34w0sNNlTN9Rf-UMPGMpF4LAQi0UiGu_3SLP6rUux_KbQ4mzyzoLX2yZ2fjZkxdhekA0giuCCet/pub?output=csv';

// 1. Added 'async' here so 'await' works inside the controller context
app.get('/api/products', async (req, res) => {
    try {
        // Download the live CSV data straight from Google Sheets
        const response = await axios.get(GOOGLE_SHEET_CSV_URL);
        const results = [];

        // Stream and parse the CSV string into javascript objects
        const stream = Readable.from([response.data]);

        stream.pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
                const productsMap = {};
                const categories = new Set(); 

                // 2. Changed 'rows.forEach' to 'results.forEach' to parse the loaded array
                results.forEach(row => {
                    if (!row.id || !row.product_name) return; // Guard against empty trailing cells

                    const categoryName = row.category ? row.category.trim() : "Uncategorized";
                    categories.add(categoryName);

                    const id = row.id.trim();

                    if (!productsMap[id]) {
                        productsMap[id] = {
                            id: id,
                            name: row.product_name.trim(),
                            category: categoryName,
                            apmc: row.apmc ? row.apmc.trim() : "0",
                            gst: row.gst ? row.gst.trim() : "0",
                            variants: []
                        };
                    }

                    // Append the specific variant parameters to the wrapper entity
                    productsMap[id].variants.push({
                        weight: row.weight ? row.weight.trim() : "",
                        price: row.price ? Number(row.price) : 0
                    });
                });

                // Send clean JSON array payload directly back to your frontend framework
                res.json({
                    categories: Array.from(categories),
                    products: Object.values(productsMap)
                });
            });
    } catch (error) {
        console.error("Sync failure error details:", error.message);
        res.status(500).json({ error: "Failed to sync inventory with Google Sheets live cloud endpoint." });
    }
});

// Start the server directly from this active file process instance
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});