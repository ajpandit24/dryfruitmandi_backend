process.stdout.isTTY = true;
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
app.get('/api/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const categoryFilter = req.query.category;
        const subcategoryFilter = req.query.subcategory;

        console.log("--- Fetching data from Google Sheets ---");
        const [productsResponse, categoriesResponse] = await Promise.all([
            axios.get(PRODUCTS_CSV_URL),
            axios.get(CATEGORIES_CSV_URL)
        ]);

        const rawProducts = await parseCsvString(productsResponse.data);
        const rawCategories = await parseCsvString(categoriesResponse.data);

        const nestedCategoriesMap = {};

        // Pass 1: Build base categories from dedicated sheet
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
                    subcategories: {} // This holds parsed flat arrays inside products endpoint processing tree
                };
            }
        });

        // Pass 2: Map products into structure safely
        rawProducts.forEach((row) => {
            const idKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'id');
            const nameKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'product_name');
            const catKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'category');
            const subCatKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'sub_category');

            if (!idKey || !nameKey || !row[idKey] || !row[nameKey]) return;

            const id = row[idKey].trim();
            const productName = row[nameKey].trim();
            const categoryName = catKey && row[catKey] ? row[catKey].trim() : "Uncategorized";
            const subCategoryName = subCatKey && row[subCatKey] ? row[subCatKey].trim() : "General";

            // SAFE FIX: If category doesn't exist, instantiate it, but DO NOT overwrite if it already exists!
            if (!nestedCategoriesMap[categoryName]) {
                nestedCategoriesMap[categoryName] = {
                    category_name: categoryName,
                    category_image: "https://dummyimage.com/400x400/f5f5f5/000&text=Ananya+Enterprises",
                    subcategories: {}
                };
            }

            // Ensure the subcategory container is a flat array for product accumulation
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

        // 3. Flatten out the tree into a simple list for processing slices
        let finalProductList = [];
        Object.keys(nestedCategoriesMap).forEach(catName => {
            const subcats = nestedCategoriesMap[catName].subcategories;
            Object.keys(subcats).forEach(subcatName => {
                if (Array.isArray(subcats[subcatName])) { // Verify it's a product group container
                    subcats[subcatName].forEach(product => {
                        finalProductList.push({
                            ...product,
                            category: catName,
                            sub_category: subcatName
                        });
                    });
                }
            });
        });

        // 4. Filter directly on the flat data stream
        if (categoryFilter && categoryFilter !== 'All') {
            finalProductList = finalProductList.filter(p => p.category === categoryFilter);
        }
        if (subcategoryFilter && subcategoryFilter !== 'All') {
            finalProductList = finalProductList.filter(p => p.sub_category === subcategoryFilter);
        }

        // 5. Slice limits for pagination chunks
        const totalItems = finalProductList.length;
        const totalPages = Math.ceil(totalItems / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedSlice = finalProductList.slice(startIndex, endIndex);

        return res.status(200).json({
            success: true,
            pagination: {
                totalItems,
                totalPages,
                currentPage: page,
                limit,
                hasMore: page < totalPages
            },
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

        // Pull fresh product sheets data
        const productsResponse = await axios.get(PRODUCTS_CSV_URL);
        const rawProducts = await parseCsvString(productsResponse.data);

        // Filter out rows matching our target ID
        const matchingRows = rawProducts.filter(row => {
            const idKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'id');
            return idKey && row[idKey].trim() === targetId;
        });

        if (matchingRows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found inside inventory matrix." });
        }

        // Construct the single consolidated item object with its variants
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

        // Populate variants from all matching rows
        matchingRows.forEach(row => {
            const weightKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'weight');
            const priceKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'price');
            const origPriceKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'original_price');

            productDetail.variants.push({
                weight: weightKey && row[weightKey] ? row[weightKey].trim() : "",
                price: priceKey && row[priceKey] ? Number(row[priceKey]) : 0,
                originalPrice: origPriceKey && row[origPriceKey] ? Number(row[origPriceKey]) : null // camelCase to match your frontend code!
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

app.post('/api/orders/submit', async (req, res) => {
    const orderData = req.body; 
    res.status(200).json({ success: true, message: "Order processed successfully!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${process.env.EMAIL_FROM || 5000}`);

});