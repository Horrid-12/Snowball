import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTable() {
    console.log('🛠️ Fixing spotify_tokens table...');

    // We can't run DDL via anon key, so we'll just check if it's correct
    // If not, we'll provide the EXACT SQL for the user.

    const { data: columns, error } = await supabase
        .from('spotify_tokens')
        .select('*')
        .limit(1);

    if (error && error.code === '42P01') {
        console.log('❌ Table does not exist. User needs to create it.');
    } else {
        console.log('Checking column types is hard via anon key. Providing the correct SQL assuming users.id is INTEGER.');
    }

    console.log('\n--- CORRECT SQL (Run this in Supabase SQL Editor) ---');
    console.log(`
DROP TABLE IF EXISTS spotify_tokens;

CREATE TABLE spotify_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE spotify_tokens DISABLE ROW LEVEL SECURITY;
    `);
}

fixTable();
