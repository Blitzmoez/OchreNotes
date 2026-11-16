import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  ShoppingCart,
  Utensils,
  BarChart3,
  BookOpen,
  BookMarked,
  Server,
  SlidersHorizontal,
  RefreshCw,
  ArrowUpRight,
  Check,
  Clock,
  Users,
  Sparkles,
  Calendar as CalendarIcon,
  Inbox,
  Folder,
  Zap,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Banknote,
  Layers,
} from 'lucide-react';
import {
  User,
  NoteProfileId,
  ModuleColors,
  EnabledModules,
  DashboardSettings,
  DashboardWidgetId,
  SuiteModuleId,
  PaneType,
  CookbookTab,
  NoteMetadata,
  TaskItem,
  WikiArticle,
  Recipe,
  MealCycle,
  MealCalendarOverride,
  IngredientMeta,
  FinanceTransaction,
  SystemHealth,
} from '../../types';
import { api } from '../../services/api';
import { generateWeeklyShoppingList } from '../../services/shoppingListService';
import { collectIngredientsFromRecipes, findIngredientDuplicates } from '../../services/ingredientCatalogService';
import { DASHBOARD_WIDGET_CATALOG } from '../../services/profileDefaults';

interface DashboardViewProps {
  currentUser: User;
  activeProfileId: NoteProfileId;
  activeProfileName: string;
  accentColors: ModuleColors;
  enabledModules: EnabledModules;
  enableCookbookShoppingList: boolean;
  dashboardSettings: DashboardSettings;
  onNavigateToModule: (
    mod: SuiteModuleId,
    options?: { notesView?: PaneType; cookbookTab?: CookbookTab; notePath?: string }
  ) => void;
  onOpenDashboardSettings: () => void;
  onTasksMutated?: () => void;
}

const FALLBACK_FINANCE_TX: FinanceTransaction[] = [
  { id: 'tx_1', date: '2026-11-08', creditor: 'REWE Markt', categoryId: 'cat_groceries', amount: -48.6, description: 'Wocheneinkauf Frischetheke', type: 'card' },
  { id: 'tx_2', date: '2026-11-07', creditor: 'Aral Tankstelle', categoryId: 'cat_mobility', amount: -65.2, description: 'Super E10 getankt', type: 'card' },
  { id: 'tx_3', date: '2026-11-06', creditor: 'Bäckerei Schmidt', categoryId: 'cat_leisure', amount: -7.5, description: 'Kaffee & Croissant', type: 'cash', isCash: true },
  { id: 'tx_4', date: '2026-11-05', creditor: 'Stadtwerke Strom', categoryId: 'cat_housing', amount: -82.0, description: 'Monatsabschlag Strom', type: 'direct_debit' },
  { id: 'tx_5', date: '2026-11-04', creditor: 'Gehaltseingang', categoryId: 'cat_housing', amount: 2850.0, description: 'Gehalt November', type: 'transfer' },
  { id: 'tx_6', date: '2026-11-03', creditor: 'DM Drogerie', categoryId: 'cat_groceries', amount: -22.4, description: 'Haushaltsbedarf', type: 'card' },
  { id: 'tx_7', date: '2026-11-01', creditor: 'Wochenmarkt Obst', categoryId: 'cat_groceries', amount: -15.0, description: 'Frische Äpfel & Gemüse', type: 'cash', isCash: true },
];

function computeCurrentWeekDays(
  cycle: MealCycle | null,
  overrides: Record<string, MealCalendarOverride>,
  defaultPortions: number
) {
  const base = new Date();
  const day = base.getDay();
  const diff = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base.setDate(diff));
  const todayIso = new Date().toISOString().split('T')[0];

  const days: Array<{
    date: string;
    weekday: string;
    dayMonth: string;
    isToday: boolean;
    recipeIds: string[];
    portions: number;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().split('T')[0];

    let cycleRecipeIds: string[] = [];
    let cyclePortions = defaultPortions;
    if (cycle && cycle.cycleLengthDays > 0) {
      const start = new Date(cycle.startDate);
      const diffTime = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const cycleIndex = ((diffTime % cycle.cycleLengthDays) + cycle.cycleLengthDays) % cycle.cycleLengthDays;
      const cycleDay = cycle.days.find((cd) => cd.dayIndex === cycleIndex);
      cycleRecipeIds = cycleDay?.recipeIds || [];
      cyclePortions = cycleDay?.portions ?? cycle.defaultPortions ?? defaultPortions;
    }

    const ov = overrides[iso];
    const activeRecipeIds = ov ? ov.recipeIds : cycleRecipeIds;
    const portions = ov?.portions ?? cyclePortions;

    days.push({
      date: iso,
      weekday: d.toLocaleDateString('de-DE', { weekday: 'short' }),
      dayMonth: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      isToday: iso === todayIso,
      recipeIds: activeRecipeIds,
      portions,
    });
  }
  return days;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  activeProfileId,
  activeProfileName,
  accentColors,
  enabledModules,
  enableCookbookShoppingList,
  dashboardSettings,
  onNavigateToModule,
  onOpenDashboardSettings,
  onTasksMutated,
}) => {
  const dashboardAccent = accentColors.dashboard || '#A67C21';
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // Module datasets
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [wikiArticles, setWikiArticles] = useState<WikiArticle[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [allCookbookRecipes, setAllCookbookRecipes] = useState<Recipe[]>([]);
  const [cycle, setCycle] = useState<MealCycle | null>(null);
  const [overrides, setOverrides] = useState<Record<string, MealCalendarOverride>>({});
  const [defaultCyclePortions, setDefaultCyclePortions] = useState(2);
  const [ingredientMeta, setIngredientMeta] = useState<Record<string, IngredientMeta>>({});
  const [dismissedDuplicates, setDismissedDuplicates] = useState<string[]>([]);
  const [serverShoppingEnabled, setServerShoppingEnabled] = useState<boolean>(enableCookbookShoppingList);
  const [checkedShoppingKeys, setCheckedShoppingKeys] = useState<Record<string, boolean>>({});
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);

  const [financeTx, setFinanceTx] = useState<FinanceTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('ochre_finance_tx');
      return saved ? JSON.parse(saved) : FALLBACK_FINANCE_TX;
    } catch {
      return FALLBACK_FINANCE_TX;
    }
  });

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [notesRes, tasksRes, wikiRes, cookbookRes, healthRes] = await Promise.all([
        api.fetchNotes(currentUser.username, activeProfileId).catch(() => [] as NoteMetadata[]),
        api.fetchTasks(currentUser.username, activeProfileId).catch(() => [] as TaskItem[]),
        enabledModules.wiki
          ? api.fetchWikiArticles(currentUser.username).catch(() => [] as WikiArticle[])
          : Promise.resolve([] as WikiArticle[]),
        enabledModules.recipes
          ? api.fetchCookbook(currentUser.username).catch(() => null)
          : Promise.resolve(null),
        api.fetchSystemHealth().catch(() => null),
      ]);

      setNotes(notesRes);
      setTasks(tasksRes);
      setWikiArticles(wikiRes);
      if (healthRes) setSystemHealth(healthRes);

      if (cookbookRes) {
        setRecipes(cookbookRes.recipes || []);
        const combinedMap = new Map<string, Recipe>();
        (cookbookRes.recipes || []).forEach((r) => combinedMap.set(r.id, r));
        (cookbookRes.sharedCatalogs || []).forEach((sc) =>
          sc.recipes.forEach((r) => {
            if (!combinedMap.has(r.id)) combinedMap.set(r.id, r);
          })
        );
        setAllCookbookRecipes(Array.from(combinedMap.values()));
        setCycle(cookbookRes.cycle || null);
        setOverrides(cookbookRes.overrides || {});
        setDefaultCyclePortions(cookbookRes.settings?.defaultCyclePortions || 2);
        setServerShoppingEnabled(cookbookRes.settings?.enableShoppingList !== false);
        setIngredientMeta(cookbookRes.ingredientMeta || {});
        setDismissedDuplicates(cookbookRes.dismissedDuplicates || []);
      }

      try {
        const savedTx = localStorage.getItem('ochre_finance_tx');
        if (savedTx) setFinanceTx(JSON.parse(savedTx));
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [currentUser.username, activeProfileId, enabledModules.wiki, enabledModules.recipes]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, refreshTick]);

  // Derived Cookbook Week & Shopping Forecast
  const calendarDays = useMemo(
    () => computeCurrentWeekDays(cycle, overrides, defaultCyclePortions),
    [cycle, overrides, defaultCyclePortions]
  );
  const currentWeekStartIso = calendarDays[0]?.date || '';
  const shoppingStorageKey = `ochre_shopping_checked_${currentUser.username}_${currentWeekStartIso}`;

  useEffect(() => {
    if (!currentWeekStartIso) return;
    try {
      const saved = localStorage.getItem(shoppingStorageKey);
      setCheckedShoppingKeys(saved ? JSON.parse(saved) : {});
    } catch {
      setCheckedShoppingKeys({});
    }
  }, [shoppingStorageKey, currentWeekStartIso, refreshTick]);

  const getRecipeById = useCallback(
    (id: string) => allCookbookRecipes.find((r) => r.id === id),
    [allCookbookRecipes]
  );

  const shoppingSummary = useMemo(
    () => generateWeeklyShoppingList({ calendarDays, getRecipeById, ingredientMeta }),
    [calendarDays, getRecipeById, ingredientMeta]
  );

  const openShoppingItems = useMemo(
    () => shoppingSummary.items.filter((item) => !checkedShoppingKeys[item.key]),
    [shoppingSummary.items, checkedShoppingKeys]
  );

  const handleCheckShoppingItem = (itemKey: string) => {
    setCheckedShoppingKeys((prev) => {
      const next = { ...prev, [itemKey]: true };
      try {
        localStorage.setItem(shoppingStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Interactive Task Check-off directly from Dashboard Tile
  const handleToggleDashboardTask = async (task: TaskItem) => {
    const nextDone = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextDone } : t)));
    await api.toggleTask(
      currentUser.username,
      task.notePath,
      task.lineIndex,
      nextDone,
      task.isShared,
      task.sharedFrom,
      activeProfileId
    );
    onTasksMutated?.();
  };

  // Derived Stats
  const openTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.isDueToday !== b.isDueToday) return a.isDueToday ? -1 : 1;
        return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
      });
  }, [tasks]);

  const financeStats = useMemo(() => {
    const income = financeTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = financeTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const balance = income - expenses;
    const cashCount = financeTx.filter((t) => t.isCash || t.type === 'cash').length;
    return { income, expenses, balance, cashCount };
  }, [financeTx]);

  const ingredientCatalogStats = useMemo(() => {
    const collected = collectIngredientsFromRecipes(recipes, ingredientMeta);
    const dupes = findIngredientDuplicates(collected, dismissedDuplicates);
    const excludedCount = collected.filter((c) => c.excludeFromShoppingList).length;
    return { total: collected.length, dupes: dupes.length, excludedCount };
  }, [recipes, ingredientMeta, dismissedDuplicates]);

  const todayAndTomorrowDays = useMemo(() => {
    const todayIdx = calendarDays.findIndex((d) => d.isToday);
    if (todayIdx === -1) return calendarDays.slice(0, 2);
    return calendarDays.slice(todayIdx, todayIdx + 2);
  }, [calendarDays]);

  const activeWidgetIds = useMemo(() => {
    const maxW = dashboardSettings.maxWidgets || 6;
    const valid = (dashboardSettings.selectedWidgets || []).filter((id) =>
      DASHBOARD_WIDGET_CATALOG.some((def) => def.id === id)
    );
    return valid.slice(0, maxW);
  }, [dashboardSettings]);

  const isShoppingActive = enableCookbookShoppingList && serverShoppingEnabled;

  // Render Individual Thick Tile ("Kachel")
  const renderWidgetTile = (widgetId: DashboardWidgetId) => {
    switch (widgetId) {
      case 'notes_tasks_open': {
        const modColor = accentColors.notes;
        const overdueCount = openTasks.filter((t) => t.isOverdue).length;
        const dueTodayCount = openTasks.filter((t) => t.isDueToday).length;
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: modColor }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <CheckSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Offene Aufgaben
                    </h3>
                    <span className="text-[11px] text-neutral-500">
                      Notes ({activeProfileName})
                    </span>
                  </div>
                </div>

                <div className="text-right tabular-nums">
                  <span className="text-2xl font-extrabold leading-none block" style={{ color: modColor }}>
                    {openTasks.length}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {overdueCount > 0 ? `${overdueCount} überfällig` : `${dueTodayCount} heute`}
                  </span>
                </div>
              </div>

              {openTasks.length === 0 ? (
                <div className="py-6 text-center rounded-2xl bg-[#F4F3EF]/70 dark:bg-[#25272C] text-xs text-neutral-500">
                  Alle Aufgaben erledigt.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {openTasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2.5 p-2 rounded-xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleDashboardTask(task)}
                        className="mt-0.5 w-5 h-5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-[#1E2024] hover:border-[var(--ochre-accent)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        title="Aufgabe abhaken"
                        aria-label={`Aufgabe ${task.title} abhaken`}
                      >
                        <Check className="w-3 h-3 text-transparent hover:text-neutral-400" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 block truncate">
                          {task.title}
                        </span>
                        <span className="text-[10px] text-neutral-400 block truncate tabular-nums">
                          {task.noteTitle}
                          {task.dueDate ? ` · 📅 ${task.dueDate}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {openTasks.length > 5 ? `+${openTasks.length - 5} weitere Aufgaben` : `${tasks.length} gesamt`}
              </span>
              <button
                type="button"
                onClick={() => onNavigateToModule('notes', { notesView: 'tasks' })}
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Zu Aufgaben</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'cookbook_shopping_open': {
        const modColor = accentColors.recipes;
        const totalCount = shoppingSummary.items.length;
        const doneCount = totalCount - openShoppingItems.length;
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: modColor }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Offener Einkaufs-Forecast
                    </h3>
                    <span className="text-[11px] text-neutral-500 tabular-nums">
                      Kochbuch · {calendarDays[0]?.dayMonth} – {calendarDays[6]?.dayMonth}
                    </span>
                  </div>
                </div>

                {isShoppingActive && (
                  <div className="text-right tabular-nums">
                    <span className="text-2xl font-extrabold leading-none block" style={{ color: modColor }}>
                      {openShoppingItems.length}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      von {totalCount} offen
                    </span>
                  </div>
                )}
              </div>

              {!isShoppingActive ? (
                <div className="py-5 px-3 text-center rounded-2xl bg-[#F4F3EF]/70 dark:bg-[#25272C] text-xs text-neutral-500 space-y-1">
                  <p className="font-medium">Einkaufsliste ist in den Kochbuch-Einstellungen deaktiviert.</p>
                </div>
              ) : openShoppingItems.length === 0 ? (
                <div className="py-6 text-center rounded-2xl bg-[#F4F3EF]/70 dark:bg-[#25272C] text-xs text-neutral-500">
                  {totalCount === 0
                    ? 'Noch keine Verbrauchs-Komponenten für diese Woche geplant.'
                    : `Alle ${totalCount} Posten für diese Woche abgehakt.`}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {openShoppingItems.slice(0, 6).map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleCheckShoppingItem(item.key)}
                          className="w-5 h-5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-[#1E2024] hover:border-[var(--ochre-accent)] flex items-center justify-center shrink-0 cursor-pointer"
                          title="Als eingekauft abhaken"
                          aria-label={`${item.name} abhaken`}
                        >
                          <Check className="w-3 h-3 text-transparent hover:text-neutral-400" />
                        </button>
                        <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: modColor }}>
                        {item.totalAmountDisplay}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {isShoppingActive
                  ? doneCount > 0
                    ? `${doneCount} bereits erledigt`
                    : `${shoppingSummary.includedRecipeCount} Gerichte eingeplant`
                  : 'Deaktiviert'}
              </span>
              <button
                type="button"
                onClick={() =>
                  isShoppingActive
                    ? onNavigateToModule('recipes', { cookbookTab: 'shopping' })
                    : onOpenDashboardSettings()
                }
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>{isShoppingActive ? 'Zur Einkaufsliste' : 'Aktivieren'}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'cookbook_today_meals': {
        const modColor = accentColors.recipes;
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: modColor }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <Utensils className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Speiseplan Heute &amp; Morgen
                    </h3>
                    <span className="text-[11px] text-neutral-500">Kochbuch &amp; Zyklus</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateToModule('recipes', { cookbookTab: 'presentation' })}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] text-[11px] font-semibold hover:opacity-85 cursor-pointer"
                  style={{ color: modColor }}
                  title="Wochenshow starten"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Show</span>
                </button>
              </div>

              <div className="space-y-2">
                {todayAndTomorrowDays.map((day) => {
                  const dayRecipes = day.recipeIds
                    .map((id) => getRecipeById(id))
                    .filter((r): r is Recipe => !!r);
                  return (
                    <div
                      key={day.date}
                      className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B] space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-neutral-800 dark:text-neutral-100">
                          {day.isToday ? 'Heute' : day.weekday} · {day.dayMonth}
                        </span>
                        <span className="text-neutral-400 flex items-center gap-1 tabular-nums">
                          <Users className="w-3 h-3" />
                          {day.portions} Port.
                        </span>
                      </div>
                      {dayRecipes.length === 0 ? (
                        <p className="text-[11px] text-neutral-400 italic">Noch kein Gericht geplant</p>
                      ) : (
                        <div className="space-y-1">
                          {dayRecipes.map((r) => (
                            <div key={r.id} className="flex items-center gap-2">
                              {r.images?.[0] && (
                                <img
                                  src={r.images[0]}
                                  alt={r.title}
                                  className="w-7 h-7 rounded-lg object-cover shrink-0"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                                  {r.title}
                                </span>
                                <span className="text-[10px] text-neutral-400 flex items-center gap-1 tabular-nums">
                                  <Clock className="w-2.5 h-2.5" />
                                  {r.prepTimeMinutes} Min · {r.category}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400 tabular-nums">
                Zyklus: {cycle?.cycleLengthDays || 7} Tage
              </span>
              <button
                type="button"
                onClick={() => onNavigateToModule('recipes', { cookbookTab: 'calendar' })}
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Essenskalender</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'finance_balance': {
        const modColor = accentColors.finance;
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: modColor }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Finanzen Monats-Bilanz
                    </h3>
                    <span className="text-[11px] text-neutral-500">Bank &amp; Barbestand</span>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-neutral-400 block">Aktueller Saldo</span>
                <span
                  className={`text-3xl font-extrabold tabular-nums tracking-tight block mt-0.5 ${
                    financeStats.balance >= 0 ? 'text-neutral-900 dark:text-white' : 'text-red-600'
                  }`}
                >
                  {financeStats.balance.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                    Einnahmen
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums block mt-0.5">
                    +{financeStats.income.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    Ausgaben
                  </span>
                  <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums block mt-0.5">
                    −{financeStats.expenses.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {financeTx.length} Buchungen · {financeStats.cashCount} Bar
              </span>
              <button
                type="button"
                onClick={() => onNavigateToModule('finance')}
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Zu Finanzen</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'notes_summary': {
        const modColor = accentColors.notes;
        const inboxCount = notes.filter((n) => n.isInbox).length;
        const folderSet = new Set(notes.map((n) => n.folder).filter((f) => f && f !== '.' && f !== '/'));
        const recentNotes = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 4);
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: modColor }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Notizen &amp; Inbox
                    </h3>
                    <span className="text-[11px] text-neutral-500">
                      Profil: {activeProfileName}
                    </span>
                  </div>
                </div>

                <div className="text-right tabular-nums">
                  <span className="text-2xl font-extrabold leading-none block" style={{ color: modColor }}>
                    {notes.length}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {folderSet.size} Ordner · {inboxCount} Inbox
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {recentNotes.length === 0 ? (
                  <div className="py-6 text-center rounded-2xl bg-[#F4F3EF]/70 dark:bg-[#25272C] text-xs text-neutral-500">
                    Noch keine Notizen in diesem Profil.
                  </div>
                ) : (
                  recentNotes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => onNavigateToModule('notes', { notesView: 'editor', notePath: n.path })}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded-xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B] hover:border-neutral-400 text-left cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {n.isInbox ? (
                          <Inbox className="w-3.5 h-3.5 shrink-0" style={{ color: modColor }} />
                        ) : (
                          <Folder className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {n.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-400 shrink-0 tabular-nums">
                        {new Date(n.mtime).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {inboxCount > 0 ? `${inboxCount} schnelle Notizen warten` : 'Alles einsortiert'}
              </span>
              <button
                type="button"
                onClick={() => onNavigateToModule('notes', { notesView: 'editor' })}
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Zu Notes</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'wiki_overview': {
        const modColor = accentColors.wiki;
        const totalImages = wikiArticles.reduce((s, a) => s + (a.images?.length || 0), 0);
        const totalSnippets = wikiArticles.reduce((s, a) => s + (a.snippets?.length || 0), 0);
        const catsCount = new Set(wikiArticles.map((a) => a.category)).size;
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: modColor }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <BookMarked className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Wiki Wissensbasis
                    </h3>
                    <span className="text-[11px] text-neutral-500">Anleitungen &amp; Snippets</span>
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <span className="text-2xl font-extrabold leading-none block" style={{ color: modColor }}>
                    {wikiArticles.length}
                  </span>
                  <span className="text-[10px] text-neutral-400">{catsCount} Kategorien</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Fotos</span>
                  <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                    {totalImages}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Code-Snippets</span>
                  <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                    {totalSnippets}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                {wikiArticles.slice(0, 2).map((art) => (
                  <div
                    key={art.slug}
                    className="px-2.5 py-1.5 rounded-xl bg-[#FBFBFA] dark:bg-[#25272C] text-xs flex items-center justify-between gap-2"
                  >
                    <span className="font-medium truncate">{art.title}</span>
                    <span className="text-[10px] text-neutral-400 shrink-0">{art.category}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400">Open-Standard Markdown</span>
              <button
                type="button"
                onClick={() => onNavigateToModule('wiki')}
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Zum Wiki</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'cookbook_catalog_stats': {
        const modColor = accentColors.recipes;
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: modColor }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Kochbuch Katalog &amp; Zutaten
                    </h3>
                    <span className="text-[11px] text-neutral-500">Tellergerichte &amp; Hygiene</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Gerichte</span>
                  <span className="text-xl font-extrabold tabular-nums" style={{ color: modColor }}>
                    {recipes.length}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Zutaten</span>
                  <span className="text-xl font-extrabold text-neutral-900 dark:text-neutral-100 tabular-nums">
                    {ingredientCatalogStats.total}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Ohne Liste</span>
                  <span className="text-xl font-extrabold text-neutral-600 dark:text-neutral-300 tabular-nums">
                    {ingredientCatalogStats.excludedCount}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B] flex items-center justify-between text-xs">
                <span className="text-neutral-600 dark:text-neutral-300">
                  Mögliche Zutaten-Duplikate
                </span>
                <span className="font-bold tabular-nums" style={{ color: ingredientCatalogStats.dupes > 0 ? modColor : undefined }}>
                  {ingredientCatalogStats.dupes}
                </span>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400">Tellergerichte &amp; Zutatenliste</span>
              <button
                type="button"
                onClick={() => onNavigateToModule('recipes', { cookbookTab: 'recipes' })}
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Zum Katalog</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'finance_recent_tx': {
        const modColor = accentColors.finance;
        const recent = financeTx.slice(0, 4);
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  style={{ backgroundColor: modColor }}
                  className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                >
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                    Letzte Buchungen
                  </h3>
                  <span className="text-[11px] text-neutral-500">Finanzen · Aktuelle 4 Umsätze</span>
                </div>
              </div>

              <div className="space-y-1.5">
                {recent.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-2 rounded-xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                        {tx.creditor}
                      </span>
                      <span className="text-[10px] text-neutral-400 tabular-nums">
                        {tx.date} · {tx.isCash || tx.type === 'cash' ? 'Bar' : 'Konto'}
                      </span>
                    </div>
                    <span
                      className={`font-bold tabular-nums shrink-0 ${
                        tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-neutral-100'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : ''}
                      {tx.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400">CSV &amp; Barerfassung</span>
              <button
                type="button"
                onClick={() => onNavigateToModule('finance')}
                style={{ color: modColor }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Alle Buchungen</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case 'system_health': {
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: dashboardAccent }}
                    className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                  >
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                      Server &amp; Sync Status
                    </h3>
                    <span className="text-[11px] text-neutral-500">NAS Vault &amp; Speicher</span>
                  </div>
                </div>
                <span className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {systemHealth?.volumeWritable ? 'Bereit' : 'Prüfen'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Laufzeit</span>
                  <span className="font-bold tabular-nums">
                    {systemHealth ? `${Math.floor(systemHealth.uptimeSeconds / 60)} Min` : '–'}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Speicher (RAM)</span>
                  <span className="font-bold tabular-nums">
                    {systemHealth ? `${systemHealth.memoryMb} MB` : '–'}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Sync-Queue</span>
                  <span className="font-bold tabular-nums">{api.getPendingSyncCount()} offen</span>
                </div>
                <div className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/80 dark:border-[#32353B]">
                  <span className="text-[10px] text-neutral-400 block">Umgebung</span>
                  <span className="font-bold">{systemHealth?.dockerDetected ? 'Docker' : 'Lokal'}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400 truncate max-w-[180px]">
                {systemHealth?.vaultPath || 'Vault aktiv'}
              </span>
              <span className="text-[11px] font-semibold text-neutral-500">
                Port {systemHealth?.port || 3000}
              </span>
            </div>
          </div>
        );
      }

      case 'quick_actions': {
        return (
          <div
            key={widgetId}
            className="snap-start min-h-[268px] flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs"
          >
            <div className="space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  style={{ backgroundColor: dashboardAccent }}
                  className="w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
                >
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
                    Schnellzugriffe
                  </h3>
                  <span className="text-[11px] text-neutral-500">Direkt in alle Suite-Module</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateToModule('notes', { notesView: 'editor' })}
                  className="min-h-[44px] p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#32353B] hover:border-neutral-400 flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                >
                  <BookOpen className="w-4 h-4 shrink-0" style={{ color: accentColors.notes }} />
                  <span className="truncate">Notizen</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateToModule('notes', { notesView: 'tasks' })}
                  className="min-h-[44px] p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#32353B] hover:border-neutral-400 flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                >
                  <CheckSquare className="w-4 h-4 shrink-0" style={{ color: accentColors.notes }} />
                  <span className="truncate">Aufgaben</span>
                </button>

                {enabledModules.recipes && (
                  <button
                    type="button"
                    onClick={() => onNavigateToModule('recipes', { cookbookTab: 'calendar' })}
                    className="min-h-[44px] p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#32353B] hover:border-neutral-400 flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <CalendarIcon className="w-4 h-4 shrink-0" style={{ color: accentColors.recipes }} />
                    <span className="truncate">Essensplan</span>
                  </button>
                )}

                {enabledModules.recipes && (
                  <button
                    type="button"
                    onClick={() => onNavigateToModule('recipes', { cookbookTab: 'presentation' })}
                    className="min-h-[44px] p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#32353B] hover:border-neutral-400 flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" style={{ color: accentColors.recipes }} />
                    <span className="truncate">Wochenshow</span>
                  </button>
                )}

                {enabledModules.wiki && (
                  <button
                    type="button"
                    onClick={() => onNavigateToModule('wiki')}
                    className="min-h-[44px] p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#32353B] hover:border-neutral-400 flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <BookMarked className="w-4 h-4 shrink-0" style={{ color: accentColors.wiki }} />
                    <span className="truncate">Wiki</span>
                  </button>
                )}

                {enabledModules.finance && (
                  <button
                    type="button"
                    onClick={() => onNavigateToModule('finance')}
                    className="min-h-[44px] p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#32353B] hover:border-neutral-400 flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <BarChart3 className="w-4 h-4 shrink-0" style={{ color: accentColors.finance }} />
                    <span className="truncate">Finanzen</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#E5E3DC]/70 dark:border-[#2B2D31] flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400">Kacheln konfigurierbar</span>
              <button
                type="button"
                onClick={onOpenDashboardSettings}
                style={{ color: dashboardAccent }}
                className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Anpassen</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto snap-y snap-proximity scroll-smooth bg-[#FAF9F5] dark:bg-[#141517] px-3.5 py-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 pb-16 lg:pb-8">
        {/* Compact Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{ backgroundColor: dashboardAccent }}
              className="w-11 h-11 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
            >
              <LayoutDashboard className="w-5.5 h-5.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100 truncate">
                Hallo {currentUser.displayName} — Übersicht
              </h2>
              <p className="text-xs text-neutral-500 tabular-nums truncate">
                {activeWidgetIds.length} von max. {dashboardSettings.maxWidgets || 6} Kacheln aktiv
                <span className="md:hidden"> · Nach oben/unten swipen</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] hover:border-neutral-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              title="Daten neu laden"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Aktualisieren</span>
            </button>

            <button
              type="button"
              onClick={onOpenDashboardSettings}
              style={{ backgroundColor: dashboardAccent }}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-xs hover:opacity-95 cursor-pointer active:scale-95 transition-all"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Kacheln anpassen</span>
            </button>
          </div>
        </div>

        {/* Empty State if user turned off all tiles */}
        {activeWidgetIds.length === 0 ? (
          <div className="p-10 text-center rounded-3xl border border-dashed border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-neutral-400" />
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              Keine Dashboard-Kacheln ausgewählt
            </p>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Aktiviere in den Einstellungen bis zu {dashboardSettings.maxWidgets || 6} Kacheln für deine persönliche Übersicht.
            </p>
            <button
              type="button"
              onClick={onOpenDashboardSettings}
              style={{ backgroundColor: dashboardAccent }}
              className="px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer"
            >
              Kacheln auswählen
            </button>
          </div>
        ) : (
          /* Thick Tile Layout: Vertical swipe snap feed on mobile, responsive Bento Grid on desktop */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {activeWidgetIds.map((id) => renderWidgetTile(id))}
          </div>
        )}
      </div>
    </div>
  );
};
