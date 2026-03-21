/**
 * Utility functions for date calculations based on user-defined reset times
 */

/**
 * Get the current "day" date string based on user's reset time
 * @param {number} resetTimeHour - Hour of day (0-23) when habits reset
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getCurrentDay = (resetTimeHour = 0) => {
    const now = new Date();
    const currentHour = now.getUTCHours();

    // If current hour is before reset time, we're still in the previous day
    if (currentHour < resetTimeHour) {
        const yesterday = new Date(now);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        return yesterday.toISOString().split('T')[0];
    }

    return now.toISOString().split('T')[0];
};

/**
 * Get the date range for the last N days based on user's reset time
 * @param {number} days - Number of days to go back
 * @param {number} resetTimeHour - Hour of day (0-23) when habits reset
 * @returns {string} Start date string in YYYY-MM-DD format
 */
export const getStartDate = (days, resetTimeHour = 0) => {
    const now = new Date();
    const currentHour = now.getUTCHours();

    // Calculate how many days to subtract
    let daysToSubtract = days;

    // If we're before the reset time, we need to go back one extra day
    if (currentHour < resetTimeHour) {
        daysToSubtract += 1;
    }

    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - daysToSubtract);
    return startDate.toISOString().split('T')[0];
};