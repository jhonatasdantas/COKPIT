import postgres from "postgres";
import type { AuthClaims } from "./auth";

export type Sql = postgres.Sql;

/**
 * Cria o cliente Postgres. Em produção a conexão vem via Hyperdrive (binding DB);
 * localmente, via DATABASE_URL do Supabase local.
 */
export function createSql(connectionString: string): Sql {
  return postgres(connectionString, {
    // Workers: uma conexão por request; sem prepared statements de longa vida.
    prepare: false,
    max: 5,
  });
}

/**
 * Executa `fn` dentro de uma transação com os claims do JWT publicados em
 * `request.jwt.claims`, para que as políticas RLS (public.current_tenant_id())
 * enxerguem o tenant correto. `set_config(..., true)` = escopo da transação.
 */
export async function withTenant<T>(
  sql: Sql,
  claims: AuthClaims,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}
