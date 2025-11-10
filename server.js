// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
app.use(cors());

// ===== Multer: keep file in memory for streaming to S3 =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 200, // 200MB limit — adjust as needed
  },
});

// ===== S3 client =====
const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

const BUCKET = process.env.S3_BUCKET;
const PREFIX = 'uploads/'; // ✅ Only read/write inside "uploads" folder

// ===== Health check =====
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ===== S3 connectivity diagnostics =====
app.get('/debug/s3', async (_req, res) => {
  const result = {
    region: process.env.AWS_REGION,
    bucket: BUCKET,
    steps: [],
  };

  try {
    const head = await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    result.steps.push({
      step: 'HeadBucket',
      ok: true,
      httpStatus: head?.$metadata?.httpStatusCode || null,
    });
  } catch (err) {
    result.steps.push({
      step: 'HeadBucket',
      ok: false,
      code: err?.name,
      message: err?.message,
      httpStatus: err?.$metadata?.httpStatusCode || null,
    });
  }

  try {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX, // ✅ restrict listing to uploads/
        MaxKeys: 5,
      })
    );
    result.steps.push({
      step: 'ListObjectsV2',
      ok: true,
      httpStatus: list?.$metadata?.httpStatusCode,
      count: (list?.Contents || []).length,
      keys: (list?.Contents || []).map((o) => o.Key),
    });
  } catch (err) {
    result.steps.push({
      step: 'ListObjectsV2',
      ok: false,
      code: err?.name,
      message: err?.message,
      httpStatus: err?.$metadata?.httpStatusCode || null,
    });
  }

  res.json(result);
});

/**
 * POST /upload
 * Form field name: "video"
 * Content-type: multipart/form-data
 */
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    // 1) Basic gate: must come from your recorder
    const clientSource = req.get('X-Client-Source');
    if (clientSource !== 'stickers-recorder') {
      return res.status(400).json({ error: 'Invalid upload source' });
    }

    // 2) Validate presence
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'No file uploaded (expected field "video").' });
    }

    // 3) Validate type (only video; optionally restrict to mp4/webm)
    const ct = req.file.mimetype || '';
    if (!ct.startsWith('video/')) {
      return res.status(400).json({ error: `Invalid content type: ${ct}` });
    }
    // Optional hard restriction:
    // if (!(ct === 'video/mp4' || ct === 'video/webm')) {
    //   return res.status(400).json({ error: `Only mp4 or webm accepted, got ${ct}` });
    // }

    // 4) Key naming: keep clean & scoped
    const original = req.file.originalname || (ct.includes('mp4') ? 'video.mp4' : 'video.webm');
    const sanitized = original.replace(/\s+/g, '_');
    const key = `${PREFIX}${Date.now()}-${sanitized}`;

    // 5) Upload to S3 (multipart for big files)
    const uploader = new Upload({
      client: s3,
      params: {
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: ct,
      },
      leavePartsOnError: false,
    });

    await uploader.done();

    const url = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(
      key
    )}`;

    res.json({
      message: 'Upload successful',
      key,
      url,
      contentType: ct,
      size: req.file.size,
      source: clientSource,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: String(err?.message || err) });
  }
});


/**
 * GET /files
 * ✅ List only objects inside uploads/ folder (most recent 5)
 */
app.get('/files', async (_req, res) => {
  try {
    const listCmd = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: PREFIX, // ✅ restrict to uploads/
      MaxKeys: 200,
    });

    const data = await s3.send(listCmd);

    if (!data.Contents || data.Contents.length === 0) {
      return res.json({ message: 'No files found in uploads/', bucket: BUCKET });
    }

    const realObjects = data.Contents.filter((o) => o.Key && o.Size > 0);

    const recent = realObjects
      .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
      .slice(0, 5);

    const files = await Promise.all(
      recent.map(async (item) => {
        const getCmd = new GetObjectCommand({ Bucket: BUCKET, Key: item.Key });
        const url = await getSignedUrl(s3, getCmd, { expiresIn: 60 * 5 });
        return {
          key: item.Key,
          size: item.Size,
          lastModified: item.LastModified,
          url,
        };
      })
    );

    res.json({ count: files.length, bucket: BUCKET, prefix: PREFIX, files });
  } catch (err) {
    console.error('List error:', err?.name, err?.message);
    res.status(500).json({
      error: 'Failed to list files',
      code: err?.name || '',
      details: err?.message || String(err),
      bucket: BUCKET,
      prefix: PREFIX,
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ S3 video uploader running on http://localhost:${PORT}`);
});
