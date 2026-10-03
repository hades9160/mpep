// ============================================================================
// ACTIVITY LOG — a single function every page calls after a meaningful
// write (create/update/delete/import/restore) so the Activity Log tab has a
// record of every system change. Failures here are logged to the console
// but never block or error out the action that triggered them — losing a
// log entry should never stop HR from actually saving their work.
// ============================================================================
import { supabase } from './supabaseClient.js';
import { store } from './store.js';

export async function logActivity(action, entity, summary, details = null) {
  try {
    const { error } = await supabase.from('activity_log').insert({
      actor_email: store.currentUser?.email || 'unknown',
      action, entity, summary, details,
    });
    if (error) console.error('Activity log write failed:', error.message);
  } catch (err) {
    console.error('Activity log write failed:', err);
  }
}
