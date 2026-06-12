export const getApiErrorMessage = (payload, fallback = 'Something went wrong') => {
    if (!payload) return fallback;

    if (typeof payload === 'string') return payload;

    if (typeof payload.error === 'string') return payload.error;

    if (payload.error && typeof payload.error.message === 'string') {
        return payload.error.message;
    }

    if (typeof payload.message === 'string') return payload.message;

    return fallback;
};
