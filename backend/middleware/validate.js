import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUUID = (value) => UUID_RE.test(value);

export const requireUUID = (paramName, source = 'params') => (req, res, next) => {
    const value = source === 'body' ? req.body?.[paramName] : req.params?.[paramName];
    if (!value || !UUID_RE.test(String(value))) {
        return res.status(400).json({ error: `Invalid ${paramName}: must be a valid UUID` });
    }
    next();
};

export const requireString = (paramName, { maxLength = Infinity, minLength = 1, source = 'body' } = {}) =>
    (req, res, next) => {
        const value = source === 'params' ? req.params?.[paramName] : req.query?.[paramName] || req.body?.[paramName];
        if (!value || typeof value !== 'string' || value.trim().length < minLength) {
            return res.status(400).json({ error: `${paramName} is required` });
        }
        if (value.trim().length > maxLength) {
            return res.status(400).json({ error: `${paramName} must be at most ${maxLength} characters` });
        }
        next();
    };

export const requireNumber = (paramName, { min, max, source = 'body' } = {}) =>
    (req, res, next) => {
        const raw = source === 'params' ? req.params?.[paramName] : source === 'query' ? req.query?.[paramName] : req.body?.[paramName];
        const num = Number(raw);
        if (!Number.isFinite(num)) {
            return res.status(400).json({ error: `${paramName} must be a number` });
        }
        if (min !== undefined && num < min) {
            return res.status(400).json({ error: `${paramName} must be at least ${min}` });
        }
        if (max !== undefined && num > max) {
            return res.status(400).json({ error: `${paramName} must be at most ${max}` });
        }
        next();
    };

export const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const firstError = result.error.errors[0];
        const message = firstError?.message || 'Validation failed';
        return res.status(400).json({ error: message });
    }
    // Merge validated data back into raw body so extra fields (e.g. camelCase task fields)
    // that zod strips are preserved. Known/schema fields get validated+transformed,
    // unknown fields pass through untouched.
    req.validatedBody = { ...req.body, ...result.data };
    next();
};

export const schemas = {
    register: z.object({
        username: z.string().trim().min(1, 'Username is required').max(50, 'Username must be at most 50 characters'),
        email: z.string().trim().email('Invalid email').max(255, 'Email must be at most 255 characters'),
        password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters')
    }),
    login: z.object({
        username: z.string().trim().min(1, 'Username/email is required'),
        password: z.string().min(1, 'Password is required')
    }),
    forgotPassword: z.object({
        identifier: z.string().trim().min(1, 'Username or email is required')
    }),
    task: z.object({
        title: z.string().trim().min(1, 'Title is required').max(255, 'Title must be at most 255 characters'),
        description: z.string().optional().default(''),
        date: z.string().optional().nullable(),
        priority: z.string().optional().default('Medium'),
        tags: z.string().optional().default(''),
        position: z.number().optional(),
        is_sticky: z.union([z.boolean(), z.number()]).optional(),
        is_pinned: z.union([z.boolean(), z.number()]).optional(),
        is_archived: z.union([z.boolean(), z.number()]).optional(),
        recurring: z.string().optional().nullable(),
        tasks_allocated: z.number().optional(),
        tasks_completed: z.number().optional(),
        hours_allocated: z.number().optional(),
        hours_taken: z.number().optional(),
        due_date: z.string().optional().nullable(),
        completed_at: z.string().optional().nullable(),
        timer_state: z.record(z.any()).optional().nullable()
    }),
    taskUpdate: z.object({
        title: z.string().trim().min(1).max(255).optional(),
        description: z.string().optional(),
        date: z.string().optional().nullable(),
        priority: z.string().optional(),
        tags: z.string().optional(),
        position: z.number().optional(),
        is_sticky: z.union([z.boolean(), z.number()]).optional(),
        is_pinned: z.union([z.boolean(), z.number()]).optional(),
        is_archived: z.union([z.boolean(), z.number()]).optional(),
        recurring: z.string().optional().nullable(),
        tasks_allocated: z.number().optional(),
        tasks_completed: z.number().optional(),
        hours_allocated: z.number().optional(),
        hours_taken: z.number().optional(),
        due_date: z.string().optional().nullable(),
        completed_at: z.string().optional().nullable(),
        timer_state: z.record(z.any()).optional().nullable()
    }),
    habit: z.object({
        name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
        frequency: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional()
    }),
    habitUpdate: z.object({
        name: z.string().trim().min(1).max(100).optional(),
        frequency: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional()
    }),
    note: z.object({
        note_id: z.string().min(1, 'note_id is required').max(100, 'note_id must be at most 100 characters'),
        title: z.string().optional().default('Untitled'),
        content: z.string().optional().default('')
    }),
    noteUpsert: z.object({
        note_id: z.string().min(1, 'note_id is required').max(100, 'note_id must be at most 100 characters'),
        title: z.string().max(500, 'Title must be at most 500 characters').optional().default('Untitled'),
        content: z.string().max(100000, 'Content must be at most 100000 characters').optional().default('')
    }),
    friendRequest: z.object({
        userId: z.string().trim().min(1, 'Friend user id is required').max(20)
    }),
    friendMessage: z.object({
        body: z.string().trim().min(1, 'Message cannot be empty').max(1000, 'Message is too long')
    }),
    presence: z.object({
        details: z.string().optional().default(''),
        state: z.string().optional().default(''),
        activityType: z.string().optional().default('Snowball'),
        remainingTasks: z.number().optional().default(0),
        todayRemainingTasks: z.number().optional().default(0),
        score: z.number().optional().default(0)
    }),
    spotifyCredentials: z.object({
        clientId: z.string().trim().min(1, 'Client ID is required'),
        clientSecret: z.string().trim().min(1, 'Client Secret is required')
    }),
    userSettings: z.object({
        reset_offset_hours: z.number().optional(),
        timezone_offset_minutes: z.number().optional(),
        penalty_buffer_hours: z.number().optional(),
        appearance_settings: z.any().optional(),
        profile_icon: z.string().optional(),
        tag_colors: z.any().optional(),
        study_timer_state: z.any().optional()
    }),
    studySession: z.object({
        subject: z.string().trim().min(1, 'Subject is required').max(255),
        started_at: z.string().datetime(),
        ended_at: z.string().datetime(),
        duration_ms: z.number().int().nonnegative()
    }),
    studySessionUpdate: z.object({
        subject: z.string().trim().min(1).max(255).optional(),
        started_at: z.string().datetime().optional(),
        ended_at: z.string().datetime().optional(),
        duration_ms: z.number().int().nonnegative().optional()
    })
};
