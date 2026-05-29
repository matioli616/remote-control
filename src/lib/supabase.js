import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fzkmfyorotonliogahyr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6a21meW9yb3Rvbmxpb2dhaHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTYwMDUsImV4cCI6MjA5NTI5MjAwNX0.J6PHIY77jQr1kfsChsVvH_aSvFlOcyYot8xWnlCglqA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
