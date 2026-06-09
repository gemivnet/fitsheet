// db/index.ts — DB layer on Node's built-in node:sqlite (no native build needed on Node 24).
// A thin wrapper gives us better-sqlite3-style `prepare/exec/transaction` so routes stay simple.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}
export interface Stmt {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
}
export interface DB {
  prepare(sql: string): Stmt;
  exec(sql: string): void;
  /** Wrap fn in BEGIN/COMMIT (ROLLBACK on throw). Call the returned function to run it. */
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
  close(): void;
}

export function dataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), 'data');
}
export function dbPath(): string {
  return join(dataDir(), 'fitsheet.db');
}
export function uploadsDir(): string {
  return join(dataDir(), 'uploads');
}

export function openDb(path: string = dbPath()): DB {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
    mkdirSync(uploadsDir(), { recursive: true });
  }
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');

  return {
    prepare(sql: string): Stmt {
      const s = raw.prepare(sql);
      // Tolerate object params that carry extra keys (better-sqlite3 throws; we don't).
      try {
        s.setAllowUnknownNamedParameters(true);
      } catch {
        /* older runtime */
      }
      return s as unknown as Stmt;
    },
    exec(sql: string): void {
      raw.exec(sql);
    },
    transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
      return (...args: A) => {
        raw.exec('BEGIN');
        try {
          fn(...args);
          raw.exec('COMMIT');
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        }
      };
    },
    close(): void {
      raw.close();
    },
  };
}
