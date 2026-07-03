// Roda SQL no Postgres do Supabase via Management API (HTTPS/IPv4 — sem Docker, sem conexão direta).
// Uso:
//   node scripts/db-mgmt.mjs migrate     -> aplica supabase/migrations/*.sql em ordem + seed
//   node scripts/db-mgmt.mjs query "SQL" -> roda um SQL avulso e imprime o resultado
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Carrega keys/supabase.env
const env = {};
for (const line of readFileSync(join(ROOT, "keys/supabase.env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error("faltam SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF em keys/supabase.env");
  process.exit(2);
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function runSql(query) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const cmd = process.argv[2];

if (cmd === "query") {
  const result = await runSql(process.argv[3]);
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === "migrate") {
  const dir = join(ROOT, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    process.stdout.write(`aplicando ${f} ... `);
    await runSql(readFileSync(join(dir, f), "utf8"));
    console.log("ok");
  }
  // seed (opcional)
  try {
    const seed = readFileSync(join(ROOT, "supabase/seed.sql"), "utf8");
    process.stdout.write("aplicando seed.sql ... ");
    await runSql(seed);
    console.log("ok");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  console.log("MIGRACOES APLICADAS");
} else {
  console.error("comando invalido. use: migrate | query \"SQL\"");
  process.exit(2);
}
