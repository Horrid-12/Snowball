import { supabase } from './db.js';

/**
 * Returns the current date (YYYY-MM-DD) adjusted by the user's custom reset offset.
 * Example: If offset is 4 (4:00 AM reset), and it is currently 3:00 AM,
 * it will return yesterday's date.
 */
export const getTodayWithOffset = async (userId) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('reset_offset_hours, timezone_offset_minutes')
            .eq('id', userId)
            .single();

        const offset = user?.reset_offset_hours || 0;
        const tzOffset = user?.timezone_offset_minutes || 0; // client offset in minutes
        
        const now = new Date();
        // Adjust for timezone (to get local wall clock) and then subtract reset offset hours
        const shifted = new Date(now.getTime() - (tzOffset * 60 * 1000) - (offset * 60 * 60 * 1000));
        
        return shifted.toISOString().split('T')[0];
    } catch (err) {
        console.error('Failed to get user offset:', err);
        return new Date().toISOString().split('T')[0];
    }
};

/**
 * Returns the past DATE string adjusted by offset (e.g., 365 days ago)
 */
export const getPastDateWithOffset = async (userId, daysAgo) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('reset_offset_hours, timezone_offset_minutes')
            .eq('id', userId)
            .single();

        const offset = user?.reset_offset_hours || 0;
        const tzOffset = user?.timezone_offset_minutes || 0;
        
        const target = new Date();
        const shifted = new Date(target.getTime() - (tzOffset * 60 * 1000) - (offset * 60 * 60 * 1000));
        shifted.setDate(shifted.getDate() - daysAgo);
        
        return shifted.toISOString().split('T')[0];
    } catch (err) {
        const target = new Date();
        target.setDate(target.getDate() - daysAgo);
        return target.toISOString().split('T')[0];
    }
};
