process.stdout.isTTY = true; // Forces Render to flush logs instantly
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const { Readable } = require('stream');
const csv = require('csv-parser');
const axios = require('axios');
const orderRouter = require('./src/routes/orderRoutes');
const NodeCache = require("node-cache");

const app = express();

app.use(helmet());

// --- ADDED MIDDLEWARE: Live Request Logger ---
// This guarantees you see exactly what endpoints your frontend hits in the Render console
app.use((req, res, next) => {
    console.log(`[LIVE INCOMING]: ${req.method} ${req.originalUrl} from ${req.headers.origin || 'Unknown'}`);
    next();
});

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

// Main Orders Routing Line (All /api/orders/* requests stream safely down this lane)
app.use('/api/orders', orderRouter);

// ==========================================
// GOOGLE SHEETS LIVE PUBLISHED CSV LINKS
// ==========================================
const PRODUCTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJV34w0sNNlTN9Rf-UMPGMpF4LAQi0UiGu_3SLP6rUux_KbQ4mzyzoLX2yZ2fjZkxdhekA0giuCCet/pub?gid=0&single=true&output=csv';
const CATEGORIES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJV34w0sNNlTN9Rf-UMPGMpF4LAQi0UiGu_3SLP6rUux_KbQ4mzyzoLX2yZ2fjZkxdhekA0giuCCet/pub?gid=577856047&single=true&output=csv';

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

// ==========================================
// DEDICATED STANDALONE CATEGORIES ENDPOINT
// ==========================================
app.get('/api/categories', async (req, res) => {
    try {
        console.log("--- Fetching structural categories from Sheet ---");
        const categoriesResponse = await axios.get(CATEGORIES_CSV_URL);
        const rawCategories = await parseCsvString(categoriesResponse.data);

        const categoriesMap = {};

        rawCategories.forEach((row) => {
            const catKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category');
            const subCatKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'sub_category' || k.trim().toLowerCase() === 'subcategory');
            const imageKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category_image' || k.trim().toLowerCase() === 'image_url');

            if (!catKey || !row[catKey]) return;

            const categoryName = row[catKey].trim();
            const subCategoryName = subCatKey && row[subCatKey] ? row[subCatKey].trim() : "";
            const imageSource = imageKey && row[imageKey] ? row[imageKey].trim() : "https://dummyimage.com/400x400/f5f5f5/000&text=Ananya+Enterprises";

            if (!categoriesMap[categoryName]) {
                categoriesMap[categoryName] = {
                    category_name: categoryName,
                    category_image: imageSource,
                    subcategories: {}
                };
            }

            if (subCategoryName && subCategoryName !== "") {
                if (!categoriesMap[categoryName].subcategories[subCategoryName]) {
                    categoriesMap[categoryName].subcategories[subCategoryName] = {
                        subcategory_name: subCategoryName,
                        subcategory_image: imageSource
                    };
                }
            }
        });

        return res.status(200).json({ success: true, data: categoriesMap });
    } catch (error) {
        console.error("Error loading categories map:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// OPTIMIZED PAGINATED PRODUCTS ENDPOINT
// ==========================================

const productCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
app.get('/api/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const categoryFilter = req.query.category;
        const subcategoryFilter = req.query.subcategory;
        const shopByFilter = req.query.shop_by; // 1. Extracted from query

        let finalProductList = productCache.get("all_processed_products");

        console.log("--- Fetching data from Google Sheets ---");
        if (!finalProductList) {
            console.log("--- Cache Miss: Fetching fresh data from Google Sheets ---");
            const [productsResponse, categoriesResponse] = await Promise.all([
                axios.get(PRODUCTS_CSV_URL),
                axios.get(CATEGORIES_CSV_URL)
            ]);

        const rawProducts = await parseCsvString(productsResponse.data);
        const rawCategories = await parseCsvString(categoriesResponse.data);

        const nestedCategoriesMap = {};

        rawCategories.forEach((row) => {
            const categoryKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category');
            const imageKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category_image');

            if (!categoryKey || !row[categoryKey]) return;

            const categoryName = row[categoryKey].trim();
            const categoryImage = imageKey && row[imageKey] ? row[imageKey].trim() : "";

            if (!nestedCategoriesMap[categoryName]) {
                nestedCategoriesMap[categoryName] = {
                    category_name: categoryName,
                    category_image: categoryImage !== "" ? categoryImage : "https://dummyimage.com/400x400/f5f5f5/000&text=Ananya+Enterprises",
                    subcategories: {}
                };
            }
        });

        rawProducts.forEach((row) => {
            const idKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'id');
            const nameKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'product_name');
            const catKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category');
            const subCatKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'sub_category');
            const shopByKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'shop_by'); // Match column dynamically

            if (!idKey || !nameKey || !row[idKey] || !row[nameKey]) return;

            const id = row[idKey].trim();
            const productName = nameKey && row[nameKey] ? row[nameKey].trim() : "";
            const categoryName = catKey && row[catKey] ? row[catKey].trim() : "Uncategorized";
            const subCategoryName = subCatKey && row[subCatKey] ? row[subCatKey].trim() : "General";
            const shopByValue = shopByKey && row[shopByKey] ? row[shopByKey].trim() : ""; // Normalize sheet value

            if (!nestedCategoriesMap[categoryName]) {
                nestedCategoriesMap[categoryName] = {
                    category_name: categoryName,
                    category_image: "https://dummyimage.com/400x400/f5f5f5/000&text=Ananya+Enterprises",
                    subcategories: {}
                };
            }

            if (!nestedCategoriesMap[categoryName].subcategories[subCategoryName] || !Array.isArray(nestedCategoriesMap[categoryName].subcategories[subCategoryName])) {
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
                    shop_by: shopByValue, // 2. Store field value directly inside the dynamic object structure
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

            const rawPrice = priceKey && row[priceKey] ? Number(row[priceKey]) : 0;

            // 🛑 AVOID 0 PRICES: Skip pushing this variant if the price is missing or zero
            if (rawPrice <= 0) {
                return; // skips this row's variant profile
            }

            existingProduct.variants.push({
                weight: weightKey && row[weightKey] ? row[weightKey].trim() : "",
                price: rawPrice,
                original_price: origPriceKey && row[origPriceKey] ? Number(row[origPriceKey]) : null
            });
        });

        finalProductList = [];
            Object.keys(nestedCategoriesMap).forEach(catName => {
                const subcats = nestedCategoriesMap[catName].subcategories;
                Object.keys(subcats).forEach(subcatName => {
                    if (Array.isArray(subcats[subcatName])) {
                        subcats[subcatName].forEach(product => {
                            if (product.variants && product.variants.length > 0) { // filter out 0 price variants
                                finalProductList.push({
                                    ...product,
                                    category: catName,
                                    sub_category: subcatName
                                });
                            }
                        });
                    }
                });
            });

            // 2. Save to cache so the next user gets it instantly
            productCache.set("all_processed_products", finalProductList);
        } else {
            console.log("--- Cache Hit: Serving instantly from memory ---");
        }

        let filteredList = [...finalProductList];
        if (categoryFilter && categoryFilter !== 'All') {
            filteredList = filteredList.filter(p => p.category === categoryFilter);
        }
        if (subcategoryFilter && subcategoryFilter !== 'All') {
            filteredList = filteredList.filter(p => p.sub_category === subcategoryFilter);
        }
        if (shopByFilter && shopByFilter !== 'All') {
            filteredList = filteredList.filter(p => p.shop_by && p.shop_by.trim().toLowerCase() === shopByFilter.trim().toLowerCase());
        }

        const totalItems = filteredList.length;
        const totalPages = Math.ceil(totalItems / limit);
        const paginatedSlice = filteredList.slice((page - 1) * limit, page * limit);

        return res.status(200).json({
            success: true,
            pagination: { totalItems, totalPages, currentPage: page, limit, hasMore: page < totalPages },
            data: paginatedSlice
        });

    } catch (error) {
        console.error("Sync failure error details:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// SINGLE PRODUCT DETAILS ENDPOINT
// ==========================================
app.get('/api/products/:id', async (req, res) => {
    try {
        const targetId = req.params.id.trim();
        console.log(`--- Fetching details for Product ID: ${targetId} ---`);

        const productsResponse = await axios.get(PRODUCTS_CSV_URL);
        const rawProducts = await parseCsvString(productsResponse.data);

        const matchingRows = rawProducts.filter(row => {
            const idKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'id');
            return idKey && row[idKey].trim() === targetId;
        });

        if (matchingRows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found inside inventory matrix." });
        }

        const firstRow = matchingRows[0];
        const nameKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === 'product_name');
        const imgKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === 'image');
        const catKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === 'category');
        const subCatKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === 'sub_category');
        const apmcKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === 'apmc');
        const gstKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === 'gst');

        const productDetail = {
            id: targetId,
            name: nameKey && firstRow[nameKey] ? firstRow[nameKey].trim() : "Unnamed Product",
            image_url: imgKey && firstRow[imgKey] ? firstRow[imgKey].trim() : 'https://dummyimage.com/550x700/f5f5f5/000',
            category: catKey && firstRow[catKey] ? firstRow[catKey].trim() : "Uncategorized",
            sub_category: subCatKey && firstRow[subCatKey] ? firstRow[subCatKey].trim() : "General",
            apmc: apmcKey && firstRow[apmcKey] ? firstRow[apmcKey].trim() : "0",
            gst: gstKey && firstRow[gstKey] ? firstRow[gstKey].trim() : "0",
            variants: []
        };

        matchingRows.forEach(row => {
            const weightKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'weight');
            const priceKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'price');
            const origPriceKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'original_price');

            productDetail.variants.push({
                weight: weightKey && row[weightKey] ? row[weightKey].trim() : "",
                price: priceKey && row[priceKey] ? Number(row[priceKey]) : 0,
                originalPrice: origPriceKey && row[origPriceKey] ? Number(row[origPriceKey]) : null
            });
        });

        return res.status(200).json({
            success: true,
            data: productDetail
        });

    } catch (error) {
        console.error("Error pulling single product details:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ❌ REMOVED: app.post('/api/orders/submit') has been deleted here!
// Your submit handling belongs fully inside your src/routes/orderRoutes.js file.

const PORT = process.env.PORT || 10000; // Updated to Render's default binding port
app.listen(PORT, () => {
    // --- FIXED: Changed error log placeholder variable back to PORT ---
    console.log(`Server is running successfully on port ${PORT}`);
});

app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: "Dry Fruits Mandi API Gateway is fully operational!"
    });
});