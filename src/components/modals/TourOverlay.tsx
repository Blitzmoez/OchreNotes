import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Compass, Check } from 'lucide-react';
import { EnabledModules, SuiteModuleId } from '../../types';

interface TourOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeModule: SuiteModuleId;
  enabledModules: EnabledModules;
  onSwitchModule: (mod: SuiteModuleId) => void;
  accentColor?: string;
}

interface TourStep {
  id: string;
  title: string;
  description: string;
  selector: string;
  module?: SuiteModuleId;
  badge?: string;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const TourOverlay: React.FC<TourOverlayProps> = ({
  isOpen,
  onClose,
  activeModule,
  enabledModules,
  onSwitchModule,
  accentColor = '#C87D20',
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const steps = useMemo<TourStep[]>(() => {
    const all: TourStep[] = [
      {
        id: 'module-switcher',
        badge: 'Navigation',
        title: 'Modulauswahl der Ochre Suite',
        description:
          'Über dieses Menü wechselst du blitzschnell zwischen Dashboard, Notes, Wiki, Essensplan, Finanzen, Projekten und Smarthome. Die Reihenfolge kannst du in den Einstellungen anpassen.',
        selector: '[data-tour="module-switcher"]',
      },
      {
        id: 'user-menu',
        badge: 'Profil & System',
        title: 'Profil-, Aktions- & Hilfe-Menü',
        description:
          'Hier wechselst du dein Benutzerkonto oder Notiz-Profil, druckst A4-Ansichten, teilst Inhalte, öffnest Einstellungen oder startest jederzeit diese geführte Tour.',
        selector: '[data-tour="user-menu"]',
      },
      {
        id: 'main-workspace',
        badge: 'Arbeitsbereich',
        title: 'Dein zentraler Arbeitsbereich',
        description:
          'Alle Module passen sich automatisch an Desktop, Tablet und Smartphone an – inkl. Wischgesten für mobile Vault- und Katalog-Leisten.',
        selector: '[data-tour="main-workspace"]',
      },
    ];

    if (enabledModules.dashboard) {
      all.push({
        id: 'mod-dashboard',
        badge: 'Modul · Dashboard',
        module: 'dashboard',
        title: 'Dashboard & Modul-Kacheln',
        description:
          'Alle wichtigen Statistiken, fällige Aufgaben, Einkaufs-Forecast und Live-Smarthome-Werte auf einen Blick – durchsuchbar über die globale Suche.',
        selector: '[data-tour="main-workspace"]',
      });
    }
    if (enabledModules.notes) {
      all.push({
        id: 'mod-notes',
        badge: 'Modul · Notes',
        module: 'notes',
        title: 'Notes, Aufgaben & Wissensgraph',
        description:
          'Schreibe Markdown mit Live-Formatierung, WikiLinks, Aufgaben mit Fälligkeit sowie einem interaktiven Graphen. Neue Notizen legst du über das mobile Navigationsmenü oder die Tab-Leiste an.',
        selector: '[data-tour="main-workspace"]',
      });
    }
    if (enabledModules.wiki) {
      all.push({
        id: 'mod-wiki',
        badge: 'Modul · Wiki',
        module: 'wiki',
        title: 'Wiki & Wissensdatenbank',
        description:
          'Strukturierte Anleitungen, Code-Blöcke und eingebettete Bilder im offenen Markdown-Standard, direkt verknüpfbar mit deinen Notizen und Projekten.',
        selector: '[data-tour="main-workspace"]',
      });
    }
    if (enabledModules.recipes) {
      all.push({
        id: 'mod-recipes',
        badge: 'Modul · Essensplan',
        module: 'recipes',
        title: 'Essensplan, Katalog & Einkaufsliste',
        description:
          'Plane Wochenkalender und Rotationszyklen mit skalierbaren Portionen, verwalte eigene oder geteilte Bibliotheken und generiere automatisch deine Einkaufsliste.',
        selector: '[data-tour="main-workspace"]',
      });
    }
    if (enabledModules.finance) {
      all.push({
        id: 'mod-finance',
        badge: 'Modul · Finanzen',
        module: 'finance',
        title: 'Finanzen, Kreditoren & Barzahlungen',
        description:
          'Importiere Bank-CSVs, erfasse Barbelege und verfolge detaillierte Auswertungen sowie Statistiken pro Kreditor.',
        selector: '[data-tour="main-workspace"]',
      });
    }
    if (enabledModules.projects) {
      all.push({
        id: 'mod-projects',
        badge: 'Modul · Projekte',
        module: 'projects',
        title: 'Projekte (Kanban, Liste & Timeline)',
        description:
          'Organisiere Aufgaben auf flexiblen Kanban-Boards, in der kompakten Listenansicht oder auf der Gantt-Timeline – mit Profilfilter, Mehrfach-Zuweisungen und A4-Druck.',
        selector: '[data-tour="main-workspace"]',
      });
    }
    if (enabledModules.smarthome) {
      all.push({
        id: 'mod-smarthome',
        badge: 'Modul · Smarthome',
        module: 'smarthome',
        title: 'Smarthome, MQTT & InfluxDB',
        description:
          'Verbinde Live-MQTT-Topics sowie InfluxDB v1/v2 oder Prometheus, zeige 24h-Kurvenverläufe an und berechne Stromverbrauch & Kosten direkt in eigenen Kacheln.',
        selector: '[data-tour="main-workspace"]',
      });
    }

    return all;
  }, [enabledModules]);

  const currentStep = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))] || null;

  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !currentStep?.module) return;
    if (activeModule !== currentStep.module) {
      onSwitchModule(currentStep.module);
    }
  }, [isOpen, currentStep?.id, currentStep?.module, activeModule, onSwitchModule]);

  const measureTarget = useCallback(() => {
    if (!isOpen || !currentStep) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(currentStep.selector) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setTargetRect(null);
      return;
    }
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (!isOpen) return;
    measureTarget();
    const timer = window.setTimeout(measureTarget, 120);
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [isOpen, stepIndex, activeModule, measureTarget]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        setStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowLeft') {
        setStepIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, steps.length, onClose]);

  if (!isOpen || !currentStep) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex >= steps.length - 1;
  const isLargeWorkspace =
    targetRect &&
    targetRect.width > window.innerWidth * 0.75 &&
    targetRect.height > window.innerHeight * 0.55;

  const pad = 6;
  const spotTop = targetRect ? Math.max(4, targetRect.top - pad) : 0;
  const spotLeft = targetRect ? Math.max(4, targetRect.left - pad) : 0;
  const spotWidth = targetRect ? Math.min(window.innerWidth - 8, targetRect.width + pad * 2) : 0;
  const spotHeight = targetRect ? Math.min(window.innerHeight - 8, targetRect.height + pad * 2) : 0;

  // Tooltip card positioning
  let cardStyle: React.CSSProperties = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  };

  if (targetRect && !isLargeWorkspace) {
    const spaceBelow = window.innerHeight - (spotTop + spotHeight);
    const spaceAbove = spotTop;
    const cardWidth = Math.min(360, window.innerWidth - 24);
    const clampedLeft = Math.max(
      12,
      Math.min(window.innerWidth - cardWidth - 12, spotLeft + spotWidth / 2 - cardWidth / 2)
    );

    if (spaceBelow >= 210) {
      cardStyle = {
        top: Math.min(window.innerHeight - 230, spotTop + spotHeight + 14),
        left: clampedLeft,
        width: cardWidth,
      };
    } else if (spaceAbove >= 210) {
      cardStyle = {
        bottom: window.innerHeight - spotTop + 14,
        left: clampedLeft,
        width: cardWidth,
      };
    } else {
      cardStyle = {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: cardWidth,
      };
    }
  } else {
    cardStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: Math.min(400, window.innerWidth - 24),
    };
  }

  return (
    <div
      data-no-swipe
      className="fixed inset-0 z-[150] select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Geführte Tour"
    >
      {/* Dimmed backdrop or spotlight cutout */}
      {targetRect ? (
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 bg-transparent"
          />
          <div
            style={{
              top: spotTop,
              left: spotLeft,
              width: spotWidth,
              height: spotHeight,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58)',
              borderColor: accentColor,
            }}
            className="fixed rounded-2xl border-2 pointer-events-none transition-all duration-200 ease-out"
          />
        </>
      ) : (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-[1px]"
        />
      )}

      {/* Positioned Tooltip Card */}
      <div
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[155] rounded-2xl bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
              className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
            >
              <Compass className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              {currentStep.badge && (
                <span
                  style={{ color: accentColor }}
                  className="text-[10px] font-bold uppercase tracking-wider block"
                >
                  {currentStep.badge}
                </span>
              )}
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                {currentStep.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer shrink-0"
            aria-label="Tour schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          {currentStep.description}
        </p>

        {/* Progress bar dots */}
        <div className="flex items-center gap-1 pt-0.5">
          {steps.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStepIndex(idx)}
              style={idx === stepIndex ? { backgroundColor: accentColor } : undefined}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === stepIndex
                  ? 'w-5'
                  : idx < stepIndex
                  ? 'w-2 bg-neutral-400 dark:bg-neutral-500'
                  : 'w-2 bg-neutral-200 dark:bg-neutral-700'
              }`}
              aria-label={`Schritt ${idx + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-neutral-400 tabular-nums">
              Schritt {stepIndex + 1} / {steps.length}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline-offset-2 hover:underline cursor-pointer"
            >
              Überspringen
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Zurück</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
                }
              }}
              style={{ backgroundColor: accentColor }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white shadow-xs hover:opacity-95 cursor-pointer active:scale-95"
            >
              {isLast ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Fertig</span>
                </>
              ) : (
                <>
                  <span>Weiter</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
