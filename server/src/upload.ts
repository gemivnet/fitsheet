// upload.ts — shared multer disk storage. Files land in DATA_DIR/uploads with random names.
// Only images are accepted (label photos, recipe photos, progress photos).

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import multer from 'multer';
import { uploadsDir } from './db/index';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']);

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir()),
    filename: (_req, file, cb) => cb(null, randomUUID() + (extname(file.originalname) || '.jpg')),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error('only image uploads are allowed'));
  },
});
