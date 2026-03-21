export const calculateProductivityScore = (tasks = [], habits = []) => {
    const totals = tasks.reduce(
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

    let score = 0;

    if (totals.tasksAllocated !== 0 || habitsAllocated !== 0) {
        const taskRatio = totals.tasksAllocated > 0 ? totals.tasksCompleted / totals.tasksAllocated : 0;
        const habitRatio = habitsAllocated > 0 ? habitsCompleted / habitsAllocated : 0;

        let baseProductivity = 0;

        if (totals.tasksAllocated > 0 && habitsAllocated > 0) {
            baseProductivity = (taskRatio * 0.6) + (habitRatio * 0.4);
        } else if (totals.tasksAllocated > 0) {
            baseProductivity = taskRatio;
        } else if (habitsAllocated > 0) {
            baseProductivity = habitRatio;
        }

        let performanceAdjustment = 1.0;
        if (totals.hoursTaken > 0 && totals.hoursAllocated > 0) {
            performanceAdjustment = totals.hoursAllocated / totals.hoursTaken;
            performanceAdjustment = Math.min(1.5, Math.max(0.5, performanceAdjustment));
        }

        score = baseProductivity * performanceAdjustment;
    }

    return {
        score,
        displayScore: Number((score * 100).toFixed(1)),
        totals,
        habitsAllocated,
        habitsCompleted
    };
};

export const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
