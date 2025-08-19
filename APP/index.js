import dotenv from 'dotenv';
dotenv.config();
import express from 'express'
import cors from 'cors';
import helmet from 'helmet';

import { apiRouter } from './APP_ROUTER/index.js';
import logger from '@/logger';
// import db  from '../knexfile.js'; // REMOVE THIS LINE
import { applyRateLimit, logEveryRequest, flagMaliciousActivity } from '../CORE/middleware/rateLimiter/index.js'
import { API_SUFFIX } from '../CORE/utils/constants/index.js';
import { handleShutdown } from '../CORE/services/handleShutdown/index.js'
import { config } from '@/config'
import { requestLogger } from '../CORE/middleware/requestlogger/index,js';
import knex from 'knex'; 
import knexConfig from '../knexfile.js';
import ErrorHandler from '../CORE/middleware/errorhandler/index.js';
export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger)

app.use(applyRateLimit);
app.use(logEveryRequest)
app.use(flagMaliciousActivity)
app.use(ErrorHandler)

app.use(API_SUFFIX, apiRouter);

let server;


const db = knex(knexConfig.development); 


process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
app.get('/api/v1/health', async (req, res) => {
  let databaseStatus = 'down';
  try {
    if (db) { // db is now the knex instance
      await db.raw('SELECT 1'); // Use db to test connection
      databaseStatus = 'up';
    }
  } catch (error) {
    databaseStatus = 'down';
  }
  const healthcheck = {
    server: 'up',
    database: databaseStatus,
  };
  try {
    res.status(200).json(healthcheck);
  } catch (error) {
    healthcheck.server = 'down';
    res.status(503).json(healthcheck);
  }
}
)

async function startApplication() {
  try {
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      handleShutdown(error);
    });
    process.on("exit", (code) => {
      console.log(`Process exiting with code: ${code}`);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      handleShutdown(reason);
    });


    logger.info('Starting database migrations...');
    await db.migrate.latest(); // This will now work
    logger.info('Database migrations completed successfully.');


    await db.raw('SELECT 1');
    logger.info('Database connection successful!');


    const port = config.app.port;
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      const message = err.message || 'Internal Server Error';
      sendResponse(res, statusCode, message, null, 'error');
    });

      app.listen(port, () => {
      logger.info(`\u001b[32mServer is running on port: \u001b[34mhttp://localhost:${port}\u001b[0m`);
      logger.info(`\u001b[32mGo to \u001b[34mhttp://localhost:${port}/${API_SUFFIX}/health\u001b[0m to check server health`);

    });

  } catch (error) {
    logger.error('Application failed to start:', error);
    console.log(error)

    process.exit(1);
  }
}

startApplication();