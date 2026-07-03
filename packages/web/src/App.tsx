import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

type Health = { status: string; environment: string; time: string };

const FASES = [
  { id: "F1", nome: "Fundação", desc: "Monorepo · Worker Hono · Pages · CI", done: true },
  { id: "F2", nome: "Auth + Multi-tenant", desc: "JWT Supabase · RLS por tenant · /me", done: true },
  { id: "F3", nome: "Schema de domínio", desc: "produtos · vendas · ads · sync_runs", done: false },
  { id: "F4", nome: "OAuth Shopee", desc: "HMAC · token seguro · connector", done: false },
  { id: "F5", nome: "Durable Object por loja", desc: "token+lock · rate-limit · cursor", done: false },
  { id: "F6", nome: "Sync end-to-end", desc: "Queues/Cron · idempotência · sync_runs", done: false },
  { id: "F7", nome: "Observabilidade", desc: "tela de última sync · falhas", done: false },
];

const C = {
  bg: "#0b1020",
  card: "#141a2e",
  border: "#26304d",
  text: "#e6e9f2",
  dim: "#8b94b0",
  green: "#3ddc84",
  amber: "#f5b301",
  blue: "#5b8cff",
};

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      fetch(`${API_URL}/health`)
        .then((r) => r.json() as Promise<Health>)
        .then((h) => {
          setHealth(h);
          setError(null);
        })
        .catch((e) => setError(String(e)));
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, []);

  const feitas = FASES.filter((f) => f.done).length;
  const pct = Math.round((feitas / FASES.length) * 100);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Cockpit Ide</h1>
            <p style={{ margin: ".25rem 0 0", color: C.dim }}>SaaS multi-tenant · Cloudflare-native · demo</p>
          </div>
          <ApiBadge health={health} error={error} />
        </header>

        {/* Progresso geral */}
        <section style={card()}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".6rem" }}>
            <strong>Progresso do rewrite</strong>
            <span style={{ color: C.dim }}>{feitas}/{FASES.length} fases · {pct}%</span>
          </div>
          <div style={{ height: 10, background: "#0a0f1f", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: C.green, transition: "width .4s" }} />
          </div>
        </section>

        {/* Fases */}
        <section style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", marginTop: "1rem" }}>
          {FASES.map((f) => (
            <div key={f.id} style={{ ...card(), margin: 0, borderColor: f.done ? C.green : C.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                <span style={{ fontSize: "1.1rem" }}>{f.done ? "✅" : "⚪"}</span>
                <strong>{f.id} · {f.nome}</strong>
              </div>
              <p style={{ margin: ".4rem 0 0", color: C.dim, fontSize: ".85rem" }}>{f.desc}</p>
              <span style={{ display: "inline-block", marginTop: ".5rem", fontSize: ".72rem", color: f.done ? C.green : C.amber }}>
                {f.done ? "concluída" : "planejada"}
              </span>
            </div>
          ))}
        </section>

        {/* Status da API ao vivo */}
        <section style={card()}>
          <strong>API — health ao vivo (atualiza a cada 4s)</strong>
          <div style={{ marginTop: ".6rem", fontFamily: "ui-monospace, monospace", fontSize: ".85rem" }}>
            {health && (
              <pre style={{ margin: 0, color: C.green }}>{JSON.stringify(health, null, 2)}</pre>
            )}
            {error && <span style={{ color: "#ff6b6b" }}>API offline — suba o Worker: <code>npm run dev:api</code></span>}
            {!health && !error && <span style={{ color: C.dim }}>checando…</span>}
          </div>
        </section>

        <footer style={{ marginTop: "1.5rem", color: C.dim, fontSize: ".8rem" }}>
          Endpoints: <code>GET /health</code> (público) · <code>GET /me</code> (exige JWT + tenant_id).
          RLS ao vivo e login e2e pendem do Supabase local (Docker).
        </footer>
      </div>
    </div>
  );
}

function ApiBadge({ health, error }: { health: Health | null; error: string | null }) {
  const online = !!health && !error;
  return (
    <span style={{
      padding: ".35rem .7rem", borderRadius: 999, fontSize: ".8rem", fontWeight: 600,
      background: online ? "rgba(61,220,132,.12)" : "rgba(255,107,107,.12)",
      color: online ? C.green : "#ff6b6b",
      border: `1px solid ${online ? C.green : "#ff6b6b"}`,
    }}>
      ● API {online ? "online" : "offline"}
    </span>
  );
}

function card(): React.CSSProperties {
  return {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
    padding: "1.1rem 1.25rem", marginTop: "1rem",
  };
}
