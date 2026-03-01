import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

// Connection string from Supabase (to be provided by user)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ Error: DATABASE_URL environment variable is not set.');
    process.exit(1);
}

const client = new Client({ connectionString });

async function migrate() {
    console.log('🚀 Starting Migration: SQLite -> Supabase (PostgreSQL)...');

    try {
        await client.connect();

        const db = await open({
            filename: path.resolve(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });

        const userMap = {}; // sqliteId -> postgresId
        const habitMap = {}; // sqliteId -> postgresId

        // 1. Migrate Users
        console.log('👤 Migrating Users...');
        const users = await db.all('SELECT * FROM users');
        for (const user of users) {
            const res = await client.query(
                'INSERT INTO users (username, email, password, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
                [user.username, user.email, user.password, user.created_at || new Date()]
            );
            userMap[user.id] = res.rows[0].id;
        }
        console.log(`   - Migrated ${users.length} users.`);

        // 2. Migrate Tasks
        console.log('📝 Migrating Tasks...');
        const tasks = await db.all('SELECT * FROM tasks');
        for (const task of tasks) {
            await client.query(
                `INSERT INTO tasks 
                (user_id, title, description, date, tasks_allocated, tasks_completed, hours_allocated, hours_taken, priority) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    userMap[task.user_id] || null,
                    task.title,
                    task.description,
                    task.date,
                    task.tasksAllocated || 0,
                    task.tasksCompleted || 0,
                    task.hoursAllocated || 0,
                    task.hoursTaken || 0,
                    task.priority || 'Medium'
                ]
            );
        }
        console.log(`   - Migrated ${tasks.length} tasks.`);

        // 3. Migrate Habits
        console.log('🧘 Migrating Habits...');
        const habits = await db.all('SELECT * FROM habits');
        for (const habit of habits) {
            const res = await client.query(
                'INSERT INTO habits (user_id, name, frequency, icon, color, streak, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [
                    userMap[habit.user_id],
                    habit.name,
                    habit.frequency || 'Daily',
                    habit.icon,
                    habit.color,
                    habit.streak || 0,
                    habit.created_at || new Date()
                ]
            );
            habitMap[habit.id] = res.rows[0].id;
        }
        console.log(`   - Migrated ${habits.length} habits.`);

        // 4. Migrate Habit Logs
        console.log('📊 Migrating Habit Logs...');
        const habitLogs = await db.all('SELECT * FROM habit_logs');
        for (const log of habitLogs) {
            if (habitMap[log.habit_id]) {
                await client.query(
                    'INSERT INTO habit_logs (habit_id, date, created_at) VALUES ($1, $2, $3)',
                    [habitMap[log.habit_id], log.date, log.created_at || new Date()]
                );
            }
        }
        console.log(`   - Migrated ${habitLogs.length} habit logs.`);

        // 5. Migrate Activity Logs
        console.log('🔥 Migrating Activity Logs...');
        const activityLogs = await db.all('SELECT * FROM activity_logs');
        for (const log of activityLogs) {
            if (userMap[log.user_id]) {
                await client.query(
                    'INSERT INTO activity_logs (user_id, type, reference_id, score, date, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
                    [
                        userMap[log.user_id],
                        log.type,
                        log.type === 'HABIT' ? habitMap[log.reference_id] : log.reference_id,
                        log.score || 1.0,
                        log.date,
                        log.created_at || new Date()
                    ]
                );
            }
        }
        console.log(`   - Migrated ${activityLogs.length} activity logs.`);

        console.log('\n✅ Migration complete! Your data is now in Supabase. 🐘✨');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await client.end();
        process.exit(0);
    }
}

migrate();
