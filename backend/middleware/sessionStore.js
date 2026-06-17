import { supabase } from '../db.js';

export const revokeToken = async (jti, exp) => {
    if (!jti || !exp) return;
    try {
        await supabase
            .from('token_blacklist')
            .insert({ jti, exp });
    } catch {
        // Logout should succeed even if Supabase is unavailable;
        // the cookie is cleared client-side regardless.
    }
};

export const isTokenRevoked = async (jti) => {
    if (!jti) return false;
    try {
        // Prune expired tokens first
        await supabase.rpc('prune_expired_blacklist');

        const { data } = await supabase
            .from('token_blacklist')
            .select('jti')
            .eq('jti', jti)
            .maybeSingle();

        return !!data;
    } catch {
        // Fail open — if Supabase is down, don't lock everyone out
        return false;
    }
};
