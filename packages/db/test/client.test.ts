import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/client";

const remote = "postgres://user:p%40ss@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";

describe("poolConfig", () => {
  it("padrão: TLS sem verificação para host remoto, sem TLS para localhost", () => {
    expect(poolConfig(remote, {}).ssl).toEqual({ rejectUnauthorized: false });
    expect(poolConfig("postgres://u:p@localhost:5432/db", {}).ssl).toBe(false);
    expect(poolConfig("postgres://u:p@127.0.0.1/db", {}).ssl).toBe(false);
    expect(poolConfig("postgres://u:p@[::1]:5432/db", {}).ssl).toBe(false);
  });

  it("DATABASE_SSL força o modo", () => {
    expect(poolConfig(remote, { DATABASE_SSL: "disable" }).ssl).toBe(false);
    expect(poolConfig("postgres://u:p@localhost/db", { DATABASE_SSL: "require" }).ssl).toEqual({ rejectUnauthorized: false });
    expect(poolConfig(remote, { DATABASE_SSL: "verify", DATABASE_CA_CERT: PEM }).ssl).toEqual({ ca: PEM });
  });

  it("verify aceita o PEM com \n escapado", () => {
    const escaped = PEM.replace(/\n/g, "\n");
    expect(poolConfig(remote, { DATABASE_SSL: "verify", DATABASE_CA_CERT: escaped }).ssl).toEqual({ ca: PEM });
  });

  it("verify sem DATABASE_CA_CERT e valor desconhecido são erros", () => {
    expect(() => poolConfig(remote, { DATABASE_SSL: "verify" })).toThrow(/DATABASE_CA_CERT/);
    expect(() => poolConfig(remote, { DATABASE_SSL: "talvez" })).toThrow(/DATABASE_SSL/);
  });

  it("remove sslmode e demais parâmetros ssl da URL, preservando o resto", () => {
    const cfg = poolConfig(`${remote}?sslmode=require&application_name=bk&sslrootcert=/x.pem`, {});
    expect(cfg.connectionString).toBe(`${remote}?application_name=bk`);
    expect(poolConfig(`${remote}?sslmode=verify-full`, {}).connectionString).toBe(remote);
  });

  it("DB_POOL_MAX: padrão 5, inteiro positivo, inválido é erro", () => {
    expect(poolConfig(remote, {}).max).toBe(5);
    expect(poolConfig(remote, { DB_POOL_MAX: "3" }).max).toBe(3);
    expect(poolConfig(remote, { DB_POOL_MAX: "" }).max).toBe(5);
    expect(() => poolConfig(remote, { DB_POOL_MAX: "0" })).toThrow(/DB_POOL_MAX/);
    expect(() => poolConfig(remote, { DB_POOL_MAX: "2.5" })).toThrow(/DB_POOL_MAX/);
  });
});
