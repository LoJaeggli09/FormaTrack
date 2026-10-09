/**
 * Modelli di attività ricorrenti.
 *
 * Sono preferenze personali di chi compila il registro, non dati condivisi:
 * stanno in localStorage per utente, come le altre impostazioni dell'app.
 */

import { logWarn } from './logger';

const STORAGE_KEY = 'formatrack.activityTemplates';
const MAX_TEMPLATES = 8;

/** Campi che un modello può precompilare (la data resta sempre da scegliere). */
export const TEMPLATE_FIELDS = [
  'activityType', 'description', 'startTime', 'trainerTime',
  'apprenticeCount', 'durationMinutes', 'site', 'ticket',
];

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (error) {
    logWarn('ActivityTemplates', 'Modelli illeggibili, riparto da zero', error);
    return {};
  }
};

const writeAll = (all) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (error) {
    logWarn('ActivityTemplates', 'Impossibile salvare i modelli', error);
  }
};

/** Modelli dell'utente indicato. */
export const getTemplates = (userId) => {
  if (!userId) return [];
  const all = readAll();
  return Array.isArray(all[userId]) ? all[userId] : [];
};

/**
 * Salva un modello a partire dai valori di un form attività.
 * Un nome già usato viene sovrascritto, così "aggiorna il modello" non richiede
 * un flusso a parte.
 */
export const saveTemplate = (userId, name, formValues) => {
  if (!userId || !name?.trim()) return getTemplates(userId);

  const template = { name: name.trim() };
  TEMPLATE_FIELDS.forEach((field) => {
    const value = formValues?.[field];
    if (value !== undefined && value !== null && value !== '') template[field] = value;
  });

  const all = readAll();
  const existing = (Array.isArray(all[userId]) ? all[userId] : [])
    .filter((item) => item.name.toLowerCase() !== template.name.toLowerCase());
  const next = [template, ...existing].slice(0, MAX_TEMPLATES);
  all[userId] = next;
  writeAll(all);
  return next;
};

export const deleteTemplate = (userId, name) => {
  const all = readAll();
  const next = (Array.isArray(all[userId]) ? all[userId] : [])
    .filter((item) => item.name !== name);
  all[userId] = next;
  writeAll(all);
  return next;
};

/** Applica un modello a un form, lasciando intatti i campi che il modello non copre. */
export const applyTemplate = (form, template) => {
  if (!template) return form;
  const next = { ...form };
  TEMPLATE_FIELDS.forEach((field) => {
    if (template[field] !== undefined) next[field] = template[field];
  });
  return next;
};
