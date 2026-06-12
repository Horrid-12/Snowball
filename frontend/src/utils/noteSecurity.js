import { BiometricAuth, AndroidBiometryStrength } from '@aparajita/capacitor-biometric-auth';

const LOCK_PREFIX = '__SNOWBALL_LOCKED_NOTE_V1__';
const PASSWORD_LOCK_TYPE = 'password';
const PASSWORD_ITERATIONS = 250000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const cryptoObject = () => {
    if (typeof window === 'undefined' || !window.crypto?.subtle) {
        throw new Error('Secure note locking is not available in this environment.');
    }

    return window.crypto;
};

const bytesToBase64 = (bytes) => {
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
};

const base64ToBytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const bytesToBase64Url = (bytes) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const base64UrlToBytes = (value) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return base64ToBytes(padded);
};

const randomBytes = (size) => {
    const bytes = new Uint8Array(size);
    cryptoObject().getRandomValues(bytes);
    return bytes;
};

const importAesKey = async (rawKeyBytes) => cryptoObject().subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
);

const derivePasswordKey = async (password, saltBytes) => {
    const material = await cryptoObject().subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return cryptoObject().subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: PASSWORD_ITERATIONS,
            hash: 'SHA-256'
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

const encryptWithKey = async (html, key) => {
    const iv = randomBytes(12);
    const cipherBuffer = await cryptoObject().subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(html)
    );

    return {
        iv: bytesToBase64(iv),
        cipherText: bytesToBase64(new Uint8Array(cipherBuffer))
    };
};

const decryptWithKey = async ({ cipherText, iv }, key) => {
    const plainBuffer = await cryptoObject().subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(iv) },
        key,
        base64ToBytes(cipherText)
    );

    return decoder.decode(plainBuffer);
};

const stringifyLockedPayload = (payload) => `${LOCK_PREFIX}${JSON.stringify(payload)}`;

export const parseLockedNoteContent = (content) => {
    if (typeof content !== 'string' || !content.startsWith(LOCK_PREFIX)) {
        return null;
    }

    try {
        const parsed = JSON.parse(content.slice(LOCK_PREFIX.length));
        if (!parsed?.type || !parsed?.cipherText || !parsed?.iv) {
            return null;
        }
        return parsed;
    } catch (_error) {
        return null;
    }
};

export const isLockedNoteContent = (content) => Boolean(parseLockedNoteContent(content));

export const lockNoteWithPassword = async (html, password) => {
    if (!password) {
        throw new Error('A password is required to lock this note.');
    }

    const salt = randomBytes(16);
    const key = await derivePasswordKey(password, salt);
    const encrypted = await encryptWithKey(html, key);

    return stringifyLockedPayload({
        version: 1,
        type: PASSWORD_LOCK_TYPE,
        salt: bytesToBase64(salt),
        iterations: PASSWORD_ITERATIONS,
        ...encrypted
    });
};

export const unlockNoteWithPassword = async (lockedContent, password) => {
    const payload = parseLockedNoteContent(lockedContent);
    if (!payload || payload.type !== PASSWORD_LOCK_TYPE) {
        throw new Error('This note is not password locked.');
    }

    const key = await derivePasswordKey(password, base64ToBytes(payload.salt));
    return decryptWithKey(payload, key);
};

export const isBiometricUnlockSupported = async () => {
    try {
        const result = await BiometricAuth.checkBiometry();
        return Boolean(result?.isAvailable || result?.deviceIsSecure);
    } catch (_error) {
        return false;
    }
};

export const getBiometricUnlockStatus = async () => {
    try {
        const result = await BiometricAuth.checkBiometry();
        return {
            available: Boolean(result?.isAvailable || result?.deviceIsSecure),
            biometricsAvailable: Boolean(result?.isAvailable),
            deviceSecure: Boolean(result?.deviceIsSecure),
            reason: result?.reason || result?.strongReason || ''
        };
    } catch (error) {
        return {
            available: false,
            biometricsAvailable: false,
            deviceSecure: false,
            reason: error instanceof Error ? error.message : 'Secure unlock unavailable'
        };
    }
};

export const registerBiometricUnlock = async (_noteId, _noteTitle) => {
    if (!(await isBiometricUnlockSupported())) {
        throw new Error('Biometric unlock is not supported on this device.');
    }

    await verifyBiometricUnlock();
    return 'native-biometric';
};

export const verifyBiometricUnlock = async () => {
    if (!(await isBiometricUnlockSupported())) {
        throw new Error('Biometric unlock is not supported on this device.');
    }

    await BiometricAuth.authenticate({
        reason: 'Unlock your Snowball note',
        androidTitle: 'Unlock note',
        androidSubtitle: 'Use face or fingerprint to continue',
        androidConfirmationRequired: false,
        androidBiometryStrength: AndroidBiometryStrength.weak,
        allowDeviceCredential: true
    });
    return true;
};

export const noteLockTypes = {
    password: PASSWORD_LOCK_TYPE
};
