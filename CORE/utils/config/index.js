import dotenv from "dotenv";
dotenv.config();

export const config = {
  app: {
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    session_stay_alive: process.env.SESSIONS_STAY_ALIVE,
    session_doesnt_stay_alive: process.env.SESSIONS_DOESNT_STAY_ALIVE,
    JWT_SECRET: process.env.JWT_SECRET,
    base_url: process.env.BASE_URL,
  },
  db: {
    MONGO_URI: process.env.MONGO_URI,
  },
  openai: {
    API_KEY: process.env.API_KEY,
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "us-east-1",
    s3Bucket: process.env.AWS_S3_BUCKET_NAME,
  },
  ses: {
    accessKeyId: process.env.SES_KEY_ID,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY,
    from_info: process.env.SES_FROM_INFO,
    region: process.env.SES_REGION,
  },
  url: {
    frontendurl: [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_DEV,
      "https://www.mystoryhat.com",
      "https://mystoryhat.com",
    ],
    frontendev: process.env.FRONTEND_DEV,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.SES_FROM_INFO,
  },
  geoip: { enabled: true },
  ipgeo: {
    apikey: process.env.IPGEO_API_KEY,
  },
  stripe: {
    secret_key: process.env.STRIPE_API_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    success_url: `${process.env.FRONTEND_DEV}/payment-pending`,
    // success_url: `http://localhost:5173/payment-pending`,
    // cancel_url: `http://localhost:5173/payment-cancelled`,
    cancel_url: `${process.env.FRONTEND_DEV}/payment-cancelled`,
  },
  google: {
    api_key: process.env.GOOGLE_API_KEY,
  },
  lulu: {
    client_key: process.env.LULU_CLIENT_KEY,
    client_secret: process.env.LULU_CLIENT_SECRET,
    successUrl: `${process.env.FRONTEND_DEV}/print/orders/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${process.env.FRONTEND_DEV}/print-order/cancel?session_id={CHECKOUT_SESSION_ID}`,
  },
  superadmin: {
    id: process.env.SUPERADMIN_ID,
  },
};
