import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import PayOS from '@payos/node';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Đọc thông số API từ Environment Variables
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID || "b6eb31bc-36fc-4551-afc1-e80171919f83";
const PAYOS_API_KEY = process.env.PAYOS_API_KEY || "0d064a87-f636-493a-86ab-feefaa0ca50b";
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || "2305363ba55f247a9d32d85d53c07f04529796ff731a360d2c9b0f7a3457e3e2";

const payOS = new PayOS(PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY);

const ordersDatabase = {};

app.get('/', (req, res) => {
    res.send('PayOS Server đang hoạt động!');
});

// 1. API Tạo Mã QR Thanh Toán
app.post('/api/create-payment', async (req, res) => {
    try {
        const { amount } = req.body;
        const orderCode = Number(String(Date.now()).slice(-6));

        const paymentBody = {
            orderCode: orderCode,
            amount: amount,
            description: `NAP ${orderCode}`,
            cancelUrl: 'http://localhost:3000/cancel.html',
            returnUrl: 'http://localhost:3000/success.html'
        };

        ordersDatabase[orderCode] = {
            amount: amount,
            status: 'PENDING',
            createdAt: new Date()
        };

        const paymentLinkRes = await payOS.createPaymentLink(paymentBody);

        return res.json({
            success: true,
            orderCode: orderCode,
            checkoutUrl: paymentLinkRes.checkoutUrl,
            qrCode: paymentLinkRes.qrCode
        });

    } catch (error) {
        console.error("Lỗi tạo thanh toán PayOS:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Không thể tạo liên kết thanh toán"
        });
    }
});

// 2. WEBHOOK RECEIVER (Nhận thông báo từ PayOS)
app.post('/api/payos-webhook', (req, res) => {
    try {
        const webhookData = payOS.verifyPaymentWebhookData(req.body);
        console.log(">>> [WEBHOOK] Nhận dữ liệu thanh toán:", webhookData);

        const orderCode = webhookData.orderCode;
        const code = webhookData.code;

        if (code === '00' && ordersDatabase[orderCode]) {
            ordersDatabase[orderCode].status = 'PAID';
            ordersDatabase[orderCode].paidAt = new Date();
            console.log(`✅ [THÀNH CÔNG] Đơn #${orderCode} đã được cộng +${webhookData.amount}đ!`);
        }

        return res.json({ success: true, message: "Webhook processed successfully" });

    } catch (error) {
        console.error("Lỗi xác thực Webhook:", error.message);
        return res.status(400).json({ success: false, message: "Invalid Webhook Signature" });
    }
});

// 3. API Quét Trạng Thái Chuyển Khoản
app.get('/api/check-order-status', (req, res) => {
    const { orderCode } = req.query;

    if (ordersDatabase[orderCode]) {
        return res.json({
            orderCode: orderCode,
            status: ordersDatabase[orderCode].status,
            amount: ordersDatabase[orderCode].amount
        });
    } else {
        return res.json({ status: 'NOT_FOUND' });
    }
});

// Chạy Server kết nối tới process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng: ${PORT}`);
});
