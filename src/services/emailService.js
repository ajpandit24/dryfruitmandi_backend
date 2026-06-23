const nodeMailer = require('nodemailer');

const transporter = nodeMailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

exports.sendOrderEmail = async (orderData) => {
    const itemList = orderData.items.map(item => `${item.name} (${item.variant.weight}) x ${item.quantity} - ₹${item.variant.price * item.quantity}`).join('\n');
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: 'Order Confirmation',
        text: 
        `You have received a new order.\n\n` +
          `Customer Details:\n` +
          `Name: ${orderData.customer.name}\n` +
          `Email: ${orderData.customer.email}\n` +
          `Phone: ${orderData.customer.phone}\n\n` +
          `Items Ordered:\n${itemList}\n\n` +
          `Total Amount: $${orderData.totalAmount}`,
    };
    await transporter.sendMail(mailOptions);
};