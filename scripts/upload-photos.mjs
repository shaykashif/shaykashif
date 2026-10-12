// Upload album photos to the R2 bucket that serves photos.shaykas.com.
//
// Usage (from the scripts folder):
//   npm run upload -- "Kreuzberg" "HydePark"          upload each album's web/ and thumb/ images
//   npm run upload -- --dry-run "Kreuzberg"           list what would be uploaded, upload nothing
//   npm run upload -- --force "Kreuzberg"             re-upload files that are already in the bucket
//
// Keys mirror the folder layout, so Kreuzberg/web/IMG_1104.webp is served at
// https://photos.shaykas.com/Kreuzberg/web/IMG_1104.webp. Files already in the
// bucket are skipped unless --force is given.
//
// Credentials come from ../.env (git-ignored):
//   R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
//   R2_BUCKET=shaykas
//   R2_ACCESS_KEY_ID=...
//   R2_SECRET_ACCESS_KEY=...

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const ROOT = path.resolve(import.meta.dirname, '..');
const SUBFOLDERS = ['web', 'thumb'];
const IMAGE_TYPES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const albums = args.filter(a => !a.startsWith('--'));

if (!albums.length) {
  console.error('Give at least one album folder, e.g. npm run upload -- "Kreuzberg"');
  process.exit(1);
}

const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
if (!dryRun && (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)) {
  console.error('Missing R2 settings. Add R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to .env');
  process.exit(1);
}

const s3 = dryRun ? null : new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadFile(localPath, key) {
  const type = IMAGE_TYPES[path.extname(localPath).toLowerCase()];
  const body = await readFile(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: type,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

let uploaded = 0, skipped = 0;

for (const album of albums) {
  for (const sub of SUBFOLDERS) {
    const dir = path.join(ROOT, album, sub);
    let files;
    try {
      // The pages only use .webp; the web/ folders also hold .jpg copies that stay local.
      files = (await readdir(dir)).filter(f => path.extname(f).toLowerCase() === '.webp');
    } catch {
      console.log(`- ${album}/${sub}: no folder, skipping`);
      continue;
    }
    for (const file of files) {
      const key = `${album}/${sub}/${file}`;
      if (dryRun) {
        console.log(`would upload ${key}`);
        continue;
      }
      if (!force && await exists(key)) {
        skipped++;
        continue;
      }
      await uploadFile(path.join(dir, file), key);
      uploaded++;
      console.log(`uploaded ${key}`);
    }
  }
}

if (!dryRun) console.log(`Done. ${uploaded} uploaded, ${skipped} already in the bucket.`);
