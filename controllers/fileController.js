import { listRecentFiles } from '../services/s3FileService.js';

export async function getFiles(req, res) {
  try {
    const files = await listRecentFiles(5);
    res.json({ count: files.length, files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files', details: err.message });
  }
}
