import { addAliases } from "module-alias";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
addAliases({
  "@API": path.join(__dirname, "API"),
  "@APP": path.join(__dirname, "APP"),
  "@CORE": path.join(__dirname, "CORE"),
  "@controllers": path.join(__dirname, "APP/controllers"),
  "@models": path.join(__dirname, "APP/models"),
  "@services": path.join(__dirname, "APP/services"),
  "@config": path.join(__dirname, "./CORE/utils/config/index.js"),
  "@/logger": path.join(__dirname, "./CORE/utils/logger/index.js"),
  "@middleware": path.join(__dirname, "APP/middleware"),
});
