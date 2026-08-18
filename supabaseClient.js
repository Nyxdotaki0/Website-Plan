import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const supabaseUrl = "https://baaygzddafopihtxyyjq.supabase.co";
const supabaseAnonKey = 'sb_publishable_O0JPmpCSe7TDoUxotIe4aQ_4EBgEBV8';

// Pin the browser SDK so every device runs the same auth/realtime code.
// Supabase JS 2.107+ removed the navigator.locks auth mutex that could
// deadlock on suspended/mobile browser contexts.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});
