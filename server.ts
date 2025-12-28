import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { getJobs, submitApplication } from './route.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execAsync = promisify(exec);

// Load environment variables from .env.local (or .env as fallback)
dotenv.config({ path: '.env.local' });
dotenv.config(); // Also try .env as fallback

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Simple upload storage (local filesystem) to provide a URL for Airtable attachments
const uploadDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

app.get('/api/jobs', async (req, res) => {
  try {
    const result = await getJobs();
    res.json(result);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch jobs';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', errorStack);
    res.status(500).json({ 
      error: errorMessage,
      details: errorStack
    });
  }
});

app.post('/api/applications', async (req, res) => {
  try {
    const body = req.body;
    // Expect { person: {...}, jobId?: string, jobTitle?: string }
    if (!body || !body.person || !body.person.emailAddress) {
      return res.status(400).json({ error: 'Missing person data or email' });
    }

    const result = await submitApplication(body);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('Error submitting application:', err);
    const message = err instanceof Error ? err.message : 'Failed to submit';
    res.status(500).json({ error: message });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const { dataUrl, filename } = req.body || {};
    if (!dataUrl || !filename) {
      return res.status(400).json({ error: 'Missing file data' });
    }
    const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return res.status(400).json({ error: 'Invalid data URL' });
    }
    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, 'base64');
    const safeName = `${Date.now()}-${String(filename).replace(/[^\w.\-]+/g, '_')}`;
    const filePath = path.join(uploadDir, safeName);
    await fs.promises.writeFile(filePath, buffer);
    const baseUrl = process.env.AIRTABLE_APPLICATIONS_TABLE || `${req.protocol}://${req.get('host')}`;
    const url = `${baseUrl.replace(/\/$/, '')}/uploads/${safeName}`;
    res.json({ url, filename: safeName, mimeType });
  } catch (error) {
    console.error('Error handling upload:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  // Check if port is in use and kill the process
  try {
    const { stdout } = await execAsync(`lsof -ti:${PORT}`);
    if (stdout.trim()) {
      console.log(`⚠️  Port ${PORT} is in use, killing existing process...`);
      await execAsync(`kill -9 ${stdout.trim()}`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait a bit for port to be freed
    }
  } catch (error) {
    // Port is free, continue
  }

  const server = app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
    console.log('Environment check:');
    console.log('  AIRTABLE_TOKEN:', process.env.AIRTABLE_TOKEN ? '✓ Set' : '✗ Missing');
    console.log('  AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID ? '✓ Set' : '✗ Missing');
    console.log('  AIRTABLE_GEROLES_TABLE:', process.env.AIRTABLE_GEROLES_TABLE ? '✓ Set' : '✗ Missing');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is still in use after cleanup attempt.`);
      console.error(`Please manually kill the process: lsof -ti:${PORT} | xargs kill -9\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  return server;
}

const server = await startServer();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
