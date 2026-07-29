import express from 'express';
import cors from 'cors';
import { config } from './config';
import { connectDatabase } from './db/mongoose';
import smsWebhookRoutes from './routes/smsWebhook';
import productRoutes from './routes/products';
import transactionRoutes from './routes/transactions';
import escrowRoutes from './routes/escrow';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bitimax-api', version: '1.0.0' });
});

app.use('/api', smsWebhookRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/escrow', escrowRoutes);

async function start() {
  await connectDatabase();

  app.listen(config.port, () => {
    console.log(`[Server] Bitimax API running on port ${config.port}`);
    console.log(`[Server] SMS Webhook: POST /api/sms-webhook`);
    console.log(`[Server] Products API: GET /api/products`);
    console.log(`[Server] Transactions API: GET /api/transactions`);
    console.log(`[Server] Escrow API: GET /api/escrow`);
  });
}

start().catch(console.error);

export default app;
