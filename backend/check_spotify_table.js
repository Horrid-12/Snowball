import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
    console.log('🔍 Checking if spotify_tokens table exists...');
    const { data, error } = await supabase
        .from('spotify_tokens')
        .select('count', { count: 'exact', head: true });

    if (error) {
        if (error.code === '42P01') {
            console.error('❌ Table "spotify_tokens" does NOT exist!');
            console.log('\nRun this SQL in your Supabase SQL Editor:\n');
            console.log(`
CREATE TABLE spotify_tokens (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS just in case, though we use service role or disable it
ALTER TABLE spotify_tokens ENABLE ROW LEVEL SECURITY;

-- If you want to keep it simple (Express handles security):
ALTER TABLE spotify_tokens DISABLE ROW LEVEL SECURITY;
            `);
        } else {
            console.error('❌ Unexpected error:', error.message);
        }
    } else {
        console.log('✅ table "spotify_tokens" exists.');
    }
}

checkTable();
