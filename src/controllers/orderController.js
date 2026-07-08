const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');

exports.createOrder = async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData.customer || !orderData.items || orderData.items.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid order data." });
        }

        // Compute per-item APMC and GST using rates provided on each item.
        // For each item: apmcAmount = subtotal * (apmc%/100)
        // then gstAmount = (subtotal + apmcAmount) * (gst%/100)
        const items = orderData.items.map((item) => {
            const quantity = Number(item.quantity ?? 0);
            const price = Number(item.variant?.price ?? 0);
            const baseSubtotal = price * quantity;

            const apmcRate = parseFloat(item.apmc ?? item.apmc === 0 ? item.apmc : 0) || 0;
            const gstRate = parseFloat(item.gst ?? item.gst === 0 ? item.gst : 0) || 0;

            const apmcAmount = Math.round(baseSubtotal * (apmcRate / 100) * 100) / 100;
            const gstAmount = Math.round((baseSubtotal + apmcAmount) * (gstRate / 100) * 100) / 100;

            const itemTotal = Math.round((baseSubtotal + apmcAmount + gstAmount) * 100) / 100;

            return {
                ...item,
                variant: item.variant ?? {},
                quantity,
                itemSubtotal: baseSubtotal,
                apmcAmount,
                gstAmount,
                itemTotal,
                appliedRates: { apmcRate, gstRate }
            };
        });

        const subtotal = Math.round(items.reduce((total, item) => total + (item.itemSubtotal || 0), 0) * 100) / 100;
        const apmcTotal = Math.round(items.reduce((total, item) => total + (item.apmcAmount || 0), 0) * 100) / 100;
        const gstTotal = Math.round(items.reduce((total, item) => total + (item.gstAmount || 0), 0) * 100) / 100;
        const grandTotal = Math.round((subtotal + apmcTotal + gstTotal) * 100) / 100;

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

        return res.status(200).json({
            success: true,
            message: "Order initiated successfully. Redirecting to WhatsApp to finalize.",
            whatsappLink: whatsappLink
        });
    } catch (error) {
        console.error("Error creating order:", error);
        return res.status(500).json({ success: false, message: "Failed to create order." });
    }
};