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

const knownGoodTokens = new Map();

export const revokeToken = async (jti, exp) => {
    if (!jti || !exp) return;
    
    // In-memory update
    revokedTokens.set(jti, exp);
    knownGoodTokens.delete(jti);

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

    // 1. Fast path: known revoked in memory
    if (revokedTokens.has(jti)) {
        return true;
    }

    // 2. Fast path: known good token (cached within last 30s to avoid hammering DB on every request)
    const now = Date.now();
    const goodUntil = knownGoodTokens.get(jti);
    if (goodUntil && goodUntil > now) {
        return false;
    }

    // 3. Fallback: Query Supabase token_blacklist directly to handle cold-starts and cross-instance delays
    try {
        const { data, error } = await supabase
            .from('token_blacklist')
            .select('jti, exp')
            .eq('jti', jti)
            .maybeSingle();

        if (error) {
            console.warn('Session store check error (fail-open):', error.message);
            return false;
        }

        if (data && data.jti) {
            revokedTokens.set(data.jti, data.exp);
            knownGoodTokens.delete(jti);
            return true;
        }

        // Cache as valid for 30 seconds
        knownGoodTokens.set(jti, now + 30 * 1000);

        // Periodically prune expired entries if map grows
        if (knownGoodTokens.size > 1000) {
            for (const [key, expMs] of knownGoodTokens.entries()) {
                if (expMs <= now) knownGoodTokens.delete(key);
            }
        }

        return false;
    } catch (err) {
        console.warn('Session store check failed (fail-open):', err.message);
        return false;
    }
};
