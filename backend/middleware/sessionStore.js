import { supabase } from '../db.js';

const revokedTokens = new Map();

// Sync revoked tokens from Supabase periodically
const syncRevokedTokens = async () => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const { data, error } = await supabase
            .from('token_blacklist')
            .select('jti, exp')
            .gt('exp', now);

        if (error) throw error;
        
        for (const token of data) {
            revokedTokens.set(token.jti, token.exp);
        }
        
        // Prune expired tokens from memory
        for (const [jti, exp] of revokedTokens.entries()) {
            if (exp <= now) {
                revokedTokens.delete(jti);
            }
        }
    } catch (err) {
        console.warn('Failed to sync revoked tokens from Supabase:', err.message);
    }
};

// Initial preload
syncRevokedTokens();
// Background sync every 60s
setInterval(syncRevokedTokens, 60 * 1000);

export const revokeToken = async (jti, exp) => {
    if (!jti || !exp) return;
    
    // In-memory update
    revokedTokens.set(jti, exp);

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
    return revokedTokens.has(jti);
};
