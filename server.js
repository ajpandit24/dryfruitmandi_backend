const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const { Readable } = require('stream');
const csv = require('csv-parser');
const axios = require('axios');
const orderRouter = require('./src/routes/orderRoutes');

const app = express();

app.use(helmet());

const allowOrigins = [
    'http://localhost:5173',
    'http://localhost:5000',
    'https://dryfruitmandifrontend.vercel.app',
    'https://www.dryfruitsmandi.com',
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
app.use('/api/orders', orderRouter);

// --- GOOGLE SHEETS LIVE PUBLISHED CSV LINKS ---
// Sheet 1: Products
const PRODUCTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJV34w0sNNlTN9Rf-UMPGMpF4LAQi0UiGu_3SLP6rUux_KbQ4mzyzoLX2yZ2fjZkxdhekA0giuCCet/pub?gid=0&single=true&output=csv';
// Sheet 2: Categories (Paste your published CSV link for Sheet 2 here)
const CATEGORIES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJV34w0sNNlTN9Rf-UMPGMpF4LAQi0UiGu_3SLP6rUux_KbQ4mzyzoLX2yZ2fjZkxdhekA0giuCCet/pub?gid=577856047&single=true&output=csv';

// Helper function to turn a downloaded CSV string response into an array of row objects
const parseCsvString = (csvData) => {
    return new Promise((resolve, reject) => {
        const results = [];
        Readable.from([csvData])
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

app.get('/api/products', async (req, res) => {
    try {
        console.log("--- Fetching data from Google Sheets ---");
        const [productsResponse, categoriesResponse] = await Promise.all([
            axios.get(PRODUCTS_CSV_URL),
            axios.get(CATEGORIES_CSV_URL)
        ]);

        const rawProducts = await parseCsvString(productsResponse.data);
        const rawCategories = await parseCsvString(categoriesResponse.data);

        // DEBUG LOGS: Check if rows are actually downloading
        console.log(`Downloaded ${rawProducts.length} product rows.`);
        console.log(`Downloaded ${rawCategories.length} category rows.`);
        
        if (rawCategories.length > 0) {
            console.log("Sample Category Row Keys:", Object.keys(rawCategories[0]));
            console.log("Sample Category Row Data:", rawCategories[0]);
        }
        if (rawProducts.length > 0) {
            console.log("Sample Product Row Keys:", Object.keys(rawProducts[0]));
        }

        const nestedCategoriesMap = {};

        // Pass 1: Build categories map
        rawCategories.forEach((row, index) => {
            // Trim keys in case there are accidental trailing spaces in the headers
            const categoryKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category');
            const imageKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category_image');

            if (!categoryKey || !row[categoryKey]) {
                console.log(`Skipping category row ${index + 2} due to missing category header/value`);
                return;
            }

            const categoryName = row[categoryKey].trim();
            const categoryImage = imageKey && row[imageKey] ? row[imageKey].trim() : "";

            if (!nestedCategoriesMap[categoryName]) {
                nestedCategoriesMap[categoryName] = {
                    category_name: categoryName,
                    category_image: categoryImage !== "" ? categoryImage : "https://dummyimage.com/400x400/f5f5f5/000&text=No+Image",
                    subcategories: {}
                };
            }
        });

        // Pass 2: Map products
        rawProducts.forEach((row, index) => {
            // Flexible lookup to bypass case-sensitivity issues
            const idKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'id');
            const nameKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'product_name');
            const catKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category');
            const subCatKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'sub_category');

            if (!idKey || !nameKey || !row[idKey] || !row[nameKey]) {
                return; // Guard against blank product rows
            }

            const id = row[idKey].trim();
            const productName = row[nameKey].trim();
            const categoryName = catKey && row[catKey] ? row[catKey].trim() : "Uncategorized";
            const subCategoryName = subCatKey && row[subCatKey] ? row[subCatKey].trim() : "General";

            if (!nestedCategoriesMap[categoryName]) {
                nestedCategoriesMap[categoryName] = {
                    category_name: categoryName,
                    category_image: "https://dummyimage.com/400x400/f5f5f5/000&text=No+Image",
                    subcategories: {}
                };
            }

            if (!nestedCategoriesMap[categoryName].subcategories[subCategoryName]) {
                nestedCategoriesMap[categoryName].subcategories[subCategoryName] = [];
            }

            let existingProduct = nestedCategoriesMap[categoryName].subcategories[subCategoryName].find(p => p.id === id);

            if (!existingProduct) {
                const imgKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'image');
                const apmcKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'apmc');
                const gstKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'gst');

                existingProduct = {
                    id: id,
                    name: productName,
                    image_url: imgKey && row[imgKey] ? row[imgKey].trim() : 'https://dummyimage.com/550x700/f5f5f5/000',
                    apmc: apmcKey && row[apmcKey] ? row[apmcKey].trim() : "0",
                    gst: gstKey && row[gstKey] ? row[gstKey].trim() : "0",
                    variants: []
                };
                nestedCategoriesMap[categoryName].subcategories[subCategoryName].push(existingProduct);
            }

            const weightKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'weight');
            const priceKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'price');
            const origPriceKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'original_price');

            existingProduct.variants.push({
                weight: weightKey && row[weightKey] ? row[weightKey].trim() : "",
                price: priceKey && row[priceKey] ? Number(row[priceKey]) : 0,
                original_price: origPriceKey && row[origPriceKey] ? Number(row[origPriceKey]) : null
            });
        });

        console.log("Successfully built map keys:", Object.keys(nestedCategoriesMap));

        return res.status(200).json({
            success: true,
            data: nestedCategoriesMap
        });

    } catch (error) {
        console.error("Sync failure error details:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});