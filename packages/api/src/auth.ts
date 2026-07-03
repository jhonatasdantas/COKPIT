import { jwtVerify } from "jose";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./index";

// Formato mínimo do JWT do Supabase que nos interessa.
export interface AuthClaims {
  sub: string; // user id (auth.users.id)
  email?: string;
  tenant_id: string; // claim custom injetado no token
  role?: string;
}

// Variáveis que o middleware injeta no contexto do request.
export interface AuthVars {
  claims: AuthClaims;
  jwt: string;
}

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Valida o JWT (HS256, segredo do Supabase) e injeta `claims` + `jwt` no contexto.
 * Rejeita com 401 se ausente, malformado, assinatura inválida ou sem `tenant_id`.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVars;
}>(async (c, next) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) {
    throw new HTTPException(401, { message: "missing bearer token" });
  }

  const secret = c.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new HTTPException(500, { message: "SUPABASE_JWT_SECRET not configured" });
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new HTTPException(401, { message: "invalid token" });
  }

  const tenant_id = payload.tenant_id;
  const sub = payload.sub;
  if (typeof tenant_id !== "string" || !tenant_id || typeof sub !== "string") {
    throw new HTTPException(401, { message: "token missing tenant_id" });
  }

  c.set("jwt", token);
  c.set("claims", {
    sub,
    tenant_id,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
  });

  await next();
});
