import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { authGuard } from '../middleware/auth.js';

/* ────────────────────────────────────────────────────────────────
   Image upload routes — used by the admin panel for product,
   category, and promotion images.

   Storage: a Render Persistent Disk mounted at /data/uploads (or
   $UPLOAD_DIR if set). If no disk is attached, falls back to a
   directory inside the container — files there are LOST on the
   next deploy. The route still works locally either way.

   Files are resized + re-encoded with sharp on upload so a 4 MB
   phone photo becomes ~150 KB. Returned URL is /api/uploads/<file>
   which the public GET handler below serves with long cache headers.
   ──────────────────────────────────────────────────────────────── */

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const FALLBACK_DIR = path.resolve(process.cwd(), 'uploads');

// Try the persistent disk first, fall back to container dir
async function resolveUploadDir(): Promise<string> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    // Test write
    const testFile = path.join(UPLOAD_DIR, '.write-test');
    await fs.writeFile(testFile, 'ok');
    await fs.unlink(testFile);
    return UPLOAD_DIR;
  } catch {
    await fs.mkdir(FALLBACK_DIR, { recursive: true });
    return FALLBACK_DIR;
  }
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB raw upload limit (we resize down)

function safeBase(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image';
}

export async function uploadRoutes(app: FastifyInstance) {
  // Resolve the upload dir once at startup so we know where to write
  const dir = await resolveUploadDir();
  app.log.info(`[uploads] storing files at: ${dir}`);

  // ── POST /api/uploads/image — admin-only file upload
  app.post('/image', { preHandler: [authGuard] }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded (expected multipart field "file")' });
    }

    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(400).send({
        error: 'Unsupported file type',
        details: { mimetype: file.mimetype, allowed: Array.from(ALLOWED_MIME) },
      });
    }

    // Read the buffer with a hard size cap
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of file.file) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        return reply.code(413).send({ error: 'File too large', details: { maxBytes: MAX_BYTES } });
      }
      chunks.push(chunk);
    }
    const inputBuffer = Buffer.concat(chunks);

    // Resize + re-encode with sharp. Max 1600 px on the longest side,
    // re-encoded as JPEG q85 (small + universally supported). Strip metadata.
    let outputBuffer: Buffer;
    try {
      outputBuffer = await sharp(inputBuffer, { failOn: 'truncated' })
        .rotate() // honor EXIF orientation then strip
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      app.log.error({ err }, '[uploads] sharp processing failed');
      return reply.code(400).send({ error: 'Could not process image' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const filename = `${safeBase(file.filename)}-${id}.jpg`;
    const filepath = path.join(dir, filename);

    try {
      await fs.writeFile(filepath, outputBuffer);
    } catch (err) {
      app.log.error({ err }, '[uploads] write failed');
      return reply.code(500).send({ error: 'Could not save image' });
    }

    // Public URL the frontend should store as the image's URL
    const url = `/api/uploads/${filename}`;
    return {
      url,
      filename,
      bytes: outputBuffer.length,
      width: 1600, // upper bound, actual is <= 1600
    };
  });

  // ── GET /api/uploads/:filename — public image serving
  // Serves files from the upload dir with a long cache header. We don't
  // expose a directory listing.
  app.get('/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // Reject anything that smells like path traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.startsWith('.')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    const filepath = path.join(dir, filename);
    try {
      const buffer = await fs.readFile(filepath);
      const ext = path.extname(filename).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png'
        : ext === '.webp' ? 'image/webp'
        : ext === '.avif' ? 'image/avif'
        : 'image/jpeg';

      reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=31536000, immutable');
      return buffer;
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }
  });
}
