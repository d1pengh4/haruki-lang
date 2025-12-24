#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const name = process.argv[2] || '운전면허';

const result = await supabase.from('sign_languages').delete().eq('name', name);
console.log(`✅ 삭제 완료: ${name}`, result);
