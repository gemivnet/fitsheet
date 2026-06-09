// upload.ts — shared multer disk storage. Files land in DATA_DIR/uploads with random names.

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import multer from 'multer';
import { uploadsDir } from './db/index';

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir()),
    filename: (_req, file, cb) => cb(null, randomUUID() + (extname(file.originalname) || '.jpg')),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});
