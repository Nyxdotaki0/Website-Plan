import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://baaygzddafopihtxyyjq.supabase.co';
const supabaseAnonKey = 'sb_publishable_O0JPmpCSe7TDoUxotIe4aQ_4EBgEBV8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);