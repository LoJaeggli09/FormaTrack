import { supabase } from '../supabaseClient';

/**
 * Tipi di evento tracciati nella tabella audit_log.
 * Usare sempre queste costanti per evitare typo.
 */
export const AUDIT_EVENTS = {
  LOGIN_SUCCESS:      'login_success',
  LOGIN_FAILED:       'login_failed',
  LOGOUT:             'logout',
  USER_CREATED:       'user_created',
  USER_DELETED:       'user_deleted',
  PASSWORD_RESET:     'password_reset',
  PASSWORD_CHANGED:   'password_changed',
  BULK_ASSIGN:        'bulk_assign',
  WORKSPACE_ARCHIVED: 'workspace_archived',
  WORKSPACE_RESTORED: 'workspace_restored',
  WORKSPACE_DELETED:  'workspace_deleted',
};

/**
 * Inserisce una riga nella tabella audit_log.
 *
 * Schema atteso su Supabase:
 *   CREATE TABLE audit_log (
 *     id            bigserial PRIMARY KEY,
 *     event         text      NOT NULL,
 *     actor_id      integer,
 *     actor_name    text,
 *     target_id     integer,
 *     target_name   text,
 *     details       jsonb,
 *     created_at    timestamptz NOT NULL DEFAULT now()
 *   );
 *
 * @param {object} params
 * @param {string} params.event       - Tipo evento (usa AUDIT_EVENTS)
 * @param {number|null} params.actorId   - ID utente che ha eseguito l'azione
 * @param {string|null} params.actorName - Nome utente che ha eseguito l'azione
 * @param {number|null} params.targetId  - ID utente su cui è stata eseguita l'azione
 * @param {string|null} params.targetName - Nome utente target
 * @param {object|null} params.details   - Dati aggiuntivi (JSON)
 */
export const writeAuditLog = async ({
  event,
  actorId = null,
  actorName = null,
  targetId = null,
  targetName = null,
  details = null,
}) => {
  try {
    const { error } = await supabase.from('audit_log').insert([{
      event,
      actor_id: actorId ? parseInt(actorId, 10) : null,
      actor_name: actorName || null,
      target_id: targetId ? parseInt(targetId, 10) : null,
      target_name: targetName || null,
      details: details || null,
    }]);
    if (error) {
      console.warn('[AuditLog] Scrittura fallita:', error.message);
    }
  } catch (err) {
    // Non bloccare mai l'operazione principale per un errore di audit
    console.warn('[AuditLog] Errore inatteso:', err.message);
  }
};

/**
 * Legge le ultime N righe di audit_log, ordinate per data decrescente.
 * @param {number} limit - Numero di righe da leggere (default 200)
 * @returns {Promise<Array>}
 */
export const getAuditLog = async (limit = 200) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[AuditLog] Lettura fallita:', error.message);
    return [];
  }
  return data || [];
};
