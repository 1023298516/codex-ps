import { randomUUID } from 'node:crypto';
import { getDB } from './db.js';
function rowToChat(row) {
    return {
        id: row.id,
        title: row.title,
        provider: row.provider,
        model: row.model,
        sessionId: row.session_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function rowToMessage(row) {
    return {
        id: row.id,
        chatId: row.chat_id,
        role: row.role,
        content: JSON.parse(row.content),
        createdAt: row.created_at,
    };
}
export function listChats() {
    const rows = getDB()
        .prepare('SELECT * FROM chats ORDER BY updated_at DESC')
        .all();
    return rows.map(rowToChat);
}
export function getChat(id) {
    const row = getDB()
        .prepare('SELECT * FROM chats WHERE id = ?')
        .get(id);
    return row ? rowToChat(row) : null;
}
export function getMessages(chatId) {
    const rows = getDB()
        .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
        .all(chatId);
    return rows.map(rowToMessage);
}
export function createChat(input) {
    const now = Date.now();
    const chat = {
        id: randomUUID(),
        title: input.title ?? 'New chat',
        provider: input.provider,
        model: input.model,
        sessionId: null,
        createdAt: now,
        updatedAt: now,
    };
    getDB()
        .prepare(`INSERT INTO chats (id, title, provider, model, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(chat.id, chat.title, chat.provider, chat.model, chat.sessionId, chat.createdAt, chat.updatedAt);
    return chat;
}
export function appendMessage(input) {
    const now = Date.now();
    const msg = {
        id: randomUUID(),
        chatId: input.chatId,
        role: input.role,
        content: input.content,
        createdAt: now,
    };
    const db = getDB();
    const tx = db.transaction(() => {
        db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`).run(msg.id, msg.chatId, msg.role, JSON.stringify(msg.content), msg.createdAt);
        db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(now, input.chatId);
    });
    tx();
    return msg;
}
export function renameChat(id, title) {
    getDB().prepare(`UPDATE chats SET title = ?, updated_at = ? WHERE id = ?`).run(title, Date.now(), id);
}
export function updateChatModel(id, provider, model) {
    getDB()
        .prepare(`UPDATE chats SET provider = ?, model = ?, updated_at = ? WHERE id = ?`)
        .run(provider, model, Date.now(), id);
}
export function deleteChat(id) {
    getDB().prepare(`DELETE FROM chats WHERE id = ?`).run(id);
}
export function setChatSessionId(id, sessionId) {
    getDB().prepare(`UPDATE chats SET session_id = ? WHERE id = ?`).run(sessionId, id);
}
//# sourceMappingURL=chats.js.map