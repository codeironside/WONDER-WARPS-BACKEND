import { createRole } from "../services/create.a.role/index.js";
import { Router } from "express";

export const RoleRouter = Router();

RoleRouter.post("/createroles", createRole);
