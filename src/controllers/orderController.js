const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');

exports.createOrder = async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData.customer || !orderData.items || orderData.items.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid order data." });
        }

        const items = orderData.items.map((item) => {
            const quantity = Number(item.quantity ?? 0);
            const price = Number(item.variant?.price ?? 0);
            const priceWithGST = price + (price * (parseFloat(item.gst ?? "0") / 100)) + (price * (parseFloat(item.apmc ?? "0") / 100));
            return {
                ...item,
                variant: item.variant ?? {},
                quantity,
                itemSubtotal: priceWithGST * quantity,
            };
        });

        const subtotal = items.reduce((total, item) => total + item.itemSubtotal, 0);
        const gstTotal = Math.round(subtotal * 0.18 * 100) / 100;
        const apmcTotal = 0;
        const grandTotal = subtotal;

        const invoicePayload = {
            invoiceId: `INV-${Date.now()}`,
            invoiceDate: new Date().toLocaleDateString(),
            customer: orderData.customer,
            items,
            financials: {
                subtotal,
                gstTotal,
                apmcTotal,
                grandTotal,
            },
        };

        await emailService.sendOrderEmail(invoicePayload);

        // Generate WhatsApp link
        const whatsappLink = whatsappService.generateWhatsAppLink(orderData);

        return res.status(201).json({
            success: true,
            message: "Order initiated successfully. Redirecting to WhatsApp to finalize.",
            whatsappLink: whatsappLink
        });
    } catch (error) {
        console.error("Error creating order:", error);
        return res.status(500).json({ success: false, message: "Failed to create order." });
    }
};