import pg from 'pg';

const { Pool } = pg;

// Use DATABASE_URL from environment
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Supabase in some environments
    }
});

/**
 * Supabase/PostgreSQL Database Wrapper
 * Mimics the SQLite pattern used in routes.
 */
export const getDB = () => {
    return {
        // Query multiple rows
        all: async (text, params = []) => {
            const res = await pool.query(text, params);
            return res.rows;
        },

        // Query a single row
        get: async (text, params = []) => {
            const res = await pool.query(text, params);
            return res.rows[0] || null;
        },

        // Execute a command (INSERT, UPDATE, DELETE)
        run: async (text, params = []) => {
            const res = await pool.query(`${text} RETURNING id`, params);
            return {
                lastID: res.rows[0]?.id,
                changes: res.rowCount
            };
        },

        // Native pool access
        pool
    };
};

export const initDB = async () => {
    // Shared pool handles connections
    console.log('🐘 Supabase (PostgreSQL) Connected.');
    return getDB();
};
