import { getServiceClient } from './db.js';

async function test() {
    try {
        const db = getServiceClient();
        console.log('Successfully initialized Supabase service client.');
        
        const { data: tables, error } = await db
            .from('spotify_tokens')
            .select('*')
            .limit(1);
            
        if (error) {
            console.error('Error querying spotify_tokens:', error);
        } else {
            console.log('Successfully queried spotify_tokens. Current row count limit 1:', tables);
        }

        const { data: credentials, error: credError } = await db
            .from('spotify_credentials')
            .select('*')
            .limit(1);

        if (credError) {
            console.error('Error querying spotify_credentials:', credError);
        } else {
            console.log('Successfully queried spotify_credentials. Current row count limit 1:', credentials);
        }
    } catch (e) {
        console.error('Exception occurred:', e);
    }
}

test();
