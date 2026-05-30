import type { KeyValueStore } from "./types";

/**
 * In-memory `KeyValueStore<T>` backed by a `Map`. Intended for tests
 * across all stores-consuming packages. Returns deep-equal references on
 * `get` / `list` — callers that need isolation must clone.
 */
export class MemoryStore<T> implements KeyValueStore<T> {
  private readonly map = new Map<string, T>();

  async get(key: string): Promise<T | null> {
    return this.map.has(key) ? (this.map.get(key) as T) : null;
  }

  async set(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async list(): Promise<Array<{ key: string; value: T }>> {
    return Array.from(this.map.entries()).map(([key, value]) => ({ key, value }));
  }
}
