import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: users, error } = await supabase
        .from('users')
        .select('id, username, email, created_at');

    if (error) {
        console.error('❌ Error fetching users:', error.message);
    } else {
        console.log('CLOUD USERS:', JSON.stringify(users, null, 2));
    }
    process.exit(0);
}
check();
