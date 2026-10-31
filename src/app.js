import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { academicYear } from './middleware/academicYear.js';

const app = express();

const allowedOrigins = [
  'https://feesmanagement.vercel.app',
  'https://feesmangement.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
];

if (env.CORS_ORIGIN) {
  env.CORS_ORIGIN.split(',').forEach((origin) => {
    const trimmed = origin.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/feesmanage?ment.*\.vercel\.app$/.test(origin)) return callback(null, true);
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Academic-Year-Id'],
  optionsSuccessStatus: 200,
};

app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.COOKIE_SECRET));
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use(academicYear);
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
