import { useEffect, useState } from "react";

// URL da API por ambiente. Em dev, aponta para o wrangler local (porta 8787).
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

type Health = { status: string; environment: string; time: string };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Cockpit Ide</h1>
      <p>Fundação (F1) no ar — Cloudflare Pages + Workers.</p>
      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem" }}>Status da API</h2>
        {health && <pre>{JSON.stringify(health, null, 2)}</pre>}
        {error && <p style={{ color: "crimson" }}>API offline: {error}</p>}
        {!health && !error && <p>checando…</p>}
      </section>
    </main>
  );
}
