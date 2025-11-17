// services/s3FileService.js
import {
  HeadBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, BUCKET, PREFIX } from '../config/s3.js';

// --- Debug ---
export async function debugS3Connectivity() {
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
      httpStatus: head?.$metadata?.httpStatusCode,
    });
  } catch (err) {
    result.steps.push({
      step: 'HeadBucket',
      ok: false,
      code: err?.name,
      message: err?.message,
    });
  }

  try {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        MaxKeys: 5,
      })
    );

    result.steps.push({
      step: 'ListObjectsV2',
      ok: true,
      count: (list?.Contents || []).length,
      keys: (list?.Contents || []).map(o => o.Key),
    });
  } catch (err) {
    result.steps.push({
      step: 'ListObjectsV2',
      ok: false,
      code: err?.name,
      message: err?.message,
    });
  }

  return result;
}

// --- Upload ---
export async function uploadVideoToS3(file) {
  const ct = file.mimetype;
  const original = file.originalname || 'video.mp4';
  const sanitized = original.replace(/\s+/g, '_');

  const key = `${PREFIX}${Date.now()}-${sanitized}`;

  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: ct,
    },
  });

  await uploader.done();

  const url = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(
    key
  )}`;

  return { key, url, contentType: ct, size: file.size };
}

// --- List Files ---
export async function listRecentFiles(limit = 5) {
  const listCmd = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: PREFIX,
    MaxKeys: 200,
  });

  const data = await s3.send(listCmd);
  if (!data.Contents) return [];

  const realObjects = data.Contents.filter(o => o.Key && o.Size > 0);

  const recent = realObjects
    .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
    .slice(0, limit);

  return Promise.all(
    recent.map(async item => {
      const getCmd = new GetObjectCommand({ Bucket: BUCKET, Key: item.Key });
      const url = await getSignedUrl(s3, getCmd, { expiresIn: 300 });

      return {
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        url,
      };
    })
  );
}
