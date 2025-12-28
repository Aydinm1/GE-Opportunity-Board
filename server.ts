import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { getJobs } from './route.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables from .env.local (or .env as fallback)
dotenv.config({ path: '.env.local' });
dotenv.config(); // Also try .env as fallback

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

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

