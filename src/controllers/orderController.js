const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');

exports.createOrder = async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData.customer || !orderData.items || orderData.items.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid order data." });
        }

        await emailService.sendOrderEmail(orderData);

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