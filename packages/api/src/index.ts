import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth, type AuthVars } from "./auth";

export interface Env {
  ENVIRONMENT: string;
  // Fase 2 (Auth): segredo HS256 do Supabase para validar o JWT.
  SUPABASE_JWT_SECRET?: string;
  // Fase 2/3 (dados): connection string do Postgres (Supabase). Em prod via Hyperdrive.
  DATABASE_URL?: string;
}

const app = new Hono<{ Bindings: Env; Variables: AuthVars }>();

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

// Rota protegida — exige JWT válido. Devolve a identidade resolvida do token.
app.get("/me", requireAuth, (c) => {
  const claims = c.get("claims");
  return c.json({
    user_id: claims.sub,
    tenant_id: claims.tenant_id,
    email: claims.email ?? null,
    role: claims.role ?? null,
  });
});

app.notFound((c) => c.json({ status: "not_found" }, 404));

export default app;
