import dotenv from 'dotenv';
import express from 'express'
import cors from 'cors';
import helmet from 'helmet';

// const apiRouter = require('./API');
import logger from '../CORE/utils/logger/index.js';
import { db } from'../CORE/services/db/index.js' ;
import { applyRateLimit, logEveryRequest, flagMaliciousActivity } from'../CORE/middleware/rateLimiter/index.js'
import  {API_SUFFIX} from '../CORE/utils/constants/index.js';
import { handleShutdown } from '../CORE/services/handleShutdown/index.js'

dotenv.config();
export const app = express();


app.use(helmet());
app.use(cors());
app.use(express.json());



app.use(applyRateLimit);
app.use(logEveryRequest)
app.use(flagMaliciousActivity)

// API Routes
app.use(API_SUFFIX, apiRouter);


let server;



process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
async function startApplication() {
  try {
   
    logger.info('Starting database migrations...');
    await db.migrate.latest();
    logger.info('Database migrations completed successfully.');

    
    await db.raw('SELECT 1');
    logger.info('Database connection successful!');

   
    const port = process.env.PORT || 3000;
    server = app.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    });

  } catch (error) {
    logger.error('Application failed to start:', error.message);
 
    process.exit(1);
  }
}


startApplication();