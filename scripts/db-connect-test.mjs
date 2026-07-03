// Teste rápido de conexão ao Postgres do Supabase.
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("uso: node db-connect-test.mjs <DATABASE_URL>");
  process.exit(2);
}

const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 15 });

try {
  const [row] = await sql`select current_database() as db, current_user as usuario, version() as versao`;
  console.log("OK conexão:");
  console.log("  db:", row.db);
  console.log("  user:", row.usuario);
  console.log("  version:", String(row.versao).split(",")[0]);
  await sql.end();
  process.exit(0);
} catch (e) {
  console.error("FALHA:", e.message);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
