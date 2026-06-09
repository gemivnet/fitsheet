import { Router } from 'express';
import { extractLabel } from '../ai/extractLabel';
import { hasAnthropicKey } from '../config';
import { upload } from '../upload';

// The photo is ALWAYS saved (returned as label_photo) so the app keeps it even when
// extraction is unavailable — the manual-entry form is the fallback.
export function aiRouter(): Router {
  const r = Router();
  r.post('/extract-label', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    if (!hasAnthropicKey()) {
      return res.status(503).json({ error: 'no_api_key', label_photo: req.file.filename, nutrition: null });
    }
    try {
      const nutrition = await extractLabel(req.file.path, req.file.mimetype);
      res.json({ nutrition, label_photo: req.file.filename, confidence: nutrition?.confidence ?? 'low' });
    } catch (e) {
      res.status(502).json({ error: 'extract_failed', label_photo: req.file.filename, nutrition: null, detail: String(e) });
    }
  });
  return r;
}
