// routes/index.js
import { Router } from 'express';
import upload from '../middleware/upload.js';

import { healthCheck } from '../controllers/healthController.js';
import { debugS3 } from '../controllers/debugController.js';
import { uploadVideo } from '../controllers/uploadController.js';
import { getFiles } from '../controllers/fileController.js';

const router = Router();

router.get('/health', healthCheck);
router.get('/debug/s3', debugS3);
router.post('/upload', upload.single('video'), uploadVideo);
router.get('/files', getFiles);

export default router;
