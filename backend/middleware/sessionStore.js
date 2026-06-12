const revokedTokens = new Map();

const pruneExpiredTokens = (nowInSeconds) => {
    for (const [jti, exp] of revokedTokens.entries()) {
        if (exp <= nowInSeconds) {
            revokedTokens.delete(jti);
        }
    }
};

export const revokeToken = (jti, exp) => {
    if (!jti || !exp) return;
    pruneExpiredTokens(Math.floor(Date.now() / 1000));
    revokedTokens.set(jti, exp);
};

export const isTokenRevoked = (jti) => {
    if (!jti) return false;
    pruneExpiredTokens(Math.floor(Date.now() / 1000));
    return revokedTokens.has(jti);
};
