// middleware/upload.js
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 200 },
});

export default upload;
