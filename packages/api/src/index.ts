import { Hono } from "hono";
import { cors } from "hono/cors";

export interface Env {
  ENVIRONMENT: string;
  // Segredos (Fase 2+): SUPABASE_URL, SUPABASE_JWT_SECRET, etc. — via Workers Secrets.
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// Health check — usado na verificação da Fase 1.
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "cockpit-api",
    environment: c.env.ENVIRONMENT ?? "unknown",
    time: new Date().toISOString(),
  }),
);

app.get("/", (c) => c.text("cockpit-api"));

app.notFound((c) => c.json({ status: "not_found" }, 404));

export default app;
