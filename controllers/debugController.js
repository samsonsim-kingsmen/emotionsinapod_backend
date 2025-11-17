import { debugS3Connectivity } from '../services/s3FileService.js';

export async function debugS3(req, res) {
  const data = await debugS3Connectivity();
  res.json(data);
}
