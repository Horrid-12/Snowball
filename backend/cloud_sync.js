import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Migration Config
const TARGET_EMAIL = 'justhorrid12@gmail.com';
const DAYS_TO_SYNC = 3; // Past 3 days

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
    console.log(`🚀 Starting Cloud Sync for ${TARGET_EMAIL}...`);

    try {
        const db = await open({
            filename: './database.sqlite',
            driver: sqlite3.Database
        });

        // 1. Find local user ID
        const localUser = await db.get('SELECT id FROM users WHERE email = ?', TARGET_EMAIL);
        if (!localUser) {
            console.error(`❌ Could not find local user with email ${TARGET_EMAIL}`);
            return;
        }
        const localUserId = localUser.id;

        // 2. Find Supabase user UUID
        const { data: cloudUsers, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('email', TARGET_EMAIL)
            .single();

        if (userError || !cloudUsers) {
            console.error('❌ Could not find user in Supabase. Please make sure you have REGISTERED with this email on the cloud version first.');
            return;
        }
        const cloudUserId = cloudUsers.id;

        console.log(`✅ Connected: Local ID ${localUserId} -> Cloud ID ${cloudUserId}`);

        // 3. Sync Habits (and build map)
        console.log('🧘 Syncing Habits...');
        const habits = await db.all('SELECT * FROM habits WHERE user_id = ?', localUserId);
        const habitMap = {}; // localId -> cloudId

        for (const h of habits) {
            // Check if habit already exists in cloud by name
            const { data: existing } = await supabase
                .from('habits')
                .select('id')
                .eq('user_id', cloudUserId)
                .eq('name', h.name)
                .single();

            if (existing) {
                habitMap[h.id] = existing.id;
                console.log(`   - Habit "${h.name}" already exists, mapping...`);
                continue;
            }

            const { data: newHabit, error: hErr } = await supabase
                .from('habits')
                .insert({
                    user_id: cloudUserId,
                    name: h.name,
                    frequency: h.frequency,
                    icon: h.icon,
                    color: h.color,
                    streak: h.streak
                })
                .select()
                .single();

            if (hErr) console.error(`   - Error syncing habit ${h.name}:`, hErr.message);
            else habitMap[h.id] = newHabit.id;
        }

        // 4. Sync Tasks (Last X days)
        console.log(`📝 Syncing Tasks (Last ${DAYS_TO_SYNC} days)...`);
        const tasks = await db.all(
            "SELECT * FROM tasks WHERE user_id = ? AND date >= date('now', ?)",
            localUserId, `-${DAYS_TO_SYNC} days`
        );

        for (const t of tasks) {
            const { error: tErr } = await supabase
                .from('tasks')
                .insert({
                    user_id: cloudUserId,
                    title: t.title,
                    description: t.description,
                    date: t.date,
                    tasks_allocated: t.tasksAllocated,
                    tasks_completed: t.tasksCompleted,
                    hours_allocated: t.hoursAllocated,
                    hours_taken: t.hoursTaken,
                    priority: t.priority,
                    tags: t.tags || ''
                });
            if (tErr) console.error(`   - Error syncing task ${t.title}:`, tErr.message);
        }
        console.log(`   - Synced ${tasks.length} tasks.`);

        // 5. Sync Habit Logs
        console.log('📊 Syncing Habit Logs...');
        const habitLogs = await db.all(
            "SELECT * FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE user_id = ?) AND date >= date('now', ?)",
            localUserId, `-${DAYS_TO_SYNC} days`
        );

        for (const l of habitLogs) {
            if (habitMap[l.habit_id]) {
                const { error: lErr } = await supabase
                    .from('habit_logs')
                    .insert({
                        habit_id: habitMap[l.habit_id],
                        date: l.date
                    });
                if (lErr && !lErr.message.includes('unique constraint')) {
                    console.error(`   - Error syncing log for habit ${l.habit_id}:`, lErr.message);
                }
            }
        }

        // 6. Sync Activity Logs
        console.log('🔥 Syncing Activity Logs...');
        const activityLogs = await db.all(
            "SELECT * FROM activity_logs WHERE user_id = ? AND date >= date('now', ?)",
            localUserId, `-${DAYS_TO_SYNC} days`
        );

        for (const a of activityLogs) {
            let refId = a.reference_id;
            if (a.type === 'HABIT' && habitMap[a.reference_id]) {
                refId = habitMap[a.reference_id];
            }

            const { error: aErr } = await supabase
                .from('activity_logs')
                .insert({
                    user_id: cloudUserId,
                    type: a.type,
                    reference_id: refId,
                    score: a.score,
                    date: a.date
                });
            if (aErr) console.error('   - Error syncing activity log:', aErr.message);
        }

        console.log('\n✅ Sync complete! Refresh your browser to see your data. ❄️🚀');

    } catch (err) {
        console.error('❌ Sync failed:', err);
    } finally {
        process.exit(0);
    }
}

sync();
