import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTokens() {
    console.log('🔍 Checking spotify_tokens table content...');
    const { data: tokens, error } = await supabase
        .from('spotify_tokens')
        .select('*');

    if (error) {
        console.error('❌ Error fetching tokens:', error.message);
    } else {
        console.log(`✅ Found ${tokens.length} token records:`);
        tokens.forEach(t => {
            console.log(`- UserID: ${t.user_id}, HasAccessToken: ${!!t.access_token}, HasRefreshToken: ${!!t.refresh_token}, ExpiresAt: ${t.expires_at}`);
        });
    }
}

checkTokens();
