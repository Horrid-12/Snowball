import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function read() {
    try {
        const db = await open({
            filename: './database.sqlite',
            driver: sqlite3.Database
        });
        const users = await db.all('SELECT id, username, email FROM users');
        console.log('USERS:', JSON.stringify(users, null, 2));

        const counts = {
            tasks: await db.get("SELECT COUNT(*) as count FROM tasks WHERE date >= date('now', '-2 days')"),
            habits: await db.get("SELECT COUNT(*) as count FROM habits"),
            activity: await db.get("SELECT COUNT(*) as count FROM activity_logs WHERE date >= date('now', '-3 days')")
        };
        console.log('COUNTS (Recent):', JSON.stringify(counts, null, 2));
    } catch (e) {
        console.error('FAILED:', e.message);
    }
}
read();
