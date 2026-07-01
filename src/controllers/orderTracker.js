/**
 * Sends order data to your Webhook or Google Apps Script URL
 * @param {Object} orderData - The complete order object from your checkout
 */
async function sendOrderToSheets(orderData) {
    // Replace this string with your Make.com Webhook URL or your Google Apps Script Web App URL
    const TARGET_URL = 'https://script.google.com/macros/s/AKfycbyX04r9z_KvqtVpWW-Pq3hDWF4iPChPzv4Siwx2Z4vCQ0D1f137BXn0UnzcPSYnKJfQnw/exec';

    try {
        // 1. Format the cart items array into a single readable text string for the column
        const itemDetailsString = orderData.cartItems
            .map(item => `${item.quantity}x ${item.name} (${item.variant?.weight || 'Unit'})`)
            .join('\n'); // Separates each item with a clean line break inside the cell

        // 2. Map your application data cleanly to match your spreadsheet columns
        const payload = {
            invoiceNo: orderData.invoiceNo,
            name: orderData.customerName,
            phone: orderData.phone,
            email: orderData.email,
            address: orderData.address,
            details: itemDetailsString,
            total: `₹${orderData.totalAmount}`
        };

        // 3. Fire the secure POST request over standard HTTPS (Port 443)
        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("Order successfully pushed to Spreadsheet:", result);
        return true;

    } catch (error) {
        // We catch errors so that if Google or your webhook faces a temporary glitch, 
        // your entire server doesn't crash and the customer still sees their success page.
        console.error("Failed to log order to sheet, but continuing process:", error);
        return false;
    }
}