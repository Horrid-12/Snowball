import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Client Config from 'npx firebase apps:sdkconfig WEB'
const firebaseConfig = {
    "projectId": "snowball-e5a08",
    "appId": "1:461291578682:web:ac11004b093f0ec9465c03",
    "storageBucket": "snowball-e5a08.firebasestorage.app",
    "apiKey": "AIzaSyDR6vatiKo3SPTJQmw7FtR_Qxq_edCfTV8",
    "authDomain": "snowball-e5a08.firebaseapp.com",
    "messagingSenderId": "461291578682",
    "measurementId": "G-ST11T8VK1T",
    "projectNumber": "461291578682",
    "version": "2"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

async function migrate() {
    console.log('🚀 Starting Migration: SQLite -> Firestore (via Client SDK)...');

    const db = await open({
        filename: path.resolve(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    const userMap = {}; // sqliteId -> firestoreId
    const habitMap = {}; // sqliteId -> firestoreId

    // 1. Migrate Users
    console.log('👤 Migrating Users...');
    const users = await db.all('SELECT * FROM users');
    for (const user of users) {
        const docRef = await addDoc(collection(firestore, 'users'), {
            username: user.username,
            email: user.email,
            password: user.password,
            created_at: serverTimestamp() // Better to use server time for migration
        });
        userMap[user.id] = docRef.id;
        console.log(`   - Migrated user: ${user.username} (${docRef.id})`);
    }

    // 2. Migrate Tasks
    console.log('📝 Migrating Tasks...');
    const tasks = await db.all('SELECT * FROM tasks');
    for (const task of tasks) {
        await addDoc(collection(firestore, 'tasks'), {
            user_id: userMap[task.user_id] || 'guest',
            title: task.title,
            description: task.description || '',
            date: task.date || null,
            tasksAllocated: task.tasksAllocated || 0,
            tasksCompleted: task.tasksCompleted || 0,
            hoursAllocated: task.hoursAllocated || 0.0,
            hoursTaken: task.hoursTaken || 0.0,
            priority: task.priority || 'Medium'
        });
    }
    console.log(`   - Migrated ${tasks.length} tasks.`);

    // 3. Migrate Habits
    console.log('🧘 Migrating Habits...');
    const habits = await db.all('SELECT * FROM habits');
    for (const habit of habits) {
        const docRef = await addDoc(collection(firestore, 'habits'), {
            user_id: userMap[habit.user_id],
            name: habit.name,
            frequency: habit.frequency || 'Daily',
            icon: habit.icon || 'Circle',
            color: habit.color || 'var(--accent-color)',
            streak: habit.streak || 0,
            created_at: serverTimestamp()
        });
        habitMap[habit.id] = docRef.id;
    }
    console.log(`   - Migrated ${habits.length} habits.`);

    // 4. Migrate Habit Logs
    console.log('📊 Migrating Habit Logs...');
    const habitLogs = await db.all('SELECT * FROM habit_logs');
    for (const log of habitLogs) {
        if (habitMap[log.habit_id]) {
            await addDoc(collection(firestore, 'habit_logs'), {
                habit_id: habitMap[log.habit_id],
                date: log.date,
                created_at: serverTimestamp()
            });
        }
    }
    console.log(`   - Migrated ${habitLogs.length} habit logs.`);

    // 5. Migrate Activity Logs
    console.log('🔥 Migrating Activity Logs...');
    const activityLogs = await db.all('SELECT * FROM activity_logs');
    for (const log of activityLogs) {
        if (userMap[log.user_id]) {
            await addDoc(collection(firestore, 'activity_logs'), {
                user_id: userMap[log.user_id],
                type: log.type,
                reference_id: log.type === 'HABIT' ? habitMap[log.reference_id] : log.reference_id,
                score: log.score || 1.0,
                date: log.date,
                created_at: serverTimestamp()
            });
        }
    }
    console.log(`   - Migrated ${activityLogs.length} activity logs.`);

    console.log('\n✅ Migration complete! Your data is now in the cloud. 🏔️☁️');
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
