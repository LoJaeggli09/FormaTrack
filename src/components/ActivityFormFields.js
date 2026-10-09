import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** Campi che restano nascosti finché non servono: orari, numero di apprendisti, sede e ticket. */
const DETAIL_KEYS = ['startTime', 'trainerTime', 'apprenticeCount', 'site', 'ticket'];

/**
 * Campi per registrare un'attività o una prenotazione, in due livelli:
 * prima l'essenziale (cosa, tipo, data, durata), poi i dettagli facoltativi dietro a un pulsante.
 * I dettagli si aprono da soli quando contengono già dei valori (modello applicato, attività duplicata).
 *
 * @param {object} props
 * @param {string} props.idPrefix        - Prefisso degli id, per collegare etichette e campi
 * @param {object} props.value           - Valori del modulo (stesse chiavi di una riga attività)
 * @param {(next: object) => void} props.onChange
 * @param {{ date: string, type: string, duration: string, startTime: string, description: string }} props.labels
 * @param {(key: string) => string} props.t
 * @param {string} [props.dateMin]       - Data minima ammessa (prenotazioni)
 * @param {() => void} [props.onSubmit]  - Invio dalla tastiera sul campo descrizione
 * @param {boolean} [props.multiline]    - Descrizione su più righe
 * @param {string} [props.error]         - Messaggio di errore da mostrare sotto ai campi
 * @param {string[]} [props.required]    - Campi obbligatori (contrassegnati con un asterisco)
 */
const ActivityFormFields = ({
  idPrefix,
  value,
  onChange,
  labels,
  t,
  dateMin,
  onSubmit,
  multiline = false,
  error = '',
  required = ['description', 'date'],
}) => {
  const [open, setOpen] = useState(false);
  const hasDetails = DETAIL_KEYS.some((key) => String(value[key] ?? '') !== '');
  const showDetails = open || hasDetails;

  const id = (name) => `${idPrefix}-${name}`;
  const labelClass = (key) => (required.includes(key) ? 'field-label is-required' : 'field-label');
  const bind = (key) => ({
    id: id(key),
    value: value[key],
    onChange: (event) => onChange({ ...value, [key]: event.target.value }),
  });

  return (
    <div className="entry-form">
      <div className="entry-grid">
        <div className="entry-field entry-field--wide">
          <label className={labelClass('description')} htmlFor={id('description')}>{labels.description}</label>
          {multiline ? (
            <textarea
              {...bind('description')}
              rows={2}
              placeholder={t('activities.descriptionPlaceholder')}
            />
          ) : (
            <input
              {...bind('description')}
              type="text"
              placeholder={t('activities.descriptionPlaceholder')}
              onKeyDown={(event) => { if (event.key === 'Enter' && onSubmit) onSubmit(); }}
            />
          )}
        </div>

        <div className="entry-field entry-field--type">
          <label className={labelClass('activityType')} htmlFor={id('activityType')}>{labels.type}</label>
          <input
            {...bind('activityType')}
            type="text"
            list="activity-type-suggestions"
            placeholder={t('activities.typePlaceholder')}
          />
        </div>
        <div className="entry-field entry-field--date">
          <label className={labelClass('date')} htmlFor={id('date')}>{labels.date}</label>
          <input {...bind('date')} type="date" min={dateMin} />
        </div>
        <div className="entry-field entry-field--duration">
          <label className="field-label" htmlFor={id('durationMinutes')}>{labels.duration}</label>
          <input {...bind('durationMinutes')} type="number" min="0" step="5" />
        </div>
      </div>

      {error && <div className="form-error-text">{error}</div>}

      {!hasDetails && (
        <div className="entry-more">
          <button
            type="button"
            className="entry-toggle"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {open ? t('activities.lessDetails') : t('activities.moreDetails')}
          </button>
          {!open && <span className="entry-hint">{t('activities.detailsHint')}</span>}
        </div>
      )}

      {showDetails && (
        <div className="entry-details">
          <div className="entry-grid entry-grid--details">
            <div className="entry-field">
              <label className="field-label" htmlFor={id('startTime')}>{labels.startTime}</label>
              <input {...bind('startTime')} type="time" />
            </div>
            <div className="entry-field">
              <label className="field-label" htmlFor={id('trainerTime')}>{t('activities.trainerTime')}</label>
              <input {...bind('trainerTime')} type="time" />
            </div>
            <div className="entry-field">
              <label className="field-label" htmlFor={id('apprenticeCount')}>{t('activities.apprenticeCount')}</label>
              <input {...bind('apprenticeCount')} type="number" min="1" step="1" />
            </div>
            <div className="entry-field">
              <label className="field-label" htmlFor={id('site')}>{t('activities.site')}</label>
              <input {...bind('site')} type="text" />
            </div>
            <div className="entry-field">
              <label className="field-label" htmlFor={id('ticket')}>{t('activities.ticket')}</label>
              <input {...bind('ticket')} type="text" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityFormFields;
