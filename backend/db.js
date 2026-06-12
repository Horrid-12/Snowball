import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

let _serviceClient = null;

// Case-insensitive env var lookup — handles any casing (ALL_CAPS, mixed_Case, lowercase, etc.)
const env = (name) => {
    const upper = name.toUpperCase();
    for (const key of Object.keys(process.env)) {
        if (key.toUpperCase() === upper) return process.env[key];
    }
    return undefined;
};

const getSupabaseUrl = () => {
    const url = env('SUPABASE_URL');
    if (!url) throw new Error('SUPABASE_URL environment variable is required.');
    return url;
};

// Service role client — bypasses RLS, for admin operations (auth, user management)
export const getServiceClient = () => {
    if (_serviceClient) return _serviceClient;

    const supabaseUrl = getSupabaseUrl();
    const supabaseServiceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseKey = supabaseServiceRoleKey || env('SUPABASE_KEY');

    if (!supabaseKey) {
        throw new Error('Supabase credentials missing. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY on the backend.');
    }

    _serviceClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    return _serviceClient;
};

// Creates an anon-key client for public (non-user-scoped) queries.
// This client does NOT send a user JWT to Supabase, so RLS policies
// relying on auth.uid() won't apply. For user-scoped queries, use the
// service role client and filter by user_id at the app level.
export const getAnonClient = () => {
    const supabaseUrl = getSupabaseUrl();
    const supabaseAnonKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_KEY');

    if (!supabaseAnonKey) {
        throw new Error('Supabase credentials missing. Set SUPABASE_ANON_KEY or SUPABASE_KEY on the backend.');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });
};

// Legacy default export — points to the service client for backward compatibility
export const supabase = new Proxy({}, {
    get: (target, prop) => getServiceClient()[prop]
});

export const initDB = async () => {
    try {
        getServiceClient();
        console.log('⚡ Connected to Supabase');
    } catch (e) {
        console.error('❌ DB Init Failed:', e.message);
    }
    return true;
};
