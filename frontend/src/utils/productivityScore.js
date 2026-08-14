import { getUserData } from './apiClient.js';

const DEFAULT_GRACE_BUFFER_HOURS = 3;

export const parseTaskDateTime = (rawDate) => {
    if (!rawDate || typeof rawDate !== 'string') return null;

    const [datePart, timePart = '00:00'] = rawDate.trim().split(/\s+/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !/^\d{1,2}:\d{2}$/.test(timePart)) {
        return null;
    }

    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        !Number.isInteger(hours) ||
        !Number.isInteger(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

export const getLogicalDateForDateTime = (dateTime, resetOffsetHours = getStoredResetOffsetHours()) => {
    if (!(dateTime instanceof Date) || Number.isNaN(dateTime.getTime())) return null;
    const shifted = new Date(dateTime.getTime() - (resetOffsetHours * 60 * 60 * 1000));
    return formatLocalDate(shifted);
};

export const getTaskLogicalDate = (task, resetOffsetHours = getStoredResetOffsetHours()) => {
    const dueAt = parseTaskDateTime(task?.date);
    return dueAt ? getLogicalDateForDateTime(dueAt, resetOffsetHours) : null;
};

const getTaskCompletionRatio = (task) => {
    const allocated = Number(task?.tasksAllocated || 0);
    const completed = Number(task?.tasksCompleted || 0);

    if (allocated <= 0) {
        return completed > 0 ? 1 : 0;
    }

    return Math.max(0, Math.min(1, completed / allocated));
};

export const calculateProductivityScore = (tasks = [], habits = [], options = {}) => {
    const resetOffsetHours = options.resetOffsetHours ?? getStoredResetOffsetHours();
    const targetDate = options.targetDate ?? getTodayDateString(resetOffsetHours);
    const now = options.now ?? new Date();
    const graceBufferHours = options.graceBufferHours ?? getStoredPenaltyBufferHours();
    const relevantTasks = options.filterToTargetDate === false
        ? tasks
        : filterTasksForDate(tasks, targetDate, resetOffsetHours);

    const totals = relevantTasks.reduce(
        (acc, task) => {
            acc.tasksAllocated += task.tasksAllocated || 0;
            acc.tasksCompleted += task.tasksCompleted || 0;
            acc.hoursAllocated += task.hoursAllocated || 0;
            acc.hoursTaken += task.hoursTaken || 0;
            return acc;
        },
        { tasksAllocated: 0, tasksCompleted: 0, hoursAllocated: 0, hoursTaken: 0 }
    );

    const habitsAllocated = habits.length;
    const habitsCompleted = habits.filter(habit => habit.completedToday).length;
    const habitsUncompleted = habitsAllocated - habitsCompleted;

    let score = 0;

    if (totals.tasksAllocated > 0 || habitsAllocated > 0) {
        const taskRatio = totals.tasksAllocated > 0 ? totals.tasksCompleted / totals.tasksAllocated : 0;
        const habitDoneRatio = habitsAllocated > 0 ? habitsCompleted / habitsAllocated : 0;
        const habitMissedRatio = habitsAllocated > 0 ? habitsUncompleted / habitsAllocated : 0;

        let baseProductivity = 0;

        if (totals.tasksAllocated > 0) {
            // Task-based scoring: 0-100 base 🎯
            // Habits act as a small bonus (+10%) or penalty (-10%)
            const habitAdjustment = (habitDoneRatio * 0.1) - (habitMissedRatio * 0.1);
            baseProductivity = taskRatio + habitAdjustment;
        } else {
            // Pure Habits: Capped at 25% since no specific tasks were planned 🧘
            // We reward habit completion but it shouldn't "shoot up" to 100 on its own.
            baseProductivity = (habitDoneRatio * 0.25);
        }

        let performanceAdjustment = 1.0;
        if (totals.hoursTaken > 0 && totals.hoursAllocated > 0) {
            // Compare overall time taken vs allocated
            performanceAdjustment = totals.hoursAllocated / totals.hoursTaken;
            performanceAdjustment = Math.min(1.5, Math.max(0.5, performanceAdjustment));
        }

        let bonusAdjustment = 0;
        let overduePenalty = 0;

        for (const task of tasks) {
            const dueAt = parseTaskDateTime(task?.date);
            if (!dueAt) continue;

            const completionRatio = getTaskCompletionRatio(task);
            const isComplete = completionRatio >= 1;
            const logicalDueDate = getLogicalDateForDateTime(dueAt, resetOffsetHours);
            const graceDeadline = graceBufferHours < 0
                ? null
                : new Date(dueAt.getTime() + (graceBufferHours * 60 * 60 * 1000));

            if (isComplete && dueAt > now && logicalDueDate >= targetDate) {
                bonusAdjustment += logicalDueDate > targetDate ? 0.08 : 0.04;
            }

            if (!isComplete && graceDeadline && graceDeadline < now && logicalDueDate <= targetDate) {
                overduePenalty += (1 - completionRatio) * 0.08;
            }
        }

        bonusAdjustment = Math.min(0.2, bonusAdjustment);
        overduePenalty = Math.min(0.35, overduePenalty);

        // Apply performance adjustment, then add early-finish bonus and overdue penalty.
        score = Math.max(0, Math.min(1.2, (baseProductivity * performanceAdjustment) + bonusAdjustment - overduePenalty));

        return {
            score,
            displayScore: Number((score * 100).toFixed(1)),
            totals,
            habitsAllocated,
            habitsCompleted,
            bonusAdjustment,
            overduePenalty,
            targetDate
        };
    }

    return {
        score,
        displayScore: Number((score * 100).toFixed(1)),
        totals,
        habitsAllocated,
        habitsCompleted,
        bonusAdjustment: 0,
        overduePenalty: 0,
        targetDate
    };
};

export const formatLocalDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getStoredResetOffsetHours = () => {
    const user = getUserData();
    return Number(user?.reset_offset_hours || 0);
};

export const getStoredPenaltyBufferHours = () => {
    const user = getUserData();
    const value = Number(user?.penalty_buffer_hours);
    return Number.isNaN(value) ? DEFAULT_GRACE_BUFFER_HOURS : value;
};

export const getTodayDateString = (resetOffsetHours = getStoredResetOffsetHours()) => {
    const shifted = new Date(Date.now() - (resetOffsetHours * 60 * 60 * 1000));
    return formatLocalDate(shifted);
};

export const extractTaskDate = (rawDate) => {
    if (!rawDate || typeof rawDate !== 'string') return null;
    const match = rawDate.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
};

const taskHasTimeComponent = (rawDate) => {
    if (!rawDate || typeof rawDate !== 'string') return false;
    return /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(rawDate.trim());
};

export const filterTasksForDate = (tasks = [], targetDate = getTodayDateString(), resetOffsetHours = getStoredResetOffsetHours()) => (
    tasks.filter(task => {
        const rawDate = task?.date;
        if (!rawDate || typeof rawDate !== 'string') return true; // undated tasks always included

        if (taskHasTimeComponent(rawDate)) {
            // Tasks with a specific time (e.g., "2026-08-15 01:30") use offset-shifted
            // logical date. A task at 1:30 AM with a 3 AM reset belongs to the previous
            // logical day, matching how targetDate is computed.
            const logicalDate = getTaskLogicalDate(task, resetOffsetHours);
            return logicalDate === targetDate;
        }

        // Bare-date tasks (e.g., "2026-08-15") are all-day assignments for that calendar
        // date. No offset shift — a task dated Aug 15 belongs to Aug 15 regardless of
        // the reset offset.
        const taskDate = extractTaskDate(rawDate);
        return taskDate === targetDate;
    })
);
