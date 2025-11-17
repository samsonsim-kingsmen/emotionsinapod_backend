import { uploadVideoToS3 } from '../services/s3FileService.js';

export async function uploadVideo(req, res) {
  try {
    const source = req.get('X-Client-Source');
    if (source !== 'stickers-recorder') {
      return res.status(400).json({ error: 'Invalid upload source' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    if (!req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'File must be a video.' });
    }

    const result = await uploadVideoToS3(req.file);
    res.json({ message: 'Upload successful', ...result, source });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
}
