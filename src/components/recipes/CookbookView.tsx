import React, { useState } from 'react';
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
  Sparkles, 
  X, 
  Check, 
  AlertCircle,
  GripVertical
} from 'lucide-react';
import { Recipe, MealCycle, MealCalendarOverride } from '../../types';

const INITIAL_RECIPES: Recipe[] = [
  {
    id: 'r_1',
    title: 'Cremiges Kichererbsen-Curry mit Kokos',
    category: 'Mittagessen',
    prepTimeMinutes: 25,
    portions: 3,
    description: 'Aromatisches Curry mit Kokosmilch, frischem Spinat und Limette. Perfekt für Meal-Prep.',
    instructions: [
      'Zwiebeln, Knoblauch und Ingwer fein würfeln und in Kokosöl anbraten.',
      'Currypulver, Kreuzkümmel und Kurkuma kurz mitrösten.',
      'Kichererbsen und stückige Tomaten sowie Kokosmilch dazugeben, 15 Min köcheln lassen.',
      'Frischen Blattspinat unterheben bis er zusammenfällt, mit Limettensaft und Salz abschmecken.'
    ],
    ingredients: [
      { id: 'i1', name: 'Kichererbsen (Dose)', amount: '1 Dose (400g)' },
      { id: 'i2', name: 'Kokosmilch', amount: '250ml' },
      { id: 'i3', name: 'Babyspinat', amount: '150g' },
      { id: 'i4', name: 'Basmatireis', amount: '200g' }
    ],
    tags: ['vegetarisch', 'schnell', 'meal-prep'],
    color: '#D97706'
  },
  {
    id: 'r_2',
    title: 'Mediterrane Ofengemüse-Bowl mit Feta',
    category: 'Abendessen',
    prepTimeMinutes: 30,
    portions: 2,
    description: 'Buntes Blechgemüse mit Rosmarin, Olivenöl und goldbraun gebackenem Feta.',
    instructions: [
      'Backofen auf 200°C Ober-/Unterhitze vorheizen.',
      'Zucchini, Paprika und rote Zwiebeln in mundgerechte Stücke schneiden.',
      'Mit Olivenöl, Rosmarin, Salz und Pfeffer auf einem Blech verteilen.',
      'Feta in die Mitte legen und 25-30 Minuten im Ofen backen.'
    ],
    ingredients: [
      { id: 'i5', name: 'Feta', amount: '200g' },
      { id: 'i6', name: 'Zucchini', amount: '1 Stück' },
      { id: 'i7', name: 'Paprika (rot & gelb)', amount: '2 Stück' },
      { id: 'i8', name: 'Olivenöl extra vergine', amount: '3 EL' }
    ],
    tags: ['mediterran', 'low-carb', 'ofen'],
    color: '#059669'
  },
  {
    id: 'r_3',
    title: 'Overnight Oats mit Beeren & Chiasamen',
    category: 'Frühstück',
    prepTimeMinutes: 5,
    portions: 1,
    description: 'Energiespendendes Frühstück, am Vorabend zusammengerührt.',
    instructions: [
      'Haferflocken, Chiasamen und Mandelmilch in einem Glas verrühren.',
      'Mit einer Prise Zimt und Ahornsirup verfeinern.',
      'Über Nacht im Kühlschrank quellen lassen.',
      'Morgens mit frischen Beeren und Nüssen garnieren.'
    ],
    ingredients: [
      { id: 'i9', name: 'Zarte Haferflocken', amount: '60g' },
      { id: 'i10', name: 'Mandelmilch', amount: '140ml' },
      { id: 'i11', name: 'Chiasamen', amount: '1 EL' },
      { id: 'i12', name: 'Waldbeeren', amount: '50g' }
    ],
    tags: ['frühstück', 'protein', 'vegan'],
    color: '#7C3AED'
  },
  {
    id: 'r_4',
    title: 'Pasta mit Tomaten-Basilikum-Sugo',
    category: 'Mittagessen',
    prepTimeMinutes: 20,
    portions: 2,
    description: 'Klassische italienische Pasta mit sonnengereiften Tomaten und frischem Parmesan.',
    instructions: [
      'Nudeln in reichlich Salzwasser al dente kochen.',
      'Knoblauch in Olivenöl sanft anbraten, gehackte Tomaten hinzugeben.',
      '10 Minuten köcheln lassen, frischen Basilikum einrühren.',
      'Pasta untermengen und mit frisch geriebenem Parmesan servieren.'
    ],
    ingredients: [
      { id: 'i13', name: 'Spaghetti oder Penne', amount: '250g' },
      { id: 'i14', name: 'San Marzano Tomaten', amount: '1 Dose' },
      { id: 'i15', name: 'Frischer Basilikum', amount: '1 Bund' },
      { id: 'i16', name: 'Parmigiano Reggiano', amount: '40g' }
    ],
    tags: ['italienisch', 'klassiker', 'schnell'],
    color: '#DC2626'
  }
];

const INITIAL_CYCLE: MealCycle = {
  id: 'c_default',
  name: 'Standard-Wochenzyklus',
  cycleLengthDays: 7,
  startDate: new Date().toISOString().split('T')[0],
  days: [
    { dayIndex: 0, label: 'Tag 1 (Mo)', recipeIds: ['r_1'] },
    { dayIndex: 1, label: 'Tag 2 (Di)', recipeIds: ['r_2'] },
    { dayIndex: 2, label: 'Tag 3 (Mi)', recipeIds: ['r_4'] },
    { dayIndex: 3, label: 'Tag 4 (Do)', recipeIds: ['r_1'] },
    { dayIndex: 4, label: 'Tag 5 (Fr)', recipeIds: ['r_2'] },
    { dayIndex: 5, label: 'Tag 6 (Sa)', recipeIds: ['r_3', 'r_4'] },
    { dayIndex: 6, label: 'Tag 7 (So)', recipeIds: ['r_2'] },
  ]
};

export const CookbookView: React.FC = () => {
  // Navigation sub-tab: 'recipes' (Tellergerichte/Rezepte) | 'cycle' (Zyklus bearbeiten) | 'calendar' (Essenskalender)
  const [activeTab, setActiveTab] = useState<'recipes' | 'cycle' | 'calendar'>('calendar');

  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    const saved = localStorage.getItem('ochre_recipes_data');
    return saved ? JSON.parse(saved) : INITIAL_RECIPES;
  });

  const [cycle, setCycle] = useState<MealCycle>(() => {
    const saved = localStorage.getItem('ochre_meal_cycle_data');
    return saved ? JSON.parse(saved) : INITIAL_CYCLE;
  });

  const [overrides, setOverrides] = useState<Record<string, MealCalendarOverride>>(() => {
    const saved = localStorage.getItem('ochre_meal_overrides_data');
    return saved ? JSON.parse(saved) : {};
  });

  // Selected recipe for full detail instruction modal
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  // New Recipe / Edit Recipe Modal
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isCreatingRecipe, setIsCreatingRecipe] = useState(false);

  // Drag and drop state
  const [draggedRecipeId, setDraggedRecipeId] = useState<string | null>(null);

  // Calendar week offset (0 = current week, 1 = next week, etc.)
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Save to localStorage
  const saveRecipes = (data: Recipe[]) => {
    setRecipes(data);
    localStorage.setItem('ochre_recipes_data', JSON.stringify(data));
  };

  const saveCycle = (data: MealCycle) => {
    setCycle(data);
    localStorage.setItem('ochre_meal_cycle_data', JSON.stringify(data));
  };

  const saveOverrides = (data: Record<string, MealCalendarOverride>) => {
    setOverrides(data);
    localStorage.setItem('ochre_meal_overrides_data', JSON.stringify(data));
  };

  // Helper: compute days for current calendar view
  const getCalendarDays = () => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    // Find Monday of this week
    const day = base.getDay();
    const diff = base.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(base.setDate(diff));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      
      // Calculate cycle day
      // Days between cycle.startDate and this date
      const start = new Date(cycle.startDate);
      const diffTime = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const cycleIndex = ((diffTime % cycle.cycleLengthDays) + cycle.cycleLengthDays) % cycle.cycleLengthDays;
      const cycleDay = cycle.days.find((cd) => cd.dayIndex === cycleIndex);
      
      const isOverridden = !!overrides[iso];
      const activeRecipeIds = isOverridden 
        ? overrides[iso].recipeIds 
        : (cycleDay?.recipeIds || []);

      days.push({
        date: iso,
        dateObj: d,
        weekday: d.toLocaleDateString('de-DE', { weekday: 'short' }),
        dayMonth: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        isToday: iso === new Date().toISOString().split('T')[0],
        cycleDayIndex: cycleIndex,
        isOverridden,
        recipeIds: activeRecipeIds
      });
    }
    return days;
  };

  // Handle Drag & Drop to Calendar Day
  const handleDropOnDate = (dateIso: string) => {
    if (!draggedRecipeId) return;
    const currentList = overrides[dateIso]?.recipeIds || 
      getCalendarDays().find(d => d.date === dateIso)?.recipeIds || [];

    const updatedList = Array.from(new Set([...currentList, draggedRecipeId]));
    const nextOverrides = {
      ...overrides,
      [dateIso]: {
        date: dateIso,
        recipeIds: updatedList,
        isOneTimeChange: true,
        note: 'Kurzfristig angepasst'
      }
    };
    saveOverrides(nextOverrides);
    setDraggedRecipeId(null);
  };

  // Remove recipe from one-time calendar date
  const handleRemoveFromDate = (dateIso: string, recipeId: string) => {
    const current = overrides[dateIso]?.recipeIds || 
      getCalendarDays().find(d => d.date === dateIso)?.recipeIds || [];
    const filtered = current.filter(id => id !== recipeId);
    const nextOverrides = {
      ...overrides,
      [dateIso]: {
        date: dateIso,
        recipeIds: filtered,
        isOneTimeChange: true
      }
    };
    saveOverrides(nextOverrides);
  };

  // Reset One-Time Override back to cycle default
  const handleResetDateToCycle = (dateIso: string) => {
    const next = { ...overrides };
    delete next[dateIso];
    saveOverrides(next);
  };

  // Recipe helper
  const getRecipeById = (id: string) => recipes.find(r => r.id === id);

  return (
    <div className="flex-1 h-full flex flex-col bg-[#FAF9F5] dark:bg-[#161719] text-neutral-900 dark:text-neutral-100 overflow-hidden select-none">
      {/* Top Navigation Bar with Warm Ochre Branding & Module Subtabs */}
      <div className="h-12 border-b border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF]/90 dark:bg-[#1C1E22]/90 backdrop-blur-xs px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Utensils className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Ochre Kochbuch & Essenszyklus
            </h2>
          </div>
        </div>

        {/* Sub-tabs: Kalender | Zyklus | Tellergerichte */}
        <div className="flex items-center gap-1 bg-white/80 dark:bg-[#23252A] p-1 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Essenskalender</span>
          </button>

          <button
            onClick={() => setActiveTab('cycle')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'cycle'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Zyklus ({cycle.cycleLengthDays} Tage)</span>
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'recipes'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tellergerichte ({recipes.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* ======================================================== */}
        {/* TAB 1: ESSENSKALENDER (Drag & Drop + One-Time Overrides) */}
        {/* ======================================================== */}
        {activeTab === 'calendar' && (
          <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
            {/* Left/Main Column: Week Calendar Grid */}
            <div className="flex-1 flex flex-col h-full overflow-hidden p-3 md:p-5 border-r border-[#E5E3DC] dark:border-[#2B2D31]">
              {/* Calendar Controls */}
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setWeekOffset(w => w - 1)}
                    className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                    title="Vorherige Woche"
                  >
                    <ChevronLeft className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                  </button>
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    {weekOffset === 0 ? 'Aktuelle Woche' : weekOffset > 0 ? `+${weekOffset} Wochen` : `${weekOffset} Wochen`}
                  </span>
                  <button
                    onClick={() => setWeekOffset(w => w + 1)}
                    className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                    title="Nächste Woche"
                  >
                    <ChevronRight className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                  </button>
                  {weekOffset !== 0 && (
                    <button
                      onClick={() => setWeekOffset(0)}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium cursor-pointer"
                    >
                      Heute
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Automatisch aus {cycle.cycleLengthDays}-Tage-Zyklus berechnet</span>
                </div>
              </div>

              {/* 7-Days Calendar Cards */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 overflow-y-auto pr-1">
                {getCalendarDays().map((day) => (
                  <div
                    key={day.date}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnDate(day.date);
                    }}
                    className={`rounded-2xl border p-2.5 flex flex-col transition-all min-h-[140px] ${
                      day.isToday
                        ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-xs'
                        : 'border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024]'
                    }`}
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E3DC]/60 dark:border-[#2B2D31]">
                      <div>
                        <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block">
                          {day.weekday}
                        </span>
                        <span className="text-[10px] text-neutral-400">{day.dayMonth}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {day.isOverridden ? (
                          <span 
                            title="One-Time Änderung (beeinflusst den Zyklus nicht)" 
                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold"
                          >
                            Einmalig
                          </span>
                        ) : (
                          <span className="text-[9px] text-neutral-400 font-mono">
                            Z:{day.cycleDayIndex + 1}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Assigned Dishes on this Day */}
                    <div className="flex-1 py-1.5 space-y-1.5 overflow-y-auto no-scrollbar">
                      {day.recipeIds.length === 0 ? (
                        <div className="h-full flex items-center justify-center border-2 border-dashed border-[#E5E3DC] dark:border-[#2B2D31] rounded-xl p-2 text-center">
                          <span className="text-[10px] text-neutral-400">
                            Gericht hierher ziehen
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
                              className="group p-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#282A2F] border border-[#E5E3DC] dark:border-[#383A40] text-[11px] font-medium flex items-center justify-between hover:border-emerald-500 transition-all cursor-pointer"
                            >
                              <div className="truncate flex-1 pr-1">
                                <span className="block truncate font-semibold text-neutral-800 dark:text-neutral-200">
                                  {r.title}
                                </span>
                                <span className="text-[9px] text-neutral-400 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {r.prepTimeMinutes} Min
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveFromDate(day.date, rid);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-400 hover:text-red-500 transition-opacity"
                                title="Gericht für diesen Tag entfernen"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Reset One-Time Override to Default Cycle Button */}
                    {day.isOverridden && (
                      <button
                        onClick={() => handleResetDateToCycle(day.date)}
                        className="text-[10px] text-[#C87D20] hover:underline text-center pt-1 block w-full cursor-pointer"
                      >
                        ↩ Auf Zyklus zurücksetzen
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right Side Column: Drag & Drop Recipe Drawer */}
            <div className="w-full md:w-80 h-72 md:h-full bg-white dark:bg-[#1A1C1F] flex flex-col p-3 overflow-hidden border-t md:border-t-0 md:border-l border-[#E5E3DC] dark:border-[#2B2D31]">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                <div className="flex items-center gap-1.5">
                  <GripVertical className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    Tellergerichte bereit
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400">Ziehen & Loslassen</span>
              </div>

              <div className="flex-1 overflow-y-auto py-2 space-y-2 no-scrollbar">
                {recipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedRecipeId(recipe.id);
                      e.dataTransfer.setData('text/plain', recipe.id);
                    }}
                    onClick={() => setSelectedRecipe(recipe)}
                    className="p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226] hover:border-emerald-500 shadow-2xs hover:shadow-xs transition-all cursor-grab active:cursor-grabbing flex items-center justify-between group"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                        {recipe.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-medium">
                          {recipe.category}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          ⏱ {recipe.prepTimeMinutes}m
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRecipe(recipe);
                      }}
                      className="p-1 rounded-full text-neutral-400 hover:text-emerald-600"
                      title="Rezept & Kochanleitung öffnen"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: ZYKLUS BEARBEITEN (Dauer & wiederkehrender Plan) */}
        {/* ======================================================== */}
        {activeTab === 'cycle' && (
          <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-5">
            <div className="max-w-4xl mx-auto space-y-5">
              {/* Header Box */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-emerald-600" />
                    <span>Wiederkehrender Speiseplan-Zyklus</span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Definiere deine Zyklusdauer (z. B. 7, 14 oder 21 Tage). Der Zyklus wiederholt sich automatisch im Kalender.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Zyklusdauer:
                  </label>
                  <select
                    value={cycle.cycleLengthDays}
                    onChange={(e) => {
                      const newLen = parseInt(e.target.value, 10);
                      const currentDays = [...cycle.days];
                      // Adjust days array
                      const adjusted = [];
                      for (let i = 0; i < newLen; i++) {
                        const existing = currentDays.find(d => d.dayIndex === i);
                        adjusted.push(existing || {
                          dayIndex: i,
                          label: `Tag ${i + 1}`,
                          recipeIds: []
                        });
                      }
                      saveCycle({
                        ...cycle,
                        cycleLengthDays: newLen,
                        days: adjusted
                      });
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-800 dark:text-neutral-200 font-bold outline-hidden cursor-pointer"
                  >
                    <option value={7}>7 Tage (1 Woche)</option>
                    <option value={14}>14 Tage (2 Wochen)</option>
                    <option value={21}>21 Tage (3 Wochen)</option>
                    <option value={28}>28 Tage (4 Wochen)</option>
                  </select>
                </div>
              </div>

              {/* Cycle Days Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {cycle.days.map((cd) => (
                  <div
                    key={cd.dayIndex}
                    className="p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] shadow-2xs flex flex-col min-h-[170px]"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                      <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                        {cd.label || `Tag ${cd.dayIndex + 1}`}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
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
                              className="p-1.5 rounded-lg bg-[#F4F3EF] dark:bg-[#282A2F] text-[11px] font-medium flex items-center justify-between"
                            >
                              <span className="truncate pr-1">{r.title}</span>
                              <button
                                onClick={() => {
                                  const updated = cycle.days.map((d) =>
                                    d.dayIndex === cd.dayIndex
                                      ? { ...d, recipeIds: d.recipeIds.filter(id => id !== rid) }
                                      : d
                                  );
                                  saveCycle({ ...cycle, days: updated });
                                }}
                                className="p-0.5 rounded text-neutral-400 hover:text-red-500"
                                title="Entfernen"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Quick Add Recipe to Cycle Day */}
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
                          saveCycle({ ...cycle, days: updated });
                          e.target.value = '';
                        }}
                        defaultValue=""
                        className="w-full text-[10px] p-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-700 dark:text-neutral-300 outline-hidden cursor-pointer"
                      >
                        <option value="" disabled>+ Gericht hinzufügen...</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>{r.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: TELLERGERICHTE / REZEPTE MIT ANLEITUNG */}
        {/* ======================================================== */}
        {activeTab === 'recipes' && (
          <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4">
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-2">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    Rezeptsammlung & Tellergerichte
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Ausführliche Kochanleitungen mit Zutatenliste und Zubereitungsschritten.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreatingRecipe(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs cursor-pointer active:scale-95 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Neues Gericht</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    onClick={() => setSelectedRecipe(recipe)}
                    className="p-4 rounded-2xl border border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] hover:border-emerald-500 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                          {recipe.category}
                        </span>
                        <span className="text-xs text-neutral-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {recipe.prepTimeMinutes} Min
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
                        {recipe.title}
                      </h4>
                      <p className="text-xs text-neutral-500 line-clamp-2">
                        {recipe.description}
                      </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] flex items-center justify-between text-xs text-neutral-400">
                      <span>{recipe.ingredients.length} Zutaten</span>
                      <span className="text-emerald-600 font-medium group-hover:underline flex items-center gap-0.5">
                        Anleitung ansehen →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: REZEPT-ANLEITUNG & ZUTATEN */}
      {/* ======================================================== */}
      {selectedRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 md:p-5 border-b border-[#E5E3DC] dark:border-[#2B2D31] flex items-start justify-between">
              <div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wider">
                  {selectedRecipe.category}
                </span>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {selectedRecipe.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    Zubereitung: {selectedRecipe.prepTimeMinutes} Min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    {selectedRecipe.portions} Portionen
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecipe(null)}
                className="p-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 md:p-6 overflow-y-auto space-y-5 text-neutral-800 dark:text-neutral-200">
              {/* Description */}
              <p className="text-xs md:text-sm text-neutral-600 dark:text-neutral-300 italic bg-[#F4F3EF] dark:bg-[#25272C] p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136]">
                "{selectedRecipe.description}"
              </p>

              {/* Ingredients List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Benötigte Zutaten:
                </h4>
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

              {/* Step-by-Step Instructions */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Schritt-für-Schritt Zubereitung:
                </h4>
                <div className="space-y-2">
                  {selectedRecipe.instructions.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-2xl bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs"
                    >
                      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
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

            {/* Modal Footer */}
            <div className="p-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF] dark:bg-[#1A1C1F] flex justify-end">
              <button
                onClick={() => setSelectedRecipe(null)}
                className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 cursor-pointer"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: NEUES GERICHT ERSTELLEN */}
      {/* ======================================================== */}
      {isCreatingRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-lg rounded-3xl p-5 shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Neues Tellergericht hinzufügen</span>
              </h3>
              <button onClick={() => setIsCreatingRecipe(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as any;
                const newRec: Recipe = {
                  id: `r_${Date.now()}`,
                  title: form.title.value.trim(),
                  category: form.category.value,
                  prepTimeMinutes: parseInt(form.prepTime.value, 10) || 20,
                  portions: parseInt(form.portions.value, 10) || 2,
                  description: form.description.value.trim(),
                  instructions: form.instructions.value.split('\n').filter((l: string) => l.trim()),
                  ingredients: form.ingredients.value.split('\n').filter((l: string) => l.trim()).map((l: string, i: number) => ({
                    id: `ing_${i}`,
                    name: l,
                    amount: ''
                  })),
                  tags: ['selbstgemacht']
                };
                saveRecipes([...recipes, newRec]);
                setIsCreatingRecipe(false);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="font-semibold block mb-1">Name des Gerichts</label>
                <input
                  name="title"
                  required
                  placeholder="z. B. Ofen-Lachs mit Dillkartoffeln"
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Kategorie</label>
                  <select name="category" className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]">
                    <option value="Mittagessen">Mittagessen</option>
                    <option value="Abendessen">Abendessen</option>
                    <option value="Frühstück">Frühstück</option>
                    <option value="Snack">Snack</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Dauer (Min)</label>
                  <input name="prepTime" type="number" defaultValue={25} className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Portionen</label>
                  <input name="portions" type="number" defaultValue={2} className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]" />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Kurzbeschreibung</label>
                <input name="description" placeholder="Kurze Zusammenfassung..." className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]" />
              </div>

              <div>
                <label className="font-semibold block mb-1">Zutaten (eine pro Zeile)</label>
                <textarea name="ingredients" rows={3} placeholder="200g Lachsfilet&#10;500g Kartoffeln&#10;Frischer Dill" className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]" />
              </div>

              <div>
                <label className="font-semibold block mb-1">Zubereitungsschritte (einer pro Zeile)</label>
                <textarea name="instructions" rows={4} placeholder="1. Kartoffeln schälen und kochen.&#10;2. Lachs mit Zitronensaft würzen.&#10;3. Im Ofen bei 180°C 15 Minuten garen." className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C]" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingRecipe(false)}
                  className="px-3 py-1.5 rounded-full border text-neutral-600 dark:text-neutral-400"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-full bg-emerald-600 text-white font-bold shadow-xs hover:bg-emerald-700"
                >
                  Gericht speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
