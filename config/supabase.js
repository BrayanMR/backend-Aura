const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let supabaseClient;

function initializeSupabase() {
  if (supabaseClient) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log('✅ Supabase: cliente inicializado correctamente');
}

function getSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase no está inicializado. Llama initializeSupabase() primero.');
  }
  return supabaseClient;
}

function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
}

module.exports = {
  initializeSupabase,
  getSupabase,
  getStorageBucket,
};