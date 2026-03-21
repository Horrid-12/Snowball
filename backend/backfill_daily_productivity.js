import 'dotenv/config';
import { supabase } from './db.js';
import { backfillDailyProductivity } from './utils/productivityScore.js';

const run = async () => {
    const { data: users, error } = await supabase
        .from('users')
        .select('id');

    if (error) {
        throw error;
    }

    let completed = 0;

    for (const user of users || []) {
        const result = await backfillDailyProductivity(user.id);
        completed += 1;
        console.log(`Backfilled user ${user.id}: ${result.historicalRows} historical rows, refreshed ${result.today}`);
    }

    console.log(`Finished backfilling ${completed} users.`);
};

run().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
