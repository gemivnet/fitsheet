// uploadPath.ts — read an uploaded file only if it really is inside the uploads folder.
// multer picks the file name itself, but the AI helpers take a path, so they check it anyway.

import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { uploadsDir } from './db/index';

export function readUpload(filePath: string, dir: string = uploadsDir()): Buffer {
  const root = realpathSync(resolve(dir));
  const full = realpathSync(resolve(filePath));
  if (!full.startsWith(root + sep)) throw new Error('file is outside the uploads folder');
  return readFileSync(full);
}
