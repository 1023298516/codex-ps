import { getDB } from './db.js';
export function kvGet(key) {
    const row = getDB()
        .prepare('SELECT value FROM kv WHERE key = ?')
        .get(key);
    if (!row)
        return undefined;
    try {
        return JSON.parse(row.value);
    }
    catch {
        return undefined;
    }
}
export function kvSet(key, value) {
    getDB()
        .prepare(`INSERT INTO kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(key, JSON.stringify(value));
}
export function kvDelete(key) {
    getDB().prepare('DELETE FROM kv WHERE key = ?').run(key);
}
//# sourceMappingURL=kv.js.map