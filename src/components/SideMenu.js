import React, { useRef } from 'react';
import { LayoutDashboard, CalendarDays, StickyNote, ClipboardList, CalendarClock, CalendarX, Award, BarChart3, Settings, LogOut, Users, LifeBuoy } from 'lucide-react';
import { translate } from '../i18n';
import { useKeyboardNavigation, useFocusTrap, useAnnounce } from '../hooks/accessibility';
import { FORMATRACK_URL, FORMATRACK_LABEL, handleExternalClick } from '../utils/externalLink';

/**
 * @param {object} props
 * @param {Object<string, number>} [props.badges] - voci con promemoria aperti: { activities: 2 }
 */
const SideMenu = ({
  isOpen,
  onClose = () => {},
  onLogout,
  onNavigate,
  currentView,
  language = 'it',
  isAdmin = false,
  canSelectStudents = false,
  badges = {},
}) => {
  const t = (key) => translate(key, language);
  const menuRef = useRef(null);
  const announce = useAnnounce();

  const menuItems = [
    { icon: <LayoutDashboard size={20} />, label: t('menu.dashboard'), id: 'dashboard' },
    { icon: <CalendarDays size={20} />, label: t('calendar.title'), id: 'calendar' },
    { icon: <StickyNote size={20} />, label: t('notes.title'), id: 'notes' },
    { icon: <ClipboardList size={20} />, label: t('activities.title'), id: 'activities' },
    { icon: <CalendarClock size={20} />, label: t('booking.title'), id: 'booking' },
    { icon: <CalendarX size={20} />, label: t('absences.title'), id: 'absences' },
    { icon: <Award size={20} />, label: t('grading.title'), id: 'grading' },
    ...(canSelectStudents ? [{ icon: <BarChart3 size={20} />, label: t('data.title'), id: 'data' }] : []),
    ...(isAdmin ? [{ icon: <Users size={20} />, label: t('manage.title'), id: 'manage' }] : []),
    { icon: <Settings size={20} />, label: t('menu.settings'), id: 'settings' },
  ];

  // Hook per la navigazione da tastiera
  useKeyboardNavigation(true, onClose, onNavigate, menuItems);

  // Hook per il focus trap
  useFocusTrap(menuRef, true);

  const handleMenuClick = (itemId, itemLabel) => {
    onNavigate(itemId);
    announce(`${t('menu.navigatedTo')} ${itemLabel}`, 'polite');
  };

  return (
    <div
      ref={menuRef}
      className="side-menu"
      role="navigation"
      aria-label={t('menu.navigation')}
    >
        <nav className="menu-nav" role="menu">
          {menuItems.map((item, index) => (
            <button
              key={`${item.id}-${index}`}
              className={`menu-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => handleMenuClick(item.id, item.label)}
              role="menuitem"
              aria-current={currentView === item.id ? 'page' : undefined}
              tabIndex={0}
            >
              {item.icon}
              <span>{item.label}</span>
              {badges[item.id] > 0 && (
                <span
                  className="menu-badge"
                  aria-label={`${badges[item.id]} ${t('reminders.pendingHere')}`}
                  title={t('reminders.pendingHere')}
                >
                  {badges[item.id] > 99 ? '99+' : badges[item.id]}
                </span>
              )}
            </button>
          ))}
        </nav>

        <a
          className="menu-support-link"
          href={FORMATRACK_URL}
          onClick={handleExternalClick(FORMATRACK_URL)}
          target="_blank"
          rel="noreferrer"
          title={FORMATRACK_LABEL}
          tabIndex={isOpen ? 0 : -1}
        >
          <LifeBuoy size={18} />
          <span>{t('menu.support')}</span>
        </a>

        <button
          className="logout-button"
          onClick={onLogout}
          aria-label={t('menu.logout')}
          tabIndex={isOpen ? 0 : -1}
        >
          <LogOut size={20} />
          <span>{t('menu.logout')}</span>
        </button>
      </div>
  );
};

export default SideMenu;
