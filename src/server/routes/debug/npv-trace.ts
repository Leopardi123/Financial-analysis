import fs from 'node:fs/promises';
import path from 'node:path';

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'trace';
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ ok: false, error: 'Body must be a JSON object' });
      return;
    }

    const label = typeof body.label === 'string' ? body.label : 'npv-trace';
    const now = new Date();
    const stamp = now.toISOString().replace(/[.:]/g, '-');
    const fileName = `${stamp}-${sanitizeId(label)}.json`;
    const debugDir = path.resolve(process.cwd(), 'public', 'debug');
    await fs.mkdir(debugDir, { recursive: true });

    const payload = {
      createdAtUtc: now.toISOString(),
      ...body,
    };

    const filePath = path.join(debugDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

    res.status(200).json({
      ok: true,
      fileName,
      filePath,
      url: `/debug/${fileName}`,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
    });
  }
}
