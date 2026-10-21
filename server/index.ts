import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { createApi } from "./app.ts";
import { openDatabase } from "./db.ts";

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 5173);
const adminUser = process.env.ADMIN_USER ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";

if (production && !adminPassword) {
  console.warn("ADMIN_PASSWORD is not set: the host dashboard at /app is open to anyone.");
}

const app = express();
app.set("trust proxy", true);
app.use(requireAdmin);
app.use("/api", createApi(openDatabase()));

if (production) {
  const dist = path.resolve("dist");
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(port, () => console.log(`Cadence running at http://localhost:${port}`));

/** HTTP Basic auth for the host dashboard and its API; booking pages stay public. */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const isAdminPath = /^\/app(\/|$)|^\/api\/(me|event-types|availability|scheduled)(\/|$)/.test(req.path);
  if (!adminPassword || !isAdminPath) return next();

  const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    const sep = decoded.indexOf(":");
    if (sep >= 0 && safeEqual(decoded.slice(0, sep), adminUser) && safeEqual(decoded.slice(sep + 1), adminPassword)) {
      return next();
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Cadence admin", charset="UTF-8"').status(401).send("Authentication required.");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
