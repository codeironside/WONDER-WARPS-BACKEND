import { db } from "@/db";
export const server_health = async (req, res) => {
  let databaseStatus = "down";
  try {
    if (db) {
      databaseStatus = "up";
    }
  } catch (error) {
    databaseStatus = "down";
  }
  const healthcheck = {
    server: "up",
    database: databaseStatus,
  };
  try {
    res.status(200).json(healthcheck);
  } catch (error) {
    healthcheck.server = "down";
    res.status(503).json(healthcheck);
  }
};
