const express = require('express');
const router = express.Router();
// Import the utility that reads specifically from your new Categories tab/sheet
// const { getCategoriesSheetData } = require('../services/sheetService'); 

router.get('/categories', async (req, res) => {
    try {
        // 1. Fetch rows from your dedicated categories sheet
        // const sheetRows = await getCategoriesSheetData(); 
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

        const CATEGORIES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJV34w0sNNlTN9Rf-UMPGMpF4LAQi0UiGu_3SLP6rUux_KbQ4mzyzoLX2yZ2fjZkxdhekA0giuCCet/pub?gid=577856047&single=true&output=csv';

        const categoriesResponse = await axios.get(CATEGORIES_CSV_URL);
        const sheetRows = await parseCsvString(categoriesResponse.data);

        const categoryMap = {};

        // 2. Map directly from the schema of your dedicated sheet
        sheetRows.forEach((row) => {
            const parentCatName = row.category_name || row.category || row.Category;
            const subCatName = row.sub_category_name || row.sub_category || row.subcategory || row.SubCategory;
            const imageSource = row.image_url || row.image || row.subcategory_image || row.ImageUrl;

            if (!parentCatName) return; // Skip empty structural rows

            const trimmedParent = parentCatName.trim();

            // Build parent category node if it hasn't been instantiated yet
            if (!categoryMap[trimmedParent]) {
                categoryMap[trimmedParent] = {
                    category_name: trimmedParent,
                    // If your sheet has a specific column for parent images, use it here, 
                    // otherwise it gracefully defaults to the current row's image
                    category_image: row.category_image || imageSource,
                    subcategories: {}
                };
            }

            // If this row specifies a subcategory, link it underneath the parent node
            if (subCatName && subCatName.trim() !== "") {
                const trimmedSub = subCatName.trim();

                if (!categoryMap[trimmedParent].subcategories[trimmedSub]) {
                    categoryMap[trimmedParent].subcategories[trimmedSub] = {
                        subcategory_name: trimmedSub,
                        subcategory_image: imageSource
                    };
                }
            }

        });

        return res.status(200).json({
            success: true,
            data: categoryMap
        });
        console.log(categoryMap); // Debugging: Log the evolving category map structure


    } catch (error) {
        console.error("Error parsing dedicated categories sheet:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to process structural categories sheet."
        });
    }
});

module.exports = router;