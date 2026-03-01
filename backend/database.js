import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'database.sqlite');

let db;

export const initDB = async () => {
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            date TEXT,
            tasksAllocated INTEGER DEFAULT 0,
            tasksCompleted INTEGER DEFAULT 0,
            hoursAllocated REAL DEFAULT 0.0,
            hoursTaken REAL DEFAULT 0.0,
            priority TEXT DEFAULT 'Medium',
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            frequency TEXT DEFAULT 'Daily',
            icon TEXT,
            color TEXT,
            streak INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS habit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            date TEXT NOT NULL, -- YYYY-MM-DD
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (habit_id) REFERENCES habits (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'TASK_STEP', 'HABIT'
            reference_id INTEGER,
            score REAL DEFAULT 1.0,
            date TEXT NOT NULL, -- YYYY-MM-DD
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
    `);

    // Ensure user_id column exists in tasks if migrating
    try {
        await db.exec('ALTER TABLE tasks ADD COLUMN user_id INTEGER REFERENCES users(id)');
    } catch (e) {
        // Column probably exists
    }

    // Ensure priority column exists in tasks if migrating
    try {
        await db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'Medium'");
    } catch (e) {
        // Column probably exists
    }

    // Create default guest user if no users exist
    let guestUser = await db.get('SELECT id FROM users WHERE username = ?', 'guest');
    if (!guestUser) {
        console.log('Creating default guest user...');
        const result = await db.run(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            'guest', 'guest@example.com', 'none'
        );
        guestUser = { id: result.lastID };
    }

    // Assign orphaned tasks to guest user
    await db.run('UPDATE tasks SET user_id = ? WHERE user_id IS NULL', guestUser.id);

    // Seed data if table is empty
    const count = await db.get('SELECT COUNT(*) as count FROM tasks');
    if (count.count === 0) {
        console.log('Seeding initial tasks...');
        const stmt = await db.prepare(`
            INSERT INTO tasks (title, description, date, tasksAllocated, tasksCompleted, hoursAllocated, hoursTaken, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        await stmt.run('Finish CS1 syllabus', 'Read chapters 1-5 and do exercises', new Date(Date.now() + 86400000).toISOString(), 5, 2, 10.0, 4.5, guestUser.id);
        await stmt.run('Study for CS2', 'Review past papers', new Date(Date.now() + 172800000).toISOString(), 10, 0, 15.0, 0.0, guestUser.id);
        await stmt.run('Write essay draft', 'Draft the 1500-word essay for History', new Date(Date.now() + 259200000).toISOString(), 1, 1, 3.0, 3.5, guestUser.id);

        await stmt.finalize();
        console.log('Seeding complete.');
    }

    return db;
};

export const getDB = () => {
    if (!db) {
        throw new Error('Database not initialized. Call initDB first.');
    }
    return db;
};
