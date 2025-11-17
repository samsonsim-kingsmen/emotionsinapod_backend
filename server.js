// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import router from './routes/index.js';

const app = express();

app.use(cors());
app.use('/', router);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ S3 uploader running on http://localhost:${PORT}`);
});
