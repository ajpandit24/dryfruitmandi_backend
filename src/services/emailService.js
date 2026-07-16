process.stdout.isTTY = true;

const nodemailer = require('nodemailer');


// Configure your primary mail courier link
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.EMAIL_PORT || '465', 10),
    secure: false, // true for port 465, false for port 587
    auth: {
        // Your Brevo login (usually your registered account email)
        user: process.env.EMAIL_USER || 'your-brevo-login-email@example.com',
        // Your master SMTP Key generated from the Brevo SMTP & API tab
        pass: process.env.EMAIL_PASS || 'xsmtpsib-xxxxxxxxxxxxxxxxxxxxxxxx'
    },

    connectionTimeout: 10000, // 10 seconds max wait time to connect
    greetingTimeout: 10000,   // 10 seconds max wait for SMTP greeting
    socketTimeout: 15000,
    // Optional: Force TLS connection routing safety
    tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
    }
});

exports.sendOrderEmail = async (invoicePayload) => {
    // console.log("!!! FUNCTION EXECUTED ON LIVE SERVER !!!", JSON.stringify(invoicePayload?.customer));
    
console.log("--- INITIALIZING TRANS-PORT DEPLOYMENT PARAMS ---");
console.log("Brevo Host Agent:", process.env.EMAIL_HOST || 'smtp-relay.brevo.com');
console.log("Brevo User Account:", process.env.EMAIL_USER, process.env.EMAIL_PORT);
    const {
        invoiceId = `INV-${Date.now()}`,
        invoiceDate = new Date().toLocaleDateString(),
        customer = {},
        items = [],
        financials = { subtotal: 0, gstTotal: 0, apmcTotal: 0, grandTotal: 0 }
    } = invoicePayload;

    // Build the list item table structures line-by-line
    let tableRowsHtml = '';
    items.forEach((item, index) => {
        const itemPrice = Number(item.variant?.price ?? 0);
        const itemPriceWithGST = itemPrice + (itemPrice * (parseFloat(item.gst || "0") / 100)) + (itemPrice * (parseFloat(item.apmc || "0") / 100));
        const itemSubtotal = Number(item.itemSubtotal ?? itemPriceWithGST * Number(item.quantity ?? 0)); 

        tableRowsHtml += `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td style="padding: 10px; font-size: 13px; color: #2d3748; text-align: center;">${index + 1}</td>
                <td style="padding: 10px; font-size: 13px; color: #2d3748;">
                    <div style="font-weight: 600;">${item.name ?? 'Product'}</div>
                    <div style="font-size: 11px; color: #718096; margin-top: 2px;">Weight: ${item.variant?.weight || 'N/A'}</div>
                </td>
                <td style="padding: 10px; font-size: 13px; color: #2d3748; text-align: center;">${item.quantity ?? 0}</td>
                <td style="padding: 10px; font-size: 13px; color: #2d3748; text-align: right;">₹${itemPriceWithGST.toFixed(2)}</td>
                <td style="padding: 10px; font-size: 13px; color: #1a202c; text-align: right; font-weight: 600;">₹${itemSubtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    const emailTemplateHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        
        <div style="border-bottom: 3px solid #059669; padding-bottom: 12px; margin-bottom: 20px;">
            <table style="width: 100%;">
                <tr>
                    <td>
                        <h1 style="margin: 0; color: #059669; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DRY FRUITS MANDI</h1>
                        <p style="margin: 3px 0; font-size: 12px; color: #4a5568; font-weight: bold;">A Unit of Ananya Enterprises</p>
                        <p style="margin: 1px 0; font-size: 11px; color: #718096;">Wholesale | Retail | Bulk Orders</p>
                    </td>
                    <td style="text-align: right; vertical-align: bottom;">
                        <h2 style="margin: 0; color: #1a202c; font-size: 20px; font-weight: 700;">TAX INVOICE</h2>
                        <p style="margin: 4px 0 0 0; font-size: 12px; color: #4a5568;"><strong>Invoice:</strong> ${invoiceId}</p>
                        <p style="margin: 2px 0 0 0; font-size: 12px; color: #4a5568;"><strong>Dated:</strong> ${invoiceDate}</p>
                    </td>
                </tr>
            </table>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; line-height: 1.5; color: #4a5568;">
            <tr>
                <td style="width: 50%; vertical-align: top; padding-right: 15px;">
                    <strong style="color: #1a202c; font-size: 13px; display: block; margin-bottom: 4px;">Corporate Office Address:</strong>
                    <strong>M/s. Ananya Enterprises</strong><br/>
                    K-53, Mudi Bazar, Phase-II Market-1, Sector-19,<br/>
                    Vashi APMC, Navi Mumbai - 400703<br/>
                    <span style="display: inline-block; margin-top: 4px;"><strong>GSTIN:</strong> 27YNPG2775M1ZS</span><br/>
                    <span><strong>FSSAI:</strong> 11518012000070</span>
                </td>
                <td style="width: 50%; vertical-align: top; background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px;">
                    <strong style="color: #1a202c; font-size: 13px; display: block; margin-bottom: 4px;">Invoiced To (Customer):</strong>
                    <div style="font-weight: 700; color: #2d3748; margin-bottom: 2px;">${customer.name}</div>
                    <div><strong>WhatsApp:</strong> +${customer.phone}</div>
                    <div><strong>Email:</strong> ${customer.email}</div>
                    <div><strong>GSTIN:</strong> ${customer.gst}</div>
                    <div><strong>FSSAI:</strong> ${customer.fssai}</div>
                    <div style="margin-top: 4px;"><strong>Delivery Address:</strong></div>
                    <div style="margin-top: 2px; padding: 8px; background-color: #edf2f7; border-radius: 4px; border: 1px solid #e2e8f0; color: #2d3748;">
                        ${customer.address}
                    </div>
                </td>
            </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
                <tr style="background-color: #059669; color: #ffffff;">
                    <th style="padding: 10px; font-size: 11px; font-weight: 700; border: 1px solid #059669; text-align: center; width: 35px;">Sr No</th>
                    <th style="padding: 10px; font-size: 11px; font-weight: 700; border: 1px solid #059669; text-align: left;">Product Description</th>
                    <th style="padding: 10px; font-size: 11px; font-weight: 700; border: 1px solid #059669; text-align: center; width: 45px;">Qty</th>
                    <th style="padding: 10px; font-size: 11px; font-weight: 700; border: 1px solid #059669; text-align: right; width: 90px;">Rate</th>
                    <th style="padding: 10px; font-size: 11px; font-weight: 700; border: 1px solid #059669; text-align: right; width: 110px;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${tableRowsHtml}
            </tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td style="width: 50%; vertical-align: top; padding-right: 20px;">
                    <div style="border: 1px dashed #cbd5e0; border-radius: 6px; padding: 12px; background-color: #fafafa; font-size: 12px;">
                        <strong style="color: #2d3748; display: block; margin-bottom: 5px; text-transform: uppercase; font-size: 11px;">Our Settlement Banking Channels:</strong>
                        <div style="margin: 2px 0;"><strong>Account Holder Name:</strong> Ananya Enterprises</div>
                        <div style="margin: 2px 0;"><strong>Bank Account Name:</strong> Kotak Mahindra Bank</div>
                        <div style="margin: 2px 0;"><strong>Account Number:</strong> 0246207621</div>
                        <div style="margin: 2px 0;"><strong>IFSC Routing Code:</strong> KKBK0001370</div>
                        <div style="margin: 2px 0;"><strong>Account Type:</strong> Current Account (Vashi Branch)</div>
                        <div style="margin: 6px 0 0 0; padding-top: 4px; border-top: 1px solid #e2e8f0; color: #059669; font-weight: bold;">
                            GPay / PhonePe No: 77109 45676 (Hiralal Gupta)
                        </div>
                    </div>
                </td>
                <td style="width: 50%; vertical-align: top;">
                    <table style="width: 100%; font-size: 13px; color: #4a5568; line-height: 1.7;">
                        <tr>
                            <td style="text-align: left; padding: 3px 0;">Subtotal Total:</td>
                            <td style="text-align: right; padding: 3px 0; font-weight: 600; color: #2d3748;">₹${financials.subtotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="text-align: left; padding: 3px 0;">CGST + SGST:</td>
                            <td style="text-align: right; padding: 3px 0; color: #e53e3e;">+ ₹${financials.gstTotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="text-align: left; padding: 3px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">APMC Market Cess Fee:</td>
                            <td style="text-align: right; padding: 3px 0; color: #e53e3e; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">+ ₹${financials.apmcTotal.toFixed(2)}</td>
                        </tr>
                        <tr style="font-size: 16px; color: #1a202c; font-weight: bold;">
                            <td style="text-align: left; padding-top: 8px;">Grand Total:</td>
                            <td style="text-align: right; padding-top: 8px; color: #059669; font-size: 18px;">₹${financials.grandTotal.toFixed(2)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #718096; line-height: 1.5;">
            <strong style="color: #4a5568; display: block; margin-bottom: 2px;">TERMS & CONDITIONS:</strong>
            <ol style="margin: 0; padding-left: 15px; color: #718096;">
                <li>100% payment against invoice clearance.</li>
                <li>Any shortage/damage should be reported within 24 hours of delivery.</li>
                <li>Interest at 18% p.a. is applicable on delayed payments.</li>
                <li>Subject to Navi Mumbai Jurisdiction.</li>
            </ol>
            <p style="margin: 8px 0 0 0; text-align: center; font-style: italic; color: #a0aec0; border-top: 1px dashed #edf2f7; padding-top: 8px;">
                Declaration: This automated summary acts as our formal order evaluation document. Thank you for your business.
            </p>
        </div>
    </div>
    `;

    try {
        const mailOptions = {
            from: `"DryFruits Mandi" <${process.env.EMAIL_FROM || 'your-verified-domain@example.com'}>`,
            // Deliveries to customer and yourself simultaneously
            to: [customer.email, process.env.EMAIL_ADMIN || 'your-brevo-login-email@example.com'], 
            subject: `Tax Invoice Confirmation Request ${invoiceId} - ${customer.name}`,
            html: emailTemplateHtml
        };

        // --- FIXED: Added await here so the promise resolves before returning ---
        const info = await transporter.sendMail(mailOptions);
        
        console.log('Email sent successfully via Brevo Relay ID:', info.messageId);
        return { success: true, messageId: info.messageId };
        
    } catch (err) {
        // --- FIXED: Changed error.message to err.message to avoid ReferenceError ---
        console.error('Nodemailer relay error:', err.message);
        return { success: false, error: err.message };
    }
};