import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

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
        console.log('Table exists — providing lockdown SQL (users.id is INTEGER).');
    }

    console.log('\n--- LOCKDOWN SQL (Run this in Supabase SQL Editor) ---');
    console.log(`
-- Does NOT touch data: only flips RLS on and revokes API-role grants.
ALTER TABLE public.spotify_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotify_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.spotify_tokens FROM anon, authenticated;

-- If the table is missing entirely, create it with RLS on from the start:
CREATE TABLE IF NOT EXISTS public.spotify_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
    `);
}

fixTable();
