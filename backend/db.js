import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

let _supabase = null;

export const getSupabase = () => {
    if (_supabase) return _supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials missing. Check Vercel environment variables (SUPABASE_URL, SUPABASE_KEY)');
    }

    _supabase = createClient(supabaseUrl, supabaseKey);
    return _supabase;
};

// Proxied object to avoid refactoring every line in routes
export const supabase = new Proxy({}, {
    get: (target, prop) => getSupabase()[prop]
});

// Helper for consistency with logic
export const initDB = async () => {
    try {
        getSupabase();
        console.log('⚡ Connected to Supabase');
    } catch (e) {
        console.error('❌ DB Init Failed:', e.message);
    }
    return true;
};
