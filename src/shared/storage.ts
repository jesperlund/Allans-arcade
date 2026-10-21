function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode etc.) – the games still work.
  }
}

/** Key/value storage namespaced per game, so games never clash. */
export interface Store {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  getNumber(key: string): number;
  getJSON<T>(key: string): T | null;
  setJSON(key: string, value: unknown): void;
}

export function createStore(namespace: string): Store {
  const k = (key: string) => `${namespace}.${key}`;
  return {
    get: (key) => get(k(key)),
    set: (key, value) => set(k(key), value),
    getNumber: (key) => Number(get(k(key))) || 0,
    getJSON<T>(key: string): T | null {
      try {
        const raw = get(k(key));
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    setJSON: (key, value) => set(k(key), value == null ? null : JSON.stringify(value)),
  };
}
