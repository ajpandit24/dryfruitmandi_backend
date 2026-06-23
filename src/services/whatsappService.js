exports.generateWhatsAppLink = (orderData) => {
    const itemList = orderData.items.map(item => `${item.name} (${item.variant.weight}) x ${item.quantity} - ₹${item.variant.price * item.quantity}`).join('\n');
    const itemText = orderData.items.map(item => `${item.name} (${item.variant.weight}) x ${item.quantity}`).join(', '); 
        
    const message = `Hello, I would like to place an order for the following items:\n\n${itemList}\n\nTotal Amount: ₹${orderData.totalAmount}\n\nCustomer Details:\nName: ${orderData.customer.name}\nEmail: ${orderData.customer.email}\nPhone: ${orderData.customer.phone}`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappNumber = process.env.COMPANY_WHATSAPP_NUMBER; 
    return `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

    // Alternative simpler message format
    // const simpleMessage = `Hello, I would like to order: ${itemText}. Total: ₹${orderData.totalAmount}. My name is ${orderData.customer.name}, email: ${orderData.customer.email}, phone: ${orderData.customer.phone}`;
    // const encodedSimpleMessage = encodeURIComponent(simpleMessage);
    // return `https://wa.me/${whatsappNumber}?text=${encodedSimpleMessage}`;

};