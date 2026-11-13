import React, { useState, useEffect, useMemo } from 'react';
import {
  Utensils,
  Calendar as CalendarIcon,
  Repeat,
  Plus,
  Clock,
  Users,
  ChevronRight,
  ChevronLeft,
  Edit3,
  Trash2,
  Info,
  BookOpen,
  X,
  Check,
  GripVertical,
  Search,
  Share2,
  FolderPlus,
  Lock,
  Globe,
} from 'lucide-react';
import {
  User,
  Recipe,
  MealCycle,
  MealCalendarOverride,
  CookbookSharingSettings,
  SharedCookbookCatalog,
  SharedMealPlan,
} from '../../types';
import { api } from '../../services/api';

const DEFAULT_CATEGORIES = [
  'Frühstück',
  'Mittagessen',
  'Abendessen',
  'Snack',
  'Dessert',
  'Vegetarisch',
  'Schnelle Küche',
];

const EMPTY_CYCLE: MealCycle = {
  id: 'c_default',
  name: 'Mein Essenszyklus',
  cycleLengthDays: 7,
  startDate: new Date().toISOString().split('T')[0],
  days: Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    label: `Tag ${i + 1}`,
    recipeIds: [],
  })),
};

const EMPTY_SHARING: CookbookSharingSettings = {
  shareCatalog: false,
  catalogSharedWith: ['*'],
  shareCycleAndCalendar: false,
  cycleSharedWith: ['*'],
};

export interface CookbookSnapshot {
  selectedRecipe: Recipe | null;
  recipes: Recipe[];
  cycle: MealCycle;
  overrides: Record<string, MealCalendarOverride>;
  weekOffset: number;
  ownerName: string;
}

interface CookbookViewProps {
  currentUser: User;
  allUsers: User[];
  accentColor?: string;
  refreshKey?: number;
  onShareRecipe?: (recipe: Recipe) => void;
  onSnapshotChange?: (snapshot: CookbookSnapshot) => void;
}

export const CookbookView: React.FC<CookbookViewProps> = ({
  currentUser,
  allUsers,
  accentColor = '#C26D2D',
  refreshKey = 0,
  onShareRecipe,
  onSnapshotChange,
}) => {
  const [activeTab, setActiveTab] = useState<'recipes' | 'cycle' | 'calendar'>('calendar');
  const [loading, setLoading] = useState(true);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [cycle, setCycle] = useState<MealCycle>(EMPTY_CYCLE);
  const [overrides, setOverrides] = useState<Record<string, MealCalendarOverride>>({});
  const [sharing, setSharing] = useState<CookbookSharingSettings>(EMPTY_SHARING);
  const [sharedCatalogs, setSharedCatalogs] = useState<SharedCookbookCatalog[]>([]);
  const [sharedPlans, setSharedPlans] = useState<SharedMealPlan[]>([]);

  // Active filters & source selection
  const [catalogSource, setCatalogSource] = useState<string>('own'); // 'own' | 'all' | ownerUsername
  const [planOwner, setPlanOwner] = useState<string>('own'); // 'own' | ownerUsername
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);

  // Modals
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isSharingModalOpen, setIsSharingModalOpen] = useState(false);

  // Drag & drop + calendar week navigation + mobile floating nav
  const [draggedRecipeId, setDraggedRecipeId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState<boolean>(false);

  // Load user's cookbook + shared catalogs/plans from backend
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .fetchCookbook(currentUser.username)
      .then((data) => {
        if (cancelled) return;
        setRecipes(data.recipes || []);
        setCategories(data.categories?.length ? data.categories : DEFAULT_CATEGORIES);
        setCycle(data.cycle || EMPTY_CYCLE);
        setOverrides(data.overrides || {});
        setSharing(data.sharing || EMPTY_SHARING);
        setSharedCatalogs(data.sharedCatalogs || []);
        setSharedPlans(data.sharedPlans || []);
        setCatalogSource('own');
        setPlanOwner('own');
      })
      .catch((err) => console.error('Fehler beim Laden des Kochbuchs:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.username, refreshKey]);

  // Persistence helpers
  const persistCookbook = (partial: {
    recipes?: Recipe[];
    categories?: string[];
    cycle?: MealCycle;
    overrides?: Record<string, MealCalendarOverride>;
    sharing?: CookbookSharingSettings;
  }) => {
    if (partial.recipes !== undefined) setRecipes(partial.recipes);
    if (partial.categories !== undefined) setCategories(partial.categories);
    if (partial.cycle !== undefined) setCycle(partial.cycle);
    if (partial.overrides !== undefined) setOverrides(partial.overrides);
    if (partial.sharing !== undefined) setSharing(partial.sharing);
    api.saveCookbook(currentUser.username, partial).catch(console.error);
  };

  // All recipes combined (own + shared catalogs) for resolving calendar/cycle dish IDs
  const allCombinedRecipes = useMemo(() => {
    const map = new Map<string, Recipe>();
    recipes.forEach((r) => map.set(r.id, r));
    sharedCatalogs.forEach((sc) => {
      sc.recipes.forEach((r) => {
        if (!map.has(r.id)) map.set(r.id, r);
      });
    });
    sharedPlans.forEach((sp) => {
      sp.recipes.forEach((r) => {
        if (!map.has(r.id)) map.set(r.id, r);
      });
    });
    return Array.from(map.values());
  }, [recipes, sharedCatalogs, sharedPlans]);

  // Visible recipes in Catalog / Drag Drawer based on catalogSource + categoryFilter + searchQuery
  const sourceRecipes = useMemo(() => {
    if (catalogSource === 'own') return recipes;
    if (catalogSource === 'all') {
      const merged: Recipe[] = [...recipes];
      sharedCatalogs.forEach((sc) => {
        sc.recipes.forEach((r) => merged.push(r));
      });
      return merged;
    }
    const found = sharedCatalogs.find((sc) => sc.ownerUsername === catalogSource);
    return found ? found.recipes : recipes;
  }, [catalogSource, recipes, sharedCatalogs]);

  const allAvailableCategories = useMemo(() => {
    const set = new Set<string>(categories);
    sourceRecipes.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [categories, sourceRecipes]);

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sourceRecipes.filter((r) => {
      const matchesCat = categoryFilter === 'all' || r.category === categoryFilter;
      const matchesSearch =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        r.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    });
  }, [sourceRecipes, categoryFilter, searchQuery]);

  // Active plan data (own vs shared plan from another user)
  const activeSharedPlan = useMemo(
    () => (planOwner === 'own' ? null : sharedPlans.find((sp) => sp.ownerUsername === planOwner) || null),
    [planOwner, sharedPlans]
  );
  const displayedCycle = activeSharedPlan ? activeSharedPlan.cycle : cycle;
  const displayedOverrides = activeSharedPlan ? activeSharedPlan.overrides : overrides;
  const isViewingSharedPlan = !!activeSharedPlan;

  // Sync snapshot for Header Share/Print A4 actions
  useEffect(() => {
    if (onSnapshotChange) {
      onSnapshotChange({
        selectedRecipe,
        recipes: allCombinedRecipes,
        cycle: displayedCycle,
        overrides: displayedOverrides,
        weekOffset,
        ownerName: activeSharedPlan ? activeSharedPlan.ownerDisplayName : currentUser.displayName,
      });
    }
  }, [
    selectedRecipe,
    allCombinedRecipes,
    displayedCycle,
    displayedOverrides,
    weekOffset,
    activeSharedPlan,
    currentUser.displayName,
    onSnapshotChange,
  ]);

  const getRecipeById = (id: string) => {
    if (activeSharedPlan) {
      const fromPlan = activeSharedPlan.recipes.find((r) => r.id === id);
      if (fromPlan) return fromPlan;
    }
    return allCombinedRecipes.find((r) => r.id === id);
  };

  // Helper: compute 7 calendar days for current weekOffset
  const getCalendarDays = () => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const day = base.getDay();
    const diff = base.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(base.setDate(diff));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().split('T')[0];

      const start = new Date(displayedCycle.startDate);
      const diffTime = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const cycleIndex =
        ((diffTime % displayedCycle.cycleLengthDays) + displayedCycle.cycleLengthDays) %
        displayedCycle.cycleLengthDays;
      const cycleDay = displayedCycle.days.find((cd) => cd.dayIndex === cycleIndex);

      const isOverridden = !!displayedOverrides[iso];
      const activeRecipeIds = isOverridden
        ? displayedOverrides[iso].recipeIds
        : cycleDay?.recipeIds || [];

      days.push({
        date: iso,
        dateObj: d,
        weekday: d.toLocaleDateString('de-DE', { weekday: 'short' }),
        dayMonth: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        isToday: iso === new Date().toISOString().split('T')[0],
        cycleDayIndex: cycleIndex,
        isOverridden,
        recipeIds: activeRecipeIds,
      });
    }
    return days;
  };

  const handleDropOnDate = (dateIso: string) => {
    if (!draggedRecipeId || isViewingSharedPlan) return;
    const currentList =
      overrides[dateIso]?.recipeIds ||
      getCalendarDays().find((d) => d.date === dateIso)?.recipeIds ||
      [];

    const updatedList = Array.from(new Set([...currentList, draggedRecipeId]));
    const nextOverrides = {
      ...overrides,
      [dateIso]: {
        date: dateIso,
        recipeIds: updatedList,
        isOneTimeChange: true,
        note: 'Kurzfristig angepasst',
      },
    };
    persistCookbook({ overrides: nextOverrides });
    setDraggedRecipeId(null);
  };

  const handleRemoveFromDate = (dateIso: string, recipeId: string) => {
    if (isViewingSharedPlan) return;
    const current =
      overrides[dateIso]?.recipeIds ||
      getCalendarDays().find((d) => d.date === dateIso)?.recipeIds ||
      [];
    const filtered = current.filter((id) => id !== recipeId);
    const nextOverrides = {
      ...overrides,
      [dateIso]: {
        date: dateIso,
        recipeIds: filtered,
        isOneTimeChange: true,
      },
    };
    persistCookbook({ overrides: nextOverrides });
  };

  const handleResetDateToCycle = (dateIso: string) => {
    if (isViewingSharedPlan) return;
    const next = { ...overrides };
    delete next[dateIso];
    persistCookbook({ overrides: next });
  };

  const handleAddCategory = () => {
    const clean = newCategoryInput.trim();
    if (!clean) return;
    if (!categories.includes(clean)) {
      persistCookbook({ categories: [...categories, clean] });
    }
    setCategoryFilter(clean);
    setNewCategoryInput('');
    setIsAddingCategory(false);
  };

  const handleDeleteOwnRecipe = (id: string) => {
    const updated = recipes.filter((r) => r.id !== id);
    persistCookbook({ recipes: updated });
    if (selectedRecipe?.id === id) setSelectedRecipe(null);
  };

  const otherUsers = allUsers.filter((u) => u.username !== currentUser.username);

  const toggleSpecificRecipient = (
    field: 'catalogSharedWith' | 'cycleSharedWith',
    targetUsername: string
  ) => {
    const currentList = sharing[field];
    let next: string[];
    if (currentList.includes('*')) {
      next = [targetUsername];
    } else if (currentList.includes(targetUsername)) {
      next = currentList.filter((u) => u !== targetUsername);
    } else {
      next = [...currentList, targetUsername];
    }
    persistCookbook({ sharing: { ...sharing, [field]: next } });
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#FAF9F5] dark:bg-[#161719] text-neutral-900 dark:text-neutral-100 overflow-hidden select-none relative">
      {/* Top Sub-Navigation Bar */}
      <div className="min-h-12 py-1.5 border-b border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF]/90 dark:bg-[#1C1E22]/90 backdrop-blur-xs px-3 md:px-4 flex items-center justify-between gap-2 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-xs"
            style={{ backgroundColor: accentColor }}
          >
            <Utensils className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
              Kochbuch ({currentUser.displayName})
            </h2>
            <button
              type="button"
              onClick={() => setIsSharingModalOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] hover:border-neutral-400 cursor-pointer whitespace-nowrap"
              title="Freigabe für Katalog, Zyklus & Kalender verwalten"
            >
              {sharing.shareCatalog || sharing.shareCycleAndCalendar ? (
                <Globe className="w-3 h-3" style={{ color: accentColor }} />
              ) : (
                <Lock className="w-3 h-3 text-neutral-400" />
              )}
              <span className="hidden sm:inline">
                {sharing.shareCatalog || sharing.shareCycleAndCalendar ? 'Freigabe aktiv' : 'Privat'}
              </span>
            </button>
          </div>
        </div>

        {/* Sub-tabs: Kalender | Zyklus | Tellergerichte (Desktop lg+, Mobile uses bottom-right FAB) */}
        <div className="hidden lg:flex items-center gap-1 bg-white/80 dark:bg-[#23252A] p-1 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs shrink-0">
          <button
            onClick={() => setActiveTab('calendar')}
            style={activeTab === 'calendar' ? { backgroundColor: accentColor } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'calendar'
                ? 'text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Essenskalender</span>
          </button>

          <button
            onClick={() => setActiveTab('cycle')}
            style={activeTab === 'cycle' ? { backgroundColor: accentColor } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'cycle'
                ? 'text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Zyklus ({displayedCycle.cycleLengthDays} Tage)</span>
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            style={activeTab === 'recipes' ? { backgroundColor: accentColor } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'recipes'
                ? 'text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tellergerichte ({recipes.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-neutral-400">
          Lade Kochbuch-Daten...
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* ======================================================== */}
          {/* TAB 1: ESSENSKALENDER (Own or Shared Plan + Drag & Drop) */}
          {/* ======================================================== */}
          {activeTab === 'calendar' && (
            <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
              {/* Left/Main Column: Week Calendar Grid */}
              <div className="flex-1 flex flex-col h-full overflow-hidden p-3 md:p-5 border-r border-[#E5E3DC] dark:border-[#2B2D31]">
                {/* Plan Owner Selector (Own vs Shared Plans) + Week Nav */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setWeekOffset((w) => w - 1)}
                      className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                      title="Vorherige Woche"
                    >
                      <ChevronLeft className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                    </button>
                    <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 tabular-nums">
                      {weekOffset === 0
                        ? 'Aktuelle Woche'
                        : weekOffset > 0
                        ? `+${weekOffset} Wochen`
                        : `${weekOffset} Wochen`}
                    </span>
                    <button
                      onClick={() => setWeekOffset((w) => w + 1)}
                      className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                      title="Nächste Woche"
                    >
                      <ChevronRight className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                    </button>
                    {weekOffset !== 0 && (
                      <button
                        onClick={() => setWeekOffset(0)}
                        style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                        className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold cursor-pointer"
                      >
                        Heute
                      </button>
                    )}
                  </div>

                  {/* Plan Switcher if shared plans exist */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {sharedPlans.length > 0 && (
                      <select
                        value={planOwner}
                        onChange={(e) => setPlanOwner(e.target.value)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] font-medium outline-hidden cursor-pointer"
                      >
                        <option value="own">Mein Essensplan ({currentUser.displayName})</option>
                        {sharedPlans.map((sp) => (
                          <option key={sp.ownerUsername} value={sp.ownerUsername}>
                            Freigegebener Plan: {sp.ownerDisplayName}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="text-[11px] text-neutral-500">
                      {displayedCycle.cycleLengthDays}-Tage-Zyklus
                      {isViewingSharedPlan ? ' · Nur Lesen' : ''}
                    </span>
                  </div>
                </div>

                {/* 7-Days Calendar Cards */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 overflow-y-auto pr-1">
                  {getCalendarDays().map((day) => (
                    <div
                      key={day.date}
                      onDragOver={(e) => {
                        if (isViewingSharedPlan) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropOnDate(day.date);
                      }}
                      style={
                        day.isToday
                          ? { borderColor: accentColor, backgroundColor: `${accentColor}0D` }
                          : undefined
                      }
                      className={`rounded-2xl border p-2.5 flex flex-col transition-all min-h-[140px] ${
                        day.isToday
                          ? 'shadow-xs'
                          : 'border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024]'
                      }`}
                    >
                      {/* Day Header */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E3DC]/60 dark:border-[#2B2D31]">
                        <div>
                          <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block">
                            {day.weekday}
                          </span>
                          <span className="text-[10px] text-neutral-400 tabular-nums">{day.dayMonth}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {day.isOverridden ? (
                            <span
                              title="One-Time Änderung (beeinflusst den Zyklus nicht)"
                              className="text-[10px] font-semibold"
                              style={{ color: accentColor }}
                            >
                              Einmalig
                            </span>
                          ) : (
                            <span className="text-[10px] text-neutral-400 font-mono tabular-nums">
                              Z:{day.cycleDayIndex + 1}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Assigned Dishes */}
                      <div className="flex-1 py-1.5 space-y-1.5 overflow-y-auto no-scrollbar">
                        {day.recipeIds.length === 0 ? (
                          <div className="h-full flex items-center justify-center border-2 border-dashed border-[#E5E3DC] dark:border-[#2B2D31] rounded-xl p-2 text-center">
                            <span className="text-[10px] text-neutral-400">
                              {isViewingSharedPlan ? 'Kein Gericht' : 'Gericht hierher ziehen'}
                            </span>
                          </div>
                        ) : (
                          day.recipeIds.map((rid) => {
                            const r = getRecipeById(rid);
                            if (!r) return null;
                            return (
                              <div
                                key={rid}
                                onClick={() => setSelectedRecipe(r)}
                                className="group p-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#282A2F] border border-[#E5E3DC] dark:border-[#383A40] text-[11px] font-medium flex items-center justify-between hover:border-neutral-400 transition-all cursor-pointer"
                              >
                                <div className="truncate flex-1 pr-1">
                                  <span className="block truncate font-semibold text-neutral-800 dark:text-neutral-200">
                                    {r.title}
                                  </span>
                                  <span className="text-[9px] text-neutral-400 flex items-center gap-1 tabular-nums">
                                    <Clock className="w-2.5 h-2.5" />
                                    {r.prepTimeMinutes} Min
                                  </span>
                                </div>
                                {!isViewingSharedPlan && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveFromDate(day.date, rid);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-400 hover:text-red-500 transition-opacity cursor-pointer"
                                    title="Gericht für diesen Tag entfernen"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {!isViewingSharedPlan && day.isOverridden && (
                        <button
                          onClick={() => handleResetDateToCycle(day.date)}
                          style={{ color: accentColor }}
                          className="text-[10px] hover:underline text-center pt-1 block w-full cursor-pointer"
                        >
                          ↩ Auf Zyklus zurücksetzen
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side Column: Drag & Drop Recipe Drawer with Category Filter */}
              <div className="w-full md:w-80 h-80 md:h-full bg-white dark:bg-[#1A1C1F] flex flex-col p-3 overflow-hidden border-t md:border-t-0 md:border-l border-[#E5E3DC] dark:border-[#2B2D31]">
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                  <div className="flex items-center gap-1.5">
                    <GripVertical className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      Tellergerichte
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400">Ziehen &amp; Loslassen</span>
                </div>

                {/* Drawer Search + Category Filter */}
                <div className="py-2 space-y-1.5 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Gericht oder Zutat suchen..."
                      className="w-full text-[11px] pl-8 pr-2.5 py-1.5 rounded-lg bg-[#F4F3EF] dark:bg-[#23252A] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="flex-1 text-[11px] px-2 py-1 rounded-lg bg-[#F4F3EF] dark:bg-[#23252A] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden cursor-pointer"
                    >
                      <option value="all">Alle Kategorien</option>
                      {allAvailableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    {sharedCatalogs.length > 0 && (
                      <select
                        value={catalogSource}
                        onChange={(e) => setCatalogSource(e.target.value)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-[#F4F3EF] dark:bg-[#23252A] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden cursor-pointer"
                      >
                        <option value="own">Eigene</option>
                        <option value="all">Alle</option>
                        {sharedCatalogs.map((sc) => (
                          <option key={sc.ownerUsername} value={sc.ownerUsername}>
                            {sc.ownerDisplayName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2 pb-20 lg:pb-2 space-y-2 no-scrollbar">
                  {filteredRecipes.length === 0 ? (
                    <div className="text-center text-[11px] text-neutral-400 py-8">
                      Keine passenden Tellergerichte gefunden.
                    </div>
                  ) : (
                    filteredRecipes.map((recipe) => (
                      <div
                        key={recipe.id}
                        draggable={!isViewingSharedPlan}
                        onDragStart={(e) => {
                          setDraggedRecipeId(recipe.id);
                          e.dataTransfer.setData('text/plain', recipe.id);
                        }}
                        onClick={() => setSelectedRecipe(recipe)}
                        className="p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226] hover:border-neutral-400 shadow-2xs transition-all cursor-grab active:cursor-grabbing flex items-center justify-between group"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                            {recipe.title}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                            <span className="font-semibold" style={{ color: accentColor }}>
                              {recipe.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{recipe.prepTimeMinutes} Min</span>
                            {recipe.sharedFrom && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>von {recipe.sharedFrom}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecipe(recipe);
                          }}
                          className="p-1 rounded-full text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                          title="Rezept & Kochanleitung öffnen"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: ZYKLUS BEARBEITEN */}
          {/* ======================================================== */}
          {activeTab === 'cycle' && (
            <div className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 overflow-y-auto space-y-5">
              <div className="max-w-4xl mx-auto space-y-5">
                <div className="p-4 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                      <Repeat className="w-4 h-4" style={{ color: accentColor }} />
                      <span>
                        {isViewingSharedPlan
                          ? `Freigegebener Zyklus von ${activeSharedPlan?.ownerDisplayName}`
                          : 'Wiederkehrender Speiseplan-Zyklus'}
                      </span>
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Definiere deine Zyklusdauer (7 bis 28 Tage). Der Zyklus wiederholt sich automatisch im Kalender.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {sharedPlans.length > 0 && (
                      <select
                        value={planOwner}
                        onChange={(e) => setPlanOwner(e.target.value)}
                        className="text-xs px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] font-semibold outline-hidden cursor-pointer"
                      >
                        <option value="own">Mein Zyklus ({currentUser.displayName})</option>
                        {sharedPlans.map((sp) => (
                          <option key={sp.ownerUsername} value={sp.ownerUsername}>
                            Geteilt von {sp.ownerDisplayName}
                          </option>
                        ))}
                      </select>
                    )}

                    {!isViewingSharedPlan && (
                      <select
                        value={cycle.cycleLengthDays}
                        onChange={(e) => {
                          const newLen = parseInt(e.target.value, 10);
                          const currentDays = [...cycle.days];
                          const adjusted = [];
                          for (let i = 0; i < newLen; i++) {
                            const existing = currentDays.find((d) => d.dayIndex === i);
                            adjusted.push(
                              existing || {
                                dayIndex: i,
                                label: `Tag ${i + 1}`,
                                recipeIds: [],
                              }
                            );
                          }
                          persistCookbook({
                            cycle: {
                              ...cycle,
                              cycleLengthDays: newLen,
                              days: adjusted,
                            },
                          });
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-800 dark:text-neutral-200 font-bold outline-hidden cursor-pointer"
                      >
                        <option value={7}>7 Tage (1 Woche)</option>
                        <option value={14}>14 Tage (2 Wochen)</option>
                        <option value={21}>21 Tage (3 Wochen)</option>
                        <option value={28}>28 Tage (4 Wochen)</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {displayedCycle.days.map((cd) => (
                    <div
                      key={cd.dayIndex}
                      className="p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] shadow-2xs flex flex-col min-h-[170px]"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                          {cd.label || `Tag ${cd.dayIndex + 1}`}
                        </span>
                        <span className="text-[10px] font-semibold tabular-nums" style={{ color: accentColor }}>
                          {cd.recipeIds.length} Gerichte
                        </span>
                      </div>

                      <div className="flex-1 py-2 space-y-1.5 overflow-y-auto no-scrollbar">
                        {cd.recipeIds.length === 0 ? (
                          <span className="text-[11px] text-neutral-400 italic block py-4 text-center">
                            Kein Gericht zugeordnet
                          </span>
                        ) : (
                          cd.recipeIds.map((rid) => {
                            const r = getRecipeById(rid);
                            if (!r) return null;
                            return (
                              <div
                                key={rid}
                                onClick={() => setSelectedRecipe(r)}
                                className="p-1.5 rounded-lg bg-[#F4F3EF] dark:bg-[#282A2F] text-[11px] font-medium flex items-center justify-between cursor-pointer"
                              >
                                <span className="truncate pr-1">{r.title}</span>
                                {!isViewingSharedPlan && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = cycle.days.map((d) =>
                                        d.dayIndex === cd.dayIndex
                                          ? { ...d, recipeIds: d.recipeIds.filter((id) => id !== rid) }
                                          : d
                                      );
                                      persistCookbook({ cycle: { ...cycle, days: updated } });
                                    }}
                                    className="p-0.5 rounded text-neutral-400 hover:text-red-500 cursor-pointer"
                                    title="Entfernen"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {!isViewingSharedPlan && (
                        <div className="pt-2 border-t border-[#E5E3DC]/60 dark:border-[#2B2D31]">
                          <select
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const recipeId = e.target.value;
                              const updated = cycle.days.map((d) =>
                                d.dayIndex === cd.dayIndex
                                  ? { ...d, recipeIds: Array.from(new Set([...d.recipeIds, recipeId])) }
                                  : d
                              );
                              persistCookbook({ cycle: { ...cycle, days: updated } });
                              e.target.value = '';
                            }}
                            defaultValue=""
                            className="w-full text-[10px] p-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-700 dark:text-neutral-300 outline-hidden cursor-pointer"
                          >
                            <option value="" disabled>
                              + Gericht hinzufügen...
                            </option>
                            {allCombinedRecipes.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.title}
                                {r.sharedFrom ? ` (${r.sharedFrom})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: TELLERGERICHTE / KATALOG MIT ESSENSKATEGORIEN */}
          {/* ======================================================== */}
          {activeTab === 'recipes' && (
            <div className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 overflow-y-auto space-y-4">
              <div className="max-w-5xl mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      Tellergerichte-Katalog ({currentUser.displayName})
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Eigener Katalog mit Essenskategorien, Zutatenlisten und optionaler Freigabe.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsSharingModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] text-xs font-semibold cursor-pointer hover:border-neutral-400"
                    >
                      <Share2 className="w-3.5 h-3.5" style={{ color: accentColor }} />
                      <span>Katalog-Freigaben</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecipe(null);
                        setIsRecipeModalOpen(true);
                      }}
                      style={{ backgroundColor: accentColor }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold shadow-xs cursor-pointer active:scale-95 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Neues Gericht</span>
                    </button>
                  </div>
                </div>

                {/* Filter Toolbar: Search + Source + Food Categories */}
                <div className="p-3 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] space-y-2.5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Nach Gericht, Zutat oder Tag suchen..."
                        className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                      />
                    </div>

                    {sharedCatalogs.length > 0 && (
                      <div className="flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#25272C] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]">
                        <button
                          type="button"
                          onClick={() => setCatalogSource('own')}
                          style={catalogSource === 'own' ? { backgroundColor: accentColor } : undefined}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                            catalogSource === 'own' ? 'text-white' : 'text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          Mein Katalog
                        </button>
                        {sharedCatalogs.map((sc) => (
                          <button
                            key={sc.ownerUsername}
                            type="button"
                            onClick={() => setCatalogSource(sc.ownerUsername)}
                            style={
                              catalogSource === sc.ownerUsername
                                ? { backgroundColor: accentColor }
                                : undefined
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              catalogSource === sc.ownerUsername
                                ? 'text-white'
                                : 'text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            {sc.ownerDisplayName}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setCatalogSource('all')}
                          style={catalogSource === 'all' ? { backgroundColor: accentColor } : undefined}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                            catalogSource === 'all' ? 'text-white' : 'text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          Alle
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Interactive Food Category Filter Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('all')}
                      style={
                        categoryFilter === 'all'
                          ? { backgroundColor: accentColor, borderColor: accentColor }
                          : undefined
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        categoryFilter === 'all'
                          ? 'text-white'
                          : 'bg-[#F4F3EF] dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-300 hover:border-neutral-400'
                      }`}
                    >
                      Alle ({sourceRecipes.length})
                    </button>

                    {allAvailableCategories.map((cat) => {
                      const count = sourceRecipes.filter((r) => r.category === cat).length;
                      const isActive = categoryFilter === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          style={
                            isActive
                              ? { backgroundColor: accentColor, borderColor: accentColor }
                              : undefined
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            isActive
                              ? 'text-white'
                              : 'bg-[#F4F3EF] dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-300 hover:border-neutral-400'
                          }`}
                        >
                          {cat} ({count})
                        </button>
                      );
                    })}

                    {!isAddingCategory ? (
                      <button
                        type="button"
                        onClick={() => setIsAddingCategory(true)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-dashed border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                      >
                        <FolderPlus className="w-3 h-3" />
                        <span>+ Kategorie</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newCategoryInput}
                          onChange={(e) => setNewCategoryInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddCategory();
                            if (e.key === 'Escape') setIsAddingCategory(false);
                          }}
                          placeholder="Neue Essenskategorie..."
                          autoFocus
                          className="text-[11px] px-2 py-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={handleAddCategory}
                          style={{ backgroundColor: accentColor }}
                          className="px-2 py-1 rounded-lg text-[11px] text-white font-semibold cursor-pointer"
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recipe Cards Grid */}
                {filteredRecipes.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-[#E5E3DC] dark:border-[#2B2D31] text-xs text-neutral-500 space-y-2">
                    <p>Noch keine Tellergerichte in dieser Auswahl vorhanden.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecipe(null);
                        setIsRecipeModalOpen(true);
                      }}
                      style={{ backgroundColor: accentColor }}
                      className="px-3.5 py-1.5 rounded-full text-white font-semibold cursor-pointer"
                    >
                      Erstes Gericht anlegen
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredRecipes.map((recipe) => {
                      const isOwn = !recipe.sharedFrom && recipes.some((r) => r.id === recipe.id);
                      return (
                        <div
                          key={recipe.id}
                          onClick={() => setSelectedRecipe(recipe)}
                          className="p-4 rounded-2xl border border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] hover:border-neutral-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs gap-2">
                              <span className="font-semibold truncate" style={{ color: accentColor }}>
                                {recipe.category}
                                {recipe.sharedFrom ? ` · von ${recipe.sharedFrom}` : ''}
                              </span>
                              <span className="text-neutral-400 flex items-center gap-1 shrink-0 tabular-nums">
                                <Clock className="w-3.5 h-3.5" />
                                {recipe.prepTimeMinutes} Min
                              </span>
                            </div>
                            <h4 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
                              {recipe.title}
                            </h4>
                            <p className="text-xs text-neutral-500 line-clamp-2">{recipe.description}</p>
                          </div>

                          <div className="pt-3 mt-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] flex items-center justify-between text-xs text-neutral-400">
                            <span className="tabular-nums">{recipe.ingredients.length} Zutaten</span>
                            <div className="flex items-center gap-1.5">
                              {onShareRecipe && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onShareRecipe(recipe);
                                  }}
                                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                                  title="Rezept teilen"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {isOwn && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingRecipe(recipe);
                                      setIsRecipeModalOpen(true);
                                    }}
                                    className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                                    title="Gericht bearbeiten"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteOwnRecipe(recipe.id);
                                    }}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-neutral-400 hover:text-red-500 cursor-pointer"
                                    title="Gericht löschen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REZEPT-ANLEITUNG & ZUTATEN */}
      {/* ======================================================== */}
      {selectedRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 md:p-5 border-b border-[#E5E3DC] dark:border-[#2B2D31] flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold tracking-wider" style={{ color: accentColor }}>
                  {selectedRecipe.category}
                  {selectedRecipe.sharedFrom ? ` · von ${selectedRecipe.sharedFrom}` : ''}
                </span>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {selectedRecipe.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1 tabular-nums">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    Zubereitung: {selectedRecipe.prepTimeMinutes} Min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    {selectedRecipe.portions} Portionen
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {onShareRecipe && (
                  <button
                    type="button"
                    onClick={() => onShareRecipe(selectedRecipe)}
                    className="p-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    title="Dieses Rezept teilen"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
                {recipes.some((r) => r.id === selectedRecipe.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecipe(selectedRecipe);
                      setIsRecipeModalOpen(true);
                      setSelectedRecipe(null);
                    }}
                    className="p-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    title="Gericht bearbeiten"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setSelectedRecipe(null)}
                  className="p-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto space-y-5 text-neutral-800 dark:text-neutral-200">
              {selectedRecipe.description && (
                <p className="text-xs md:text-sm text-neutral-600 dark:text-neutral-300 italic bg-[#F4F3EF] dark:bg-[#25272C] p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136]">
                  "{selectedRecipe.description}"
                </p>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-500">Benötigte Zutaten:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedRecipe.ingredients.map((ing) => (
                    <div
                      key={ing.id}
                      className="p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#1A1C1F] text-xs flex items-center justify-between"
                    >
                      <span className="font-medium">{ing.name}</span>
                      <span className="text-neutral-500 font-semibold">{ing.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-neutral-500">Schritt-für-Schritt Zubereitung:</h4>
                <div className="space-y-2">
                  {selectedRecipe.instructions.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-2xl bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs"
                    >
                      <div
                        className="w-6 h-6 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 tabular-nums"
                        style={{ backgroundColor: accentColor }}
                      >
                        {idx + 1}
                      </div>
                      <p className="text-xs md:text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF] dark:bg-[#1A1C1F] flex justify-end">
              <button
                onClick={() => setSelectedRecipe(null)}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REZEPT ERSTELLEN / BEARBEITEN */}
      {/* ======================================================== */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-lg rounded-3xl p-5 shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                {editingRecipe ? (
                  <Edit3 className="w-4 h-4" style={{ color: accentColor }} />
                ) : (
                  <Plus className="w-4 h-4" style={{ color: accentColor }} />
                )}
                <span>{editingRecipe ? 'Tellergericht bearbeiten' : 'Neues Tellergericht hinzufügen'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsRecipeModalOpen(false);
                  setEditingRecipe(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as any;
                const chosenCat = (form.customCategory?.value?.trim() || form.category.value).trim();
                if (chosenCat && !categories.includes(chosenCat)) {
                  persistCookbook({ categories: [...categories, chosenCat] });
                }

                const parsedIngredients = form.ingredients.value
                  .split('\n')
                  .filter((l: string) => l.trim())
                  .map((l: string, i: number) => ({
                    id: `ing_${Date.now()}_${i}`,
                    name: l.trim(),
                    amount: '',
                  }));

                const newRec: Recipe = {
                  id: editingRecipe ? editingRecipe.id : `r_${Date.now()}`,
                  title: form.title.value.trim(),
                  category: chosenCat || 'Mittagessen',
                  prepTimeMinutes: parseInt(form.prepTime.value, 10) || 20,
                  portions: parseInt(form.portions.value, 10) || 2,
                  description: form.description.value.trim(),
                  instructions: form.instructions.value.split('\n').filter((l: string) => l.trim()),
                  ingredients: parsedIngredients,
                  tags: editingRecipe ? editingRecipe.tags : ['selbstgemacht'],
                };

                const nextRecipes = editingRecipe
                  ? recipes.map((r) => (r.id === editingRecipe.id ? newRec : r))
                  : [...recipes, newRec];
                persistCookbook({ recipes: nextRecipes });
                setIsRecipeModalOpen(false);
                setEditingRecipe(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="font-semibold block mb-1">Name des Gerichts</label>
                <input
                  name="title"
                  required
                  defaultValue={editingRecipe?.title || ''}
                  placeholder="z. B. Ofen-Lachs mit Dillkartoffeln"
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Essenskategorie</label>
                  <select
                    name="category"
                    defaultValue={editingRecipe?.category || categories[0] || 'Mittagessen'}
                    className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Dauer (Min)</label>
                  <input
                    name="prepTime"
                    type="number"
                    defaultValue={editingRecipe?.prepTimeMinutes || 25}
                    className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Portionen</label>
                  <input
                    name="portions"
                    type="number"
                    defaultValue={editingRecipe?.portions || 2}
                    className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Oder neue Kategorie anlegen (optional)</label>
                <input
                  name="customCategory"
                  placeholder="z. B. Sommergerichte, Suppen, Meal-Prep..."
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Kurzbeschreibung</label>
                <input
                  name="description"
                  defaultValue={editingRecipe?.description || ''}
                  placeholder="Kurze Zusammenfassung..."
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Zutaten (eine pro Zeile)</label>
                <textarea
                  name="ingredients"
                  rows={3}
                  defaultValue={
                    editingRecipe?.ingredients
                      .map((i) => (i.amount ? `${i.name} (${i.amount})` : i.name))
                      .join('\n') || ''
                  }
                  placeholder="200g Lachsfilet&#10;500g Kartoffeln&#10;Frischer Dill"
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Zubereitungsschritte (einer pro Zeile)</label>
                <textarea
                  name="instructions"
                  rows={4}
                  defaultValue={editingRecipe?.instructions.join('\n') || ''}
                  placeholder="1. Kartoffeln schälen und kochen.&#10;2. Lachs mit Zitronensaft würzen.&#10;3. Im Ofen bei 180°C 15 Minuten garen."
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecipeModalOpen(false);
                    setEditingRecipe(null);
                  }}
                  className="px-3 py-1.5 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-400 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: accentColor }}
                  className="px-4 py-1.5 rounded-full text-white font-bold shadow-xs cursor-pointer"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KATALOG & ZYKLUS/KALENDER FREIGABEN */}
      {/* ======================================================== */}
      {isSharingModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <Share2 className="w-4 h-4" style={{ color: accentColor }} />
                <span>Kochbuch-Freigaben ({currentUser.displayName})</span>
              </h3>
              <button
                onClick={() => setIsSharingModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 1. Tellergerichtskatalog Sharing */}
              <div className="p-3.5 rounded-xl bg-[#F4F3EF] dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                      Tellergerichtskatalog freigeben
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      Andere Benutzer können deine Gerichte in ihrem Katalog &amp; Kalender nutzen.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      persistCookbook({
                        sharing: { ...sharing, shareCatalog: !sharing.shareCatalog },
                      })
                    }
                    style={sharing.shareCatalog ? { backgroundColor: accentColor } : undefined}
                    className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                      sharing.shareCatalog
                        ? 'justify-end'
                        : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                  </button>
                </div>

                {sharing.shareCatalog && otherUsers.length > 0 && (
                  <div className="pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        persistCookbook({ sharing: { ...sharing, catalogSharedWith: ['*'] } })
                      }
                      style={
                        sharing.catalogSharedWith.includes('*')
                          ? { backgroundColor: accentColor, borderColor: accentColor }
                          : undefined
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                        sharing.catalogSharedWith.includes('*')
                          ? 'text-white'
                          : 'bg-white dark:bg-[#23252A] border-[#E5E3DC] dark:border-[#2F3136]'
                      }`}
                    >
                      Alle Benutzer
                    </button>
                    {otherUsers.map((u) => {
                      const active =
                        !sharing.catalogSharedWith.includes('*') &&
                        sharing.catalogSharedWith.includes(u.username);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleSpecificRecipient('catalogSharedWith', u.username)}
                          style={
                            active ? { backgroundColor: accentColor, borderColor: accentColor } : undefined
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                            active
                              ? 'text-white'
                              : 'bg-white dark:bg-[#23252A] border-[#E5E3DC] dark:border-[#2F3136]'
                          }`}
                        >
                          {u.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. Cycle & Calendar Sharing */}
              <div className="p-3.5 rounded-xl bg-[#F4F3EF] dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                      Zyklus &amp; Essenskalender freigeben
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      Andere Benutzer können deinen aktuellen Essensplan einsehen &amp; drucken.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      persistCookbook({
                        sharing: {
                          ...sharing,
                          shareCycleAndCalendar: !sharing.shareCycleAndCalendar,
                        },
                      })
                    }
                    style={sharing.shareCycleAndCalendar ? { backgroundColor: accentColor } : undefined}
                    className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                      sharing.shareCycleAndCalendar
                        ? 'justify-end'
                        : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                  </button>
                </div>

                {sharing.shareCycleAndCalendar && otherUsers.length > 0 && (
                  <div className="pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        persistCookbook({ sharing: { ...sharing, cycleSharedWith: ['*'] } })
                      }
                      style={
                        sharing.cycleSharedWith.includes('*')
                          ? { backgroundColor: accentColor, borderColor: accentColor }
                          : undefined
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                        sharing.cycleSharedWith.includes('*')
                          ? 'text-white'
                          : 'bg-white dark:bg-[#23252A] border-[#E5E3DC] dark:border-[#2F3136]'
                      }`}
                    >
                      Alle Benutzer
                    </button>
                    {otherUsers.map((u) => {
                      const active =
                        !sharing.cycleSharedWith.includes('*') &&
                        sharing.cycleSharedWith.includes(u.username);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleSpecificRecipient('cycleSharedWith', u.username)}
                          style={
                            active ? { backgroundColor: accentColor, borderColor: accentColor } : undefined
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                            active
                              ? 'text-white'
                              : 'bg-white dark:bg-[#23252A] border-[#E5E3DC] dark:border-[#2F3136]'
                          }`}
                        >
                          {u.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsSharingModalOpen(false)}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-1.5 rounded-full text-white text-xs font-bold cursor-pointer"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mobile Floating Action Navigation (Matches Notes Module): Bottom-Right */}
      {isMobileNavExpanded && (
        <div
          onClick={() => setIsMobileNavExpanded(false)}
          className="fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-2xs z-40 lg:hidden animate-in fade-in duration-150"
        />
      )}

      <div className="lg:hidden select-none">
        {isMobileNavExpanded ? (
          <div
            style={{ borderColor: accentColor }}
            className="fixed bottom-5 right-4 z-50 h-14 px-2.5 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-200"
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('calendar');
                setIsMobileNavExpanded(false);
              }}
              style={activeTab === 'calendar' ? { backgroundColor: accentColor } : undefined}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                activeTab === 'calendar'
                  ? 'text-white shadow-xs'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
              }`}
              title="Essenskalender"
              aria-label="Essenskalender"
            >
              <CalendarIcon className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('cycle');
                setIsMobileNavExpanded(false);
              }}
              style={activeTab === 'cycle' ? { backgroundColor: accentColor } : undefined}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                activeTab === 'cycle'
                  ? 'text-white shadow-xs'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
              }`}
              title={`Zyklus (${displayedCycle.cycleLengthDays} Tage)`}
              aria-label="Zyklus"
            >
              <Repeat className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('recipes');
                setIsMobileNavExpanded(false);
              }}
              style={activeTab === 'recipes' ? { backgroundColor: accentColor } : undefined}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                activeTab === 'recipes'
                  ? 'text-white shadow-xs'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
              }`}
              title={`Tellergerichte (${recipes.length})`}
              aria-label="Tellergerichte"
            >
              <BookOpen className="w-4.5 h-4.5" />
            </button>

            <div className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5" />

            <button
              type="button"
              onClick={() => setIsMobileNavExpanded(false)}
              className="w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
              aria-label="Navigation schließen"
              title="Navigation schließen"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsMobileNavExpanded(true)}
            style={{ borderColor: accentColor, color: accentColor }}
            className="fixed bottom-5 right-4 z-40 w-13 h-13 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
            title="Kochbuch-Navigation (Kalender, Zyklus, Tellergerichte)"
            aria-label="Kochbuch-Navigation umschalten"
          >
            {activeTab === 'calendar' && <CalendarIcon className="w-5 h-5" />}
            {activeTab === 'cycle' && <Repeat className="w-5 h-5" />}
            {activeTab === 'recipes' && <BookOpen className="w-5 h-5" />}
            <span
              style={{ backgroundColor: accentColor }}
              className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1E1F23]"
            />
          </button>
        )}
      </div>
    </div>
  );
};
