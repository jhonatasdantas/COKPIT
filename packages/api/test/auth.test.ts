import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import app from "../src/index";
import type { Env } from "../src/index";

const SECRET = "test-secret-suficientemente-longo-para-hs256-000000";

const env: Env = {
  ENVIRONMENT: "test",
  SUPABASE_JWT_SECRET: SECRET,
};

async function makeToken(claims: Record<string, unknown>, secret = SECRET) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

function req(path: string, headers: Record<string, string> = {}) {
  return app.request(path, { headers }, env);
}

describe("requireAuth em /me", () => {
  it("401 sem token", async () => {
    const res = await req("/me");
    expect(res.status).toBe(401);
  });

  it("401 com token de assinatura inválida", async () => {
    const token = await makeToken(
      { sub: "u1", tenant_id: "t1" },
      "outro-segredo-que-nao-bate-000000000000000000000",
    );
    const res = await req("/me", { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it("401 quando falta tenant_id", async () => {
    const token = await makeToken({ sub: "u1" });
    const res = await req("/me", { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it("200 e resolve tenant_id com token válido", async () => {
    const token = await makeToken({
      sub: "user-123",
      tenant_id: "tenant-abc",
      email: "eq@agencia.com",
      role: "dono",
    });
    const res = await req("/me", { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      user_id: "user-123",
      tenant_id: "tenant-abc",
      email: "eq@agencia.com",
      role: "dono",
    });
  });
});

describe("health continua público", () => {
  it("200 sem token", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
  });
});
