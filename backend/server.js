import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5050;

// Enable CORS & Body Parsers
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount API Routes
app.use('/api', apiRoutes);

// Health Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'TRUETONE AI Deepfake & Audio Security API',
    timestamp: new Date().toISOString(),
    version: '2.4.0'
  });
});

// Serve frontend static build if available
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) {
      res.send('TRUETONE Backend API is running on Port ' + PORT);
    }
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🛡️ TRUETONE AI SECURITY BACKEND RUNNING ON PORT ${PORT}`);
  console.log(`📡 API Endpoints: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});
