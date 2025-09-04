import dotenv from "dotenv";
dotenv.config();

export const config = {
  app: {
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    session_stay_alive: process.env.SESSIONS_STAY_ALIVE,
    session_doesnt_stay_alive: process.env.SESSIONS_DOESNT_STAY_ALIVE,
    JWT_SECRET: process.env.JWT_SECRET,
  },
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  openai: {
    API_KEY: process.env.API_KEY,
  },
};
