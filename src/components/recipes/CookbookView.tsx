import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  GripVertical,
  Search,
  Share2,
  FolderPlus,
  Camera,
  Upload,
  Images,
  Image as ImageIcon,
  Maximize2,
  Minus,
  ShoppingCart,
  Sparkles,
  Check,
  Play,
  Pause,
  Sun,
  Moon,
  RotateCcw,
  GitMerge,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Globe,
  Mail,
} from 'lucide-react';
import {
  User,
  Recipe,
  MealCycle,
  MealCalendarOverride,
  SharedCookbookCatalog,
  SharedMealPlan,
  CookbookTab,
  IngredientMeta,
  MealPlanLibrary,
  MealPlanInvitation,
  MealSectionConfig,
} from '../../types';
import { api } from '../../services/api';
import {
  DEFAULT_MEAL_SECTIONS,
  DEFAULT_MEAL_UNITS,
  DEFAULT_WEEKDAY_COLORS,
  MEAL_TYPE_OPTIONS,
} from '../../services/profileDefaults';
import { getScaledIngredientDisplay } from '../../services/portionScaling';
import { generateWeeklyShoppingList } from '../../services/shoppingListService';
import {
  collectIngredientsFromRecipes,
  findIngredientDuplicates,
  mergeIngredientInRecipes,
  normalizeIngredientKey,
  IngredientDuplicatePair,
} from '../../services/ingredientCatalogService';

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
  defaultPortions: 2,
  days: Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    label: `Tag ${i + 1}`,
    recipeIds: [],
    portions: 2,
  })),
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
  activeTab?: CookbookTab;
  onChangeTab?: (tab: CookbookTab) => void;
  enableShoppingList?: boolean;
  mobileBarPosition?: 'top' | 'bottom';
  onShoppingListSettingLoaded?: (enabled: boolean) => void;
  onCycleSettingLoaded?: (enabled: boolean) => void;
  onShareRecipe?: (recipe: Recipe) => void;
  onSnapshotChange?: (snapshot: CookbookSnapshot) => void;
}

function getClientMediaDir(recipe: Recipe): string {
  if (recipe.mediaDir) return recipe.mediaDir;
  const cleanTitle = (recipe.title || 'rezept')
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `${cleanTitle}_${recipe.id}`.slice(0, 64);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

function buildNormalizedSlots(
  recipeIds: string[] | undefined,
  slots: Record<string, string[]> | undefined,
  sections: MealSectionConfig[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const listSections = sections.length > 0 ? sections : DEFAULT_MEAL_SECTIONS;
  listSections.forEach((sec) => {
    result[sec.id] = [];
  });
  const fallbackId = listSections[0]?.id || 'mittag';
  const placed = new Set<string>();
  if (slots) {
    Object.entries(slots).forEach(([secId, list]) => {
      if (!Array.isArray(list)) return;
      const targetId = result[secId] ? secId : fallbackId;
      list.forEach((rid) => {
        if (rid && !result[targetId].includes(rid)) {
          result[targetId].push(rid);
          placed.add(rid);
        }
      });
    });
  }
  (recipeIds || []).forEach((rid) => {
    if (rid && !placed.has(rid)) {
      if (!result[fallbackId]) result[fallbackId] = [];
      result[fallbackId].push(rid);
      placed.add(rid);
    }
  });
  return result;
}

function flattenSlotsToRecipeIds(slots: Record<string, string[]>): string[] {
  const set = new Set<string>();
  Object.values(slots).forEach((arr) => {
    if (Array.isArray(arr)) arr.forEach((id) => set.add(id));
  });
  return Array.from(set);
}

const UNIT_ALIAS_MAP: Record<string, string> = {
  g: 'Gramm',
  gr: 'Gramm',
  gramm: 'Gramm',
  kg: 'KG',
  kilogramm: 'KG',
  l: 'Liter',
  liter: 'Liter',
  ml: 'ml',
  cl: 'ml',
  pck: 'Päckchen',
  packung: 'Päckchen',
  paeckchen: 'Päckchen',
  päckchen: 'Päckchen',
  stk: 'Stück',
  stück: 'Stück',
  el: 'EL',
  tl: 'TL',
  bund: 'Bund',
  prise: 'Prise',
  prisen: 'Prise',
  dose: 'Dose',
  dosen: 'Dose',
  becher: 'Becher',
};

function splitAmountValueAndUnit(
  rawAmount: string,
  availableUnits: string[]
): { amount: string; unit: string } {
  const trimmed = (rawAmount || '').trim();
  if (!trimmed) return { amount: '', unit: '' };

  const match = trimmed.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*([a-zA-ZäöüÄÖÜß.]+)?$/);
  if (match) {
    const numPart = (match[1] || '').trim();
    const unitRaw = (match[2] || '').replace(/\.+$/, '').trim();
    if (!unitRaw) {
      return { amount: numPart, unit: '' };
    }
    const lowerUnit = unitRaw.toLowerCase();
    const directMatch = availableUnits.find((u) => u.toLowerCase() === lowerUnit);
    if (directMatch) {
      return { amount: numPart, unit: directMatch };
    }
    const aliased = UNIT_ALIAS_MAP[lowerUnit];
    if (aliased) {
      const configuredAlias = availableUnits.find((u) => u.toLowerCase() === aliased.toLowerCase());
      return { amount: numPart, unit: configuredAlias || aliased };
    }
    return { amount: trimmed, unit: '' };
  }

  // Fallback if entire string happens to equal a unit name (e.g., "Prise")
  const exactUnit = availableUnits.find((u) => u.toLowerCase() === trimmed.toLowerCase());
  if (exactUnit) {
    return { amount: '1', unit: exactUnit };
  }

  return { amount: trimmed, unit: '' };
}

export const CookbookView: React.FC<CookbookViewProps> = ({
  currentUser,
  allUsers,
  accentColor = '#C26D2D',
  refreshKey = 0,
  activeTab: controlledTab,
  onChangeTab,
  enableShoppingList = true,
  mobileBarPosition = 'top',
  onShoppingListSettingLoaded,
  onCycleSettingLoaded,
  onShareRecipe,
  onSnapshotChange,
}) => {
  const [internalTab, setInternalTab] = useState<CookbookTab>('calendar');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = useCallback(
    (tab: CookbookTab) => {
      if (onChangeTab) onChangeTab(tab);
      else setInternalTab(tab);
    },
    [onChangeTab]
  );

  const [loading, setLoading] = useState(true);
  const [hasLibrary, setHasLibrary] = useState<boolean>(true);
  const [mealLibrary, setMealLibrary] = useState<MealPlanLibrary | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<MealPlanInvitation[]>([]);

  // Library onboarding state when user has no library yet
  const [newLibName, setNewLibName] = useState<string>(`Essensplan von ${currentUser.displayName}`);
  const [newLibVisibility, setNewLibVisibility] = useState<'private' | 'shared'>('private');
  const [newLibInvited, setNewLibInvited] = useState<string[]>([]);
  const [libActionLoading, setLibActionLoading] = useState<boolean>(false);
  const [libActionError, setLibActionError] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [cycle, setCycle] = useState<MealCycle>(EMPTY_CYCLE);
  const [overrides, setOverrides] = useState<Record<string, MealCalendarOverride>>({});
  const [defaultCyclePortions, setDefaultCyclePortions] = useState<number>(2);
  const [serverShoppingEnabled, setServerShoppingEnabled] = useState<boolean>(true);
  const [enableCycle, setEnableCycle] = useState<boolean>(true);
  const [mealSections, setMealSections] = useState<MealSectionConfig[]>(DEFAULT_MEAL_SECTIONS);
  const [availableUnits, setAvailableUnits] = useState<string[]>(DEFAULT_MEAL_UNITS);
  const [weekdayColors, setWeekdayColors] = useState<Record<string, string>>(DEFAULT_WEEKDAY_COLORS);
  const [ingredientMeta, setIngredientMeta] = useState<Record<string, IngredientMeta>>({});
  const [dismissedDuplicates, setDismissedDuplicates] = useState<string[]>([]);
  const [sharedCatalogs, setSharedCatalogs] = useState<SharedCookbookCatalog[]>([]);
  const [sharedPlans, setSharedPlans] = useState<SharedMealPlan[]>([]);

  // Katalog Sub-Switcher: Tellergerichte | Zutaten + Duplikate-Manager Modal + Standalone Zutat Modal
  const [catalogSubTab, setCatalogSubTab] = useState<'dishes' | 'ingredients'>('dishes');
  const [ingredientSearch, setIngredientSearch] = useState<string>('');
  const [ingredientFilter, setIngredientFilter] = useState<'all' | 'active' | 'excluded'>('all');
  const [duplicateMasterChoices, setDuplicateMasterChoices] = useState<Record<string, 'left' | 'right'>>({});
  const [showDuplicatesModal, setShowDuplicatesModal] = useState<boolean>(false);
  const [showAddIngredientModal, setShowAddIngredientModal] = useState<boolean>(false);
  const [newIngredientName, setNewIngredientName] = useState<string>('');
  const [newIngredientUnit, setNewIngredientUnit] = useState<string>('Gramm');
  const [newIngredientExcludeShopping, setNewIngredientExcludeShopping] = useState<boolean>(false);
  const [newIngredientError, setNewIngredientError] = useState<string | null>(null);

  // Active filters & source selection
  const [catalogSource, setCatalogSource] = useState<string>('own');
  const [planOwner, setPlanOwner] = useState<string>('own');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);

  // Selected Recipe Detail Overlay + Portions Scaling + Image Browser ("Bilder")
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [viewPortions, setViewPortions] = useState<number>(2);
  const [showMediaCatalog, setShowMediaCatalog] = useState<boolean>(false);
  const [uploadingMedia, setUploadingMedia] = useState<boolean>(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [isOverlayFileDragOver, setIsOverlayFileDragOver] = useState<boolean>(false);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  // Create/Edit Recipe Modal (Tabbed & Controlled: Rezept | Kategorie & Zeit | Verfügbarkeit)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [recipeFormTab, setRecipeFormTab] = useState<'recipe' | 'category' | 'availability'>('recipe');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formInstructions, setFormInstructions] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('Mittagessen');
  const [formCustomCategory, setFormCustomCategory] = useState<string>('');
  const [formPrepTime, setFormPrepTime] = useState<string>('25');
  const [formPortions, setFormPortions] = useState<string>('2');
  const [formComponents, setFormComponents] = useState<
    { id: string; name: string; amount: string; unit: string }[]
  >([]);
  const [formMealTypes, setFormMealTypes] = useState<string[]>([]);
  const [bulkComponentsMode, setBulkComponentsMode] = useState<boolean>(false);
  const [bulkComponentsText, setBulkComponentsText] = useState<string>('');
  const [ingredientPickerQuery, setIngredientPickerQuery] = useState<string>('');
  const [showIngredientDropdown, setShowIngredientDropdown] = useState<boolean>(false);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  // Mobile/Tablet "+ Gericht hinzufügen" -> Top-Anchored Light Katalog Overlay (for Calendar & Cycle sections)
  const [pickerTarget, setPickerTarget] = useState<
    | { mode: 'cycle'; dayIndex: number; sectionId: string }
    | { mode: 'calendar'; dateIso: string; sectionId: string }
    | null
  >(null);
  const [cyclePickerSearch, setCyclePickerSearch] = useState<string>('');
  const [cyclePickerCategory, setCyclePickerCategory] = useState<string>('all');

  // Shopping List check-off state persisted per user & week
  const [checkedShoppingKeys, setCheckedShoppingKeys] = useState<Record<string, boolean>>({});

  // Presentation Mode ("Wochenshow") slideshow state
  const [presentationAutoPlay, setPresentationAutoPlay] = useState<boolean>(false);
  const [activePresentationDayIdx, setActivePresentationDayIdx] = useState<number>(0);
  const presentationScrollRef = useRef<HTMLDivElement>(null);
  const presentationDayRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Mobile/Tablet Left Katalog Drawer & 1:1 Pixel-Launcher Finger Swipe + 20%-Retract Drag State
  const [isLightCatalogOpen, setIsLightCatalogOpen] = useState<boolean>(false);
  const [isLightCatalogRetracted, setIsLightCatalogRetracted] = useState<boolean>(false);
  const [catalogDragX, setCatalogDragX] = useState<number | null>(null);
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState<boolean>(false);
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Drag & Drop State (HTML5 Desktop + Pointer/Touch for Mobile & Tablet Katalog)
  const [draggedRecipeId, setDraggedRecipeId] = useState<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<{
    recipe: Recipe;
    x: number;
    y: number;
    hoverDate: string | null;
    hoverCycleDay: number | null;
    hoverSectionId: string | null;
  } | null>(null);

  const pointerDragOriginRef = useRef<{
    recipe: Recipe;
    startX: number;
    startY: number;
    fromLightCatalog: boolean;
    active: boolean;
    pointerId: number;
  } | null>(null);

  const catalogSwipeRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    currentX: number;
    lastX: number;
    lastTime: number;
    isTracking: boolean;
    lockedAxis: 'horizontal' | 'vertical' | null;
  } | null>(null);
  const [recentDropFlash, setRecentDropFlash] = useState<{
    slotKey: string;
    targetKey: string;
    recipeId: string;
  } | null>(null);
  const dropFlashTimerRef = useRef<number | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync Recipe Create/Edit controlled form fields whenever modal opens
  useEffect(() => {
    if (!isRecipeModalOpen) return;
    setRecipeFormTab('recipe');
    setFormValidationError(null);
    setIngredientPickerQuery('');
    setShowIngredientDropdown(false);
    if (editingRecipe) {
      const initialComps =
        editingRecipe.ingredients && editingRecipe.ingredients.length > 0
          ? editingRecipe.ingredients.map((i, idx) => {
              const split = splitAmountValueAndUnit(i.amount || '', availableUnits);
              return {
                id: i.id || `comp_${Date.now()}_${idx}`,
                name: i.name || '',
                amount: split.amount,
                unit: split.unit,
              };
            })
          : [];
      setFormTitle(editingRecipe.title || '');
      setFormDescription(editingRecipe.description || '');
      setFormInstructions((editingRecipe.instructions || []).join('\n'));
      setFormCategory(editingRecipe.category || categories[0] || 'Mittagessen');
      setFormCustomCategory('');
      setFormPrepTime(String(editingRecipe.prepTimeMinutes || 25));
      setFormPortions(String(editingRecipe.portions || defaultCyclePortions || 2));
      setFormComponents(initialComps);
      setFormMealTypes(editingRecipe.mealTypes || []);
      setBulkComponentsText(
        initialComps
          .filter((c) => c.name.trim())
          .map((c) => {
            const combined = [c.amount.trim(), c.unit.trim()].filter(Boolean).join(' ');
            return combined ? `${c.name} | ${combined}` : c.name;
          })
          .join('\n')
      );
    } else {
      setFormTitle('');
      setFormDescription('');
      setFormInstructions('');
      setFormCategory(categories[0] || 'Mittagessen');
      setFormCustomCategory('');
      setFormPrepTime('25');
      setFormPortions(String(defaultCyclePortions || 2));
      setFormComponents([]);
      setFormMealTypes([]);
      setBulkComponentsText('');
    }
    setBulkComponentsMode(false);
  }, [isRecipeModalOpen, editingRecipe, availableUnits, categories, defaultCyclePortions]);

  // Open Recipe Overlay helper (allows passing specific target portions from Calendar/Cycle)
  const openRecipeOverlay = useCallback((recipe: Recipe, targetPortions?: number) => {
    setSelectedRecipe(recipe);
    setViewPortions(Math.max(1, targetPortions || recipe.portions || 2));
    setShowMediaCatalog(false);
    setLightboxImageUrl(null);
  }, []);

  const loadCookbookData = useCallback(
    async (isCancelled?: () => boolean) => {
      setLoading(true);
      try {
        const data = await api.fetchCookbook(currentUser.username);
        if (isCancelled?.()) return;
        const libraryActive = data.hasLibrary !== false;
        setHasLibrary(libraryActive);
        setMealLibrary(data.library || null);
        setPendingInvitations(data.invitations || []);
        setNewLibName(`Essensplan von ${currentUser.displayName}`);
        setRecipes(data.recipes || []);
        setCategories(data.categories?.length ? data.categories : DEFAULT_CATEGORIES);
        const defP = Math.max(1, data.settings?.defaultCyclePortions || data.cycle?.defaultPortions || 2);
        const shopEnabled = data.settings?.enableShoppingList !== false;
        const cycleEnabled = data.settings?.enableCycle !== false;
        setDefaultCyclePortions(defP);
        setServerShoppingEnabled(shopEnabled);
        setEnableCycle(cycleEnabled);
        onShoppingListSettingLoaded?.(shopEnabled);
        onCycleSettingLoaded?.(cycleEnabled);
        setMealSections(
          data.settings?.mealSections && data.settings.mealSections.length > 0
            ? data.settings.mealSections
            : DEFAULT_MEAL_SECTIONS
        );
        setAvailableUnits(
          data.settings?.units && data.settings.units.length > 0
            ? data.settings.units
            : DEFAULT_MEAL_UNITS
        );
        setWeekdayColors({
          ...DEFAULT_WEEKDAY_COLORS,
          ...(data.settings?.weekdayColors || {}),
        });
        setCycle(data.cycle || EMPTY_CYCLE);
        setOverrides(data.overrides || {});
        setIngredientMeta(data.ingredientMeta || {});
        setDismissedDuplicates(data.dismissedDuplicates || []);
        setSharedCatalogs(data.sharedCatalogs || []);
        setSharedPlans(data.sharedPlans || []);
        setCatalogSource('own');
        setPlanOwner('own');
      } catch (err) {
        console.error('Fehler beim Laden des Essensplans:', err);
      } finally {
        if (!isCancelled?.()) setLoading(false);
      }
    },
    [currentUser.username, currentUser.displayName, onShoppingListSettingLoaded, onCycleSettingLoaded]
  );

  // Load user's Essensplan + shared catalogs/plans from backend
  useEffect(() => {
    let cancelled = false;
    loadCookbookData(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadCookbookData, refreshKey]);

  const effectiveShoppingEnabled = enableShoppingList && serverShoppingEnabled;

  // Redirect away from 'shopping' or 'cycle' if disabled in settings
  useEffect(() => {
    if (!effectiveShoppingEnabled && activeTab === 'shopping') {
      setActiveTab('calendar');
    } else if (!enableCycle && activeTab === 'cycle') {
      setActiveTab('calendar');
    }
  }, [effectiveShoppingEnabled, enableCycle, activeTab, setActiveTab]);

  // Persistence helper
  const persistCookbook = useCallback(
    (partial: {
      recipes?: Recipe[];
      categories?: string[];
      cycle?: MealCycle;
      overrides?: Record<string, MealCalendarOverride>;
      ingredientMeta?: Record<string, IngredientMeta>;
      dismissedDuplicates?: string[];
    }) => {
      if (partial.recipes !== undefined) setRecipes(partial.recipes);
      if (partial.categories !== undefined) setCategories(partial.categories);
      if (partial.cycle !== undefined) setCycle(partial.cycle);
      if (partial.overrides !== undefined) setOverrides(partial.overrides);
      if (partial.ingredientMeta !== undefined) setIngredientMeta(partial.ingredientMeta);
      if (partial.dismissedDuplicates !== undefined) setDismissedDuplicates(partial.dismissedDuplicates);
      api.saveCookbook(currentUser.username, partial).catch(console.error);
    },
    [currentUser.username]
  );

  // Keep selectedRecipe synced whenever recipes array updates (e.g. after image upload/delete)
  useEffect(() => {
    if (!selectedRecipe) return;
    const updated = recipes.find((r) => r.id === selectedRecipe.id);
    if (updated && updated !== selectedRecipe) {
      setSelectedRecipe(updated);
    }
  }, [recipes, selectedRecipe]);

  // All recipes combined (own + shared catalogs)
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

  // Visible recipes in Catalog / Drag Drawer
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

  // Sync snapshot for Header Share / Print A4 actions
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

  const getRecipeById = useCallback(
    (id: string) => {
      if (activeSharedPlan) {
        const fromPlan = activeSharedPlan.recipes.find((r) => r.id === id);
        if (fromPlan) return fromPlan;
      }
      return allCombinedRecipes.find((r) => r.id === id);
    },
    [activeSharedPlan, allCombinedRecipes]
  );

  // Helper: compute 7 calendar days for current weekOffset
  const getCalendarDays = useCallback(() => {
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
      const daySlots = buildNormalizedSlots(
        isOverridden ? displayedOverrides[iso].recipeIds : cycleDay?.recipeIds,
        isOverridden ? displayedOverrides[iso].slots : cycleDay?.slots,
        mealSections
      );
      const activeRecipeIds = flattenSlotsToRecipeIds(daySlots);
      const dayPortions =
        (isOverridden ? displayedOverrides[iso]?.portions : undefined) ??
        cycleDay?.portions ??
        displayedCycle.defaultPortions ??
        defaultCyclePortions;

      days.push({
        date: iso,
        dateObj: d,
        isoWeekday: String(d.getDay()),
        weekday: d.toLocaleDateString('de-DE', { weekday: 'short' }),
        dayMonth: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        isToday: iso === new Date().toISOString().split('T')[0],
        cycleDayIndex: cycleIndex,
        isOverridden,
        slots: daySlots,
        recipeIds: activeRecipeIds,
        portions: dayPortions,
      });
    }
    return days;
  }, [displayedCycle, displayedOverrides, weekOffset, defaultCyclePortions, mealSections]);

  const calendarDays = useMemo(() => getCalendarDays(), [getCalendarDays]);

  const currentWeekStartIso = calendarDays[0]?.date || '';
  const shoppingStorageKey = useMemo(
    () => `ochre_shopping_checked_${currentUser.username}_${currentWeekStartIso}`,
    [currentUser.username, currentWeekStartIso]
  );

  // Load checked shopping items from localStorage per user & week
  useEffect(() => {
    if (!currentWeekStartIso) return;
    try {
      const saved = localStorage.getItem(shoppingStorageKey);
      setCheckedShoppingKeys(saved ? JSON.parse(saved) : {});
    } catch {
      setCheckedShoppingKeys({});
    }
  }, [shoppingStorageKey, currentWeekStartIso]);

  const toggleShoppingItemChecked = useCallback(
    (itemKey: string) => {
      setCheckedShoppingKeys((prev) => {
        const next = { ...prev, [itemKey]: !prev[itemKey] };
        try {
          localStorage.setItem(shoppingStorageKey, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });
    },
    [shoppingStorageKey]
  );

  const clearCheckedShoppingItems = useCallback(() => {
    setCheckedShoppingKeys({});
    try {
      localStorage.removeItem(shoppingStorageKey);
    } catch {
      // ignore
    }
  }, [shoppingStorageKey]);

  const shoppingSummary = useMemo(
    () => generateWeeklyShoppingList({ calendarDays, getRecipeById, ingredientMeta }),
    [calendarDays, getRecipeById, ingredientMeta]
  );

  // Collected Ingredients & Duplicate Pairs for Katalog -> Zutaten
  const collectedIngredients = useMemo(
    () => collectIngredientsFromRecipes(recipes, ingredientMeta),
    [recipes, ingredientMeta]
  );

  const duplicatePairs = useMemo(
    () => findIngredientDuplicates(collectedIngredients, dismissedDuplicates),
    [collectedIngredients, dismissedDuplicates]
  );

  const filteredIngredients = useMemo(() => {
    const q = ingredientSearch.toLowerCase().trim();
    return collectedIngredients.filter((ing) => {
      if (ingredientFilter === 'active' && ing.excludeFromShoppingList) return false;
      if (ingredientFilter === 'excluded' && !ing.excludeFromShoppingList) return false;
      if (!q) return true;
      return (
        ing.displayName.toLowerCase().includes(q) ||
        ing.recipeTitles.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [collectedIngredients, ingredientSearch, ingredientFilter]);

  const handleToggleIngredientShoppingList = useCallback(
    (key: string, displayName: string) => {
      const existing = ingredientMeta[key] || { key, displayName, excludeFromShoppingList: false };
      const nextMeta: Record<string, IngredientMeta> = {
        ...ingredientMeta,
        [key]: {
          ...existing,
          key,
          displayName,
          excludeFromShoppingList: !existing.excludeFromShoppingList,
        },
      };
      persistCookbook({ ingredientMeta: nextMeta });
    },
    [ingredientMeta, persistCookbook]
  );

  const handleCreateStandaloneIngredient = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newIngredientName.trim();
      if (!trimmed) {
        setNewIngredientError('Bitte einen Zutatennamen eingeben.');
        return;
      }
      const key = normalizeIngredientKey(trimmed);
      if (!key) {
        setNewIngredientError('Bitte einen gültigen Zutatennamen eingeben.');
        return;
      }
      const alreadyExists = collectedIngredients.some((ing) => ing.key === key);
      if (alreadyExists) {
        setNewIngredientError(`„${trimmed}“ ist bereits in den Zutaten vorhanden.`);
        return;
      }

      const nextMeta: Record<string, IngredientMeta> = {
        ...ingredientMeta,
        [key]: {
          key,
          displayName: trimmed,
          defaultUnit: newIngredientUnit || undefined,
          excludeFromShoppingList: newIngredientExcludeShopping,
          isCustom: true,
        },
      };
      persistCookbook({ ingredientMeta: nextMeta });
      setNewIngredientName('');
      setNewIngredientError(null);
      setNewIngredientExcludeShopping(false);
      setShowAddIngredientModal(false);
    },
    [
      newIngredientName,
      newIngredientUnit,
      newIngredientExcludeShopping,
      collectedIngredients,
      ingredientMeta,
      persistCookbook,
    ]
  );

  const handleDeleteUnusedIngredient = useCallback(
    (key: string) => {
      const nextMeta = { ...ingredientMeta };
      delete nextMeta[key];
      persistCookbook({ ingredientMeta: nextMeta });
    },
    [ingredientMeta, persistCookbook]
  );

  const handleKeepBothDuplicates = useCallback(
    (pairKey: string) => {
      const nextDismissed = Array.from(new Set([...dismissedDuplicates, pairKey]));
      persistCookbook({ dismissedDuplicates: nextDismissed });
    },
    [dismissedDuplicates, persistCookbook]
  );

  const handleMergeDuplicatePair = useCallback(
    (pair: IngredientDuplicatePair) => {
      const chosenSide =
        duplicateMasterChoices[pair.pairKey] ||
        (pair.right.recipeCount > pair.left.recipeCount ? 'right' : 'left');
      const master = chosenSide === 'left' ? pair.left : pair.right;
      const source = chosenSide === 'left' ? pair.right : pair.left;

      const nextRecipes = mergeIngredientInRecipes(recipes, master.displayName, source.key);
      const nextMeta = { ...ingredientMeta };
      if (source.key !== master.key) {
        if (!nextMeta[master.key]) {
          nextMeta[master.key] = {
            key: master.key,
            displayName: master.displayName,
            excludeFromShoppingList: master.excludeFromShoppingList,
          };
        }
        delete nextMeta[source.key];
      }

      persistCookbook({ recipes: nextRecipes, ingredientMeta: nextMeta });
    },
    [duplicateMasterChoices, recipes, ingredientMeta, persistCookbook]
  );

  // Auto-advance Slideshow in Wochenshow when enabled
  useEffect(() => {
    if (activeTab !== 'presentation') {
      setPresentationAutoPlay(false);
      return;
    }
    if (!presentationAutoPlay) return;
    const timer = window.setInterval(() => {
      setActivePresentationDayIdx((prev) => {
        const next = (prev + 1) % 7;
        const el = presentationDayRefs.current[next];
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return next;
      });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [activeTab, presentationAutoPlay]);

  const triggerDropFlash = useCallback(
    (scopeKey: string, sectionId: string, recipeId: string) => {
      const sec = sectionId || mealSections[0]?.id || 'mittag';
      const slotKey = `${scopeKey}__${sec}`;
      const targetKey = `${slotKey}__${recipeId}`;
      if (dropFlashTimerRef.current) window.clearTimeout(dropFlashTimerRef.current);
      setRecentDropFlash({ slotKey, targetKey, recipeId });
      dropFlashTimerRef.current = window.setTimeout(() => {
        setRecentDropFlash(null);
      }, 1300);
    },
    [mealSections]
  );

  // Toggle recipe assignment in a section of Cycle day or Calendar date (used by Mobile Light Katalog Overlay)
  const handleToggleRecipeInTarget = useCallback(
    (
      target:
        | { mode: 'cycle'; dayIndex: number; sectionId: string }
        | { mode: 'calendar'; dateIso: string; sectionId: string },
      recipeId: string
    ) => {
      if (isViewingSharedPlan || !recipeId) return;
      const fallbackSection = mealSections[0]?.id || 'mittag';
      if (target.mode === 'cycle') {
        let wasAdded = false;
        const secId = target.sectionId || fallbackSection;
        const updated = cycle.days.map((d) => {
          if (d.dayIndex !== target.dayIndex) return d;
          const slots = buildNormalizedSlots(d.recipeIds, d.slots, mealSections);
          const list = slots[secId] || [];
          const exists = list.includes(recipeId);
          wasAdded = !exists;
          slots[secId] = exists
            ? list.filter((id) => id !== recipeId)
            : [...list, recipeId];
          return {
            ...d,
            slots,
            recipeIds: flattenSlotsToRecipeIds(slots),
            portions: d.portions ?? defaultCyclePortions,
          };
        });
        persistCookbook({ cycle: { ...cycle, days: updated } });
        if (wasAdded) triggerDropFlash(String(target.dayIndex), secId, recipeId);
      } else {
        const dayObj = calendarDays.find((d) => d.date === target.dateIso);
        const existingOv = overrides[target.dateIso];
        const slots = buildNormalizedSlots(
          existingOv ? existingOv.recipeIds : dayObj?.recipeIds,
          existingOv ? existingOv.slots : dayObj?.slots,
          mealSections
        );
        const secId = target.sectionId || fallbackSection;
        const list = slots[secId] || [];
        const exists = list.includes(recipeId);
        slots[secId] = exists
          ? list.filter((id) => id !== recipeId)
          : [...list, recipeId];
        const nextOverrides = {
          ...overrides,
          [target.dateIso]: {
            date: target.dateIso,
            slots,
            recipeIds: flattenSlotsToRecipeIds(slots),
            portions: existingOv?.portions ?? dayObj?.portions ?? defaultCyclePortions,
            isOneTimeChange: true,
            note: 'Kurzfristig angepasst',
          },
        };
        persistCookbook({ overrides: nextOverrides });
        if (!exists) triggerDropFlash(target.dateIso, secId, recipeId);
      }
    },
    [
      isViewingSharedPlan,
      mealSections,
      cycle,
      calendarDays,
      overrides,
      defaultCyclePortions,
      persistCookbook,
      triggerDropFlash,
    ]
  );

  const handleAssignRecipeToDate = useCallback(
    (dateIso: string, recipeId: string, sectionId?: string) => {
      if (isViewingSharedPlan || !recipeId) return;
      const dayObj = calendarDays.find((d) => d.date === dateIso);
      const existingOv = overrides[dateIso];
      const slots = buildNormalizedSlots(
        existingOv ? existingOv.recipeIds : dayObj?.recipeIds,
        existingOv ? existingOv.slots : dayObj?.slots,
        mealSections
      );
      const targetSection = sectionId || mealSections[0]?.id || 'mittag';
      if (!slots[targetSection]) slots[targetSection] = [];
      if (!slots[targetSection].includes(recipeId)) {
        slots[targetSection] = [...slots[targetSection], recipeId];
      }
      const currentPortions = existingOv?.portions ?? dayObj?.portions ?? defaultCyclePortions;

      const nextOverrides = {
        ...overrides,
        [dateIso]: {
          date: dateIso,
          slots,
          recipeIds: flattenSlotsToRecipeIds(slots),
          portions: currentPortions,
          isOneTimeChange: true,
          note: 'Kurzfristig angepasst',
        },
      };
      persistCookbook({ overrides: nextOverrides });
    },
    [isViewingSharedPlan, calendarDays, overrides, mealSections, defaultCyclePortions, persistCookbook]
  );

  const handleAssignRecipeToCycleDay = useCallback(
    (dayIndex: number, recipeId: string, sectionId?: string) => {
      if (isViewingSharedPlan || !recipeId) return;
      const targetSection = sectionId || mealSections[0]?.id || 'mittag';
      const updated = cycle.days.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        const slots = buildNormalizedSlots(d.recipeIds, d.slots, mealSections);
        if (!slots[targetSection]) slots[targetSection] = [];
        if (!slots[targetSection].includes(recipeId)) {
          slots[targetSection] = [...slots[targetSection], recipeId];
        }
        return {
          ...d,
          slots,
          recipeIds: flattenSlotsToRecipeIds(slots),
          portions: d.portions ?? defaultCyclePortions,
        };
      });
      persistCookbook({ cycle: { ...cycle, days: updated } });
    },
    [isViewingSharedPlan, cycle, mealSections, defaultCyclePortions, persistCookbook]
  );

  const handleDropOnDate = (dateIso: string, sectionId?: string) => {
    if (!draggedRecipeId || isViewingSharedPlan) return;
    const sec = sectionId || mealSections[0]?.id || 'mittag';
    handleAssignRecipeToDate(dateIso, draggedRecipeId, sec);
    triggerDropFlash(dateIso, sec, draggedRecipeId);
    setDraggedRecipeId(null);
    setIsLightCatalogRetracted(false);
  };

  const handleDropOnCycleDay = (dayIndex: number, sectionId?: string) => {
    if (!draggedRecipeId || isViewingSharedPlan) return;
    const sec = sectionId || mealSections[0]?.id || 'mittag';
    handleAssignRecipeToCycleDay(dayIndex, draggedRecipeId, sec);
    triggerDropFlash(String(dayIndex), sec, draggedRecipeId);
    setDraggedRecipeId(null);
    setIsLightCatalogRetracted(false);
  };

  const handleUpdateDatePortions = (dateIso: string, nextPortions: number) => {
    if (isViewingSharedPlan) return;
    const clamped = Math.max(1, Math.min(24, nextPortions));
    const dayObj = calendarDays.find((d) => d.date === dateIso);
    const existingOv = overrides[dateIso];
    const slots = buildNormalizedSlots(
      existingOv ? existingOv.recipeIds : dayObj?.recipeIds,
      existingOv ? existingOv.slots : dayObj?.slots,
      mealSections
    );
    const nextOverrides = {
      ...overrides,
      [dateIso]: {
        date: dateIso,
        slots,
        recipeIds: flattenSlotsToRecipeIds(slots),
        portions: clamped,
        isOneTimeChange: existingOv?.isOneTimeChange ?? false,
      },
    };
    persistCookbook({ overrides: nextOverrides });
  };

  const handleUpdateCycleDayPortions = (dayIndex: number, nextPortions: number) => {
    if (isViewingSharedPlan) return;
    const clamped = Math.max(1, Math.min(24, nextPortions));
    const updated = cycle.days.map((d) =>
      d.dayIndex === dayIndex ? { ...d, portions: clamped } : d
    );
    persistCookbook({ cycle: { ...cycle, days: updated } });
  };

  const handleRemoveFromDate = (dateIso: string, recipeId: string, sectionId?: string) => {
    if (isViewingSharedPlan) return;
    const dayObj = calendarDays.find((d) => d.date === dateIso);
    const existingOv = overrides[dateIso];
    const slots = buildNormalizedSlots(
      existingOv ? existingOv.recipeIds : dayObj?.recipeIds,
      existingOv ? existingOv.slots : dayObj?.slots,
      mealSections
    );
    if (sectionId && slots[sectionId]) {
      slots[sectionId] = slots[sectionId].filter((id) => id !== recipeId);
    } else {
      Object.keys(slots).forEach((k) => {
        slots[k] = slots[k].filter((id) => id !== recipeId);
      });
    }
    const nextOverrides = {
      ...overrides,
      [dateIso]: {
        date: dateIso,
        slots,
        recipeIds: flattenSlotsToRecipeIds(slots),
        portions: existingOv?.portions ?? dayObj?.portions ?? defaultCyclePortions,
        isOneTimeChange: true,
      },
    };
    persistCookbook({ overrides: nextOverrides });
  };

  const handleRemoveFromCycleDay = (dayIndex: number, recipeId: string, sectionId?: string) => {
    if (isViewingSharedPlan) return;
    const updated = cycle.days.map((d) => {
      if (d.dayIndex !== dayIndex) return d;
      const slots = buildNormalizedSlots(d.recipeIds, d.slots, mealSections);
      if (sectionId && slots[sectionId]) {
        slots[sectionId] = slots[sectionId].filter((id) => id !== recipeId);
      } else {
        Object.keys(slots).forEach((k) => {
          slots[k] = slots[k].filter((id) => id !== recipeId);
        });
      }
      return {
        ...d,
        slots,
        recipeIds: flattenSlotsToRecipeIds(slots),
      };
    });
    persistCookbook({ cycle: { ...cycle, days: updated } });
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

  // Upload images for an own recipe into Cookbook/Media/<recipeDir>/
  const handleUploadRecipeImages = useCallback(
    async (recipe: Recipe, files: FileList | File[]) => {
      const fileArr = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (fileArr.length === 0) return;
      const isOwn = !recipe.sharedFrom && recipes.some((r) => r.id === recipe.id);
      if (!isOwn) return;

      const mediaDir = getClientMediaDir(recipe);
      setUploadingMedia(true);
      try {
        const addedUrls: string[] = [];
        for (const f of fileArr) {
          const dataUrl = await readFileAsDataUrl(f);
          const item = await api.uploadRecipeMedia(
            currentUser.username,
            mediaDir,
            f.name || 'gericht.jpg',
            dataUrl,
            recipe.id
          );
          if (item?.url) addedUrls.push(item.url);
        }
        if (addedUrls.length > 0) {
          setRecipes((prev) =>
            prev.map((r) =>
              r.id === recipe.id
                ? {
                    ...r,
                    mediaDir,
                    images: Array.from(new Set([...(r.images || []), ...addedUrls])),
                  }
                : r
            )
          );
        }
      } catch (err) {
        console.error('Fehler beim Upload des Rezept-Bildes:', err);
      } finally {
        setUploadingMedia(false);
      }
    },
    [currentUser.username, recipes]
  );

  const handleDeleteRecipeImage = async (recipe: Recipe, imageUrl: string) => {
    const mediaDir = getClientMediaDir(recipe);
    const rawFile = imageUrl.split('/').pop() || '';
    const filename = decodeURIComponent(rawFile.split('?')[0]);
    if (!filename) return;
    try {
      await api.deleteRecipeMedia(currentUser.username, mediaDir, filename, recipe.id);
      setRecipes((prev) =>
        prev.map((r) =>
          r.id === recipe.id
            ? { ...r, images: (r.images || []).filter((u) => u !== imageUrl) }
            : r
        )
      );
    } catch (err) {
      console.error('Fehler beim Löschen des Bildes:', err);
    }
  };

  // Global Pointer / Touch Drag tracking for Light Katalog -> slides Light Katalog to 20% visibility & drops on release!
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const origin = pointerDragOriginRef.current;
      if (!origin || e.pointerId !== origin.pointerId) return;

      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      const dist = Math.hypot(dx, dy);

      if (!origin.active) {
        // Engage drag once moved > 8px horizontally or from grip handle
        if (dist > 8) {
          origin.active = true;
          setDraggedRecipeId(origin.recipe.id);
          if (origin.fromLightCatalog) {
            setIsLightCatalogRetracted(true);
          }
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault();

      // Hit-test Calendar or Cycle target + section underneath pointer
      let hoverDate: string | null = null;
      let hoverCycleDay: number | null = null;
      let hoverSectionId: string | null = null;
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      for (const el of els) {
        const sAttr = el.getAttribute?.('data-drop-section');
        if (sAttr && !hoverSectionId) {
          hoverSectionId = sAttr;
        }
        const dAttr = el.getAttribute?.('data-drop-date');
        if (dAttr && !hoverDate) {
          hoverDate = dAttr;
        }
        const cAttr = el.getAttribute?.('data-drop-cycleday');
        if (cAttr !== null && cAttr !== undefined && cAttr !== '' && hoverCycleDay === null) {
          hoverCycleDay = parseInt(cAttr, 10);
        }
      }

      setPointerDrag({
        recipe: origin.recipe,
        x: e.clientX,
        y: e.clientY,
        hoverDate,
        hoverCycleDay,
        hoverSectionId,
      });
    };

    const handlePointerEnd = (e: PointerEvent) => {
      const origin = pointerDragOriginRef.current;
      if (!origin || e.pointerId !== origin.pointerId) return;

      if (origin.active) {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        let droppedDate: string | null = null;
        let droppedCycleDay: number | null = null;
        let droppedSectionId: string | undefined = undefined;
        for (const el of els) {
          const sAttr = el.getAttribute?.('data-drop-section');
          if (sAttr && !droppedSectionId) {
            droppedSectionId = sAttr;
          }
          const dAttr = el.getAttribute?.('data-drop-date');
          if (dAttr && !droppedDate) {
            droppedDate = dAttr;
          }
          const cAttr = el.getAttribute?.('data-drop-cycleday');
          if (cAttr !== null && cAttr !== undefined && cAttr !== '' && droppedCycleDay === null) {
            droppedCycleDay = parseInt(cAttr, 10);
          }
        }

        if (droppedDate) {
          handleAssignRecipeToDate(droppedDate, origin.recipe.id, droppedSectionId);
        } else if (droppedCycleDay !== null && !Number.isNaN(droppedCycleDay)) {
          handleAssignRecipeToCycleDay(droppedCycleDay, origin.recipe.id, droppedSectionId);
        }
      }

      pointerDragOriginRef.current = null;
      setPointerDrag(null);
      setDraggedRecipeId(null);
      setIsLightCatalogRetracted(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [handleAssignRecipeToDate, handleAssignRecipeToCycleDay]);

  // Mobile/Tablet Pixel-Launcher 1:1 finger-tracked swipe for left Katalog Drawer
  useEffect(() => {
    if (!hasLibrary || (activeTab !== 'calendar' && activeTab !== 'cycle')) return;
    const DRAWER_W = 300;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || pointerDragOriginRef.current?.active) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-grip-drag]') ||
        target?.closest('[data-no-swipe="true"]') ||
        target?.closest('input') ||
        target?.closest('select') ||
        target?.closest('textarea')
      ) {
        catalogSwipeRef.current = null;
        return;
      }
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      if (!isLightCatalogOpen && x > 44) {
        catalogSwipeRef.current = null;
        return;
      }
      if (isLightCatalogOpen && x > DRAWER_W + 40) {
        catalogSwipeRef.current = null;
        return;
      }
      const initialX = isLightCatalogOpen ? 0 : -DRAWER_W;
      catalogSwipeRef.current = {
        startX: x,
        startY: y,
        initialX,
        currentX: initialX,
        lastX: x,
        lastTime: performance.now(),
        isTracking: false,
        lockedAxis: null,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const s = catalogSwipeRef.current;
      if (!s || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - s.startX;
      const dy = y - s.startY;

      if (!s.lockedAxis) {
        if (Math.hypot(dx, dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.1) {
          s.lockedAxis = 'horizontal';
          s.isTracking = true;
        } else {
          s.lockedAxis = 'vertical';
          catalogSwipeRef.current = null;
          return;
        }
      }

      if (s.lockedAxis === 'horizontal') {
        if (e.cancelable) e.preventDefault();
        const nextX = Math.max(-DRAWER_W, Math.min(0, s.initialX + dx));
        s.lastX = x;
        s.lastTime = performance.now();
        s.currentX = nextX;
        setCatalogDragX(nextX);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const s = catalogSwipeRef.current;
      catalogSwipeRef.current = null;
      if (!s || !s.isTracking) {
        setCatalogDragX(null);
        return;
      }
      const endX = e.changedTouches[0]?.clientX ?? s.lastX;
      const dt = Math.max(16, performance.now() - s.lastTime);
      const velocity = (endX - s.lastX) / dt;
      const progress = (s.currentX + DRAWER_W) / DRAWER_W;
      const shouldOpen = velocity > 0.35 || (velocity >= -0.35 && progress > 0.4);
      setCatalogDragX(null);
      setIsLightCatalogOpen(shouldOpen);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [hasLibrary, activeTab, isLightCatalogOpen]);

  // Render reusable Katalog Sidebar Content (used both in Desktop Left Sidebar AND Mobile/Tablet Swipe Katalog Drawer)
  const renderCatalogSidebarContent = (isMobileSwipeDrawer: boolean) => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between pb-2.5 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
          <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
            {isMobileSwipeDrawer ? 'Katalog' : 'Tellergerichte'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setEditingRecipe(null);
              setIsRecipeModalOpen(true);
            }}
            style={{ backgroundColor: accentColor }}
            className="w-6 h-6 rounded-lg text-white flex items-center justify-center shadow-2xs cursor-pointer hover:opacity-90 active:scale-95"
            title="Neues Tellergericht hinzufügen"
            aria-label="Neues Gericht"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {isMobileSwipeDrawer && (
            <button
              type="button"
              onClick={() => setIsLightCatalogOpen(false)}
              className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center cursor-pointer"
              title="Katalog schließen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Search + Category Filter */}
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

      <p className="text-[10px] text-neutral-400 pt-1.5 pb-1">
        {isMobileSwipeDrawer
          ? 'Griff ziehen → Katalog fährt beiseite zum Ablegen'
          : 'Gericht auf Kalender oder Zyklus ziehen · Bild auf Karte droppen'}
      </p>

      <div className="flex-1 overflow-y-auto overscroll-y-contain py-1 pb-16 lg:pb-2 space-y-2 no-scrollbar">
        {filteredRecipes.length === 0 ? (
          <div className="text-center text-[11px] text-neutral-400 py-8">
            Keine passenden Tellergerichte gefunden.
          </div>
        ) : (
          filteredRecipes.map((recipe) => {
            const isOwn = !recipe.sharedFrom && recipes.some((r) => r.id === recipe.id);
            const coverImg = recipe.images?.[0];
            return (
              <div
                key={recipe.id}
                draggable={!isViewingSharedPlan}
                onDragStart={(e) => {
                  setDraggedRecipeId(recipe.id);
                  e.dataTransfer.setData('text/plain', recipe.id);
                  if (isMobileSwipeDrawer) {
                    setTimeout(() => setIsLightCatalogRetracted(true), 20);
                  }
                }}
                onDragEnd={() => {
                  setDraggedRecipeId(null);
                  setIsLightCatalogRetracted(false);
                }}
                onDragOver={(e) => {
                  if (isOwn && e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    setDragOverCardId(recipe.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverCardId === recipe.id) setDragOverCardId(null);
                }}
                onDrop={(e) => {
                  if (isOwn && e.dataTransfer.files?.length) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverCardId(null);
                    handleUploadRecipeImages(recipe, e.dataTransfer.files);
                  }
                }}
                onClick={() => openRecipeOverlay(recipe)}
                style={
                  dragOverCardId === recipe.id
                    ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                    : undefined
                }
                className="p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226] hover:border-neutral-400 shadow-2xs transition-all flex items-center gap-2 group"
              >
                {/* Dedicated touch-none Drag Handle */}
                {!isViewingSharedPlan && (
                  <button
                    type="button"
                    data-grip-drag="true"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      pointerDragOriginRef.current = {
                        recipe,
                        startX: e.clientX,
                        startY: e.clientY,
                        fromLightCatalog: isMobileSwipeDrawer,
                        active: false,
                        pointerId: e.pointerId,
                      };
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 -ml-0.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-grab active:cursor-grabbing touch-none shrink-0"
                    title="Ziehen zum Einplanen"
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>
                )}

                {coverImg && (
                  <img
                    src={coverImg}
                    alt={recipe.title}
                    className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#E5E3DC] dark:border-[#2F3136]"
                  />
                )}

                <div className="min-w-0 flex-1 cursor-pointer">
                  <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                    {recipe.title}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    <span className="font-semibold" style={{ color: accentColor }}>
                      {recipe.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{recipe.prepTimeMinutes} Min</span>
                    {recipe.images && recipe.images.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <ImageIcon className="w-2.5 h-2.5" />
                          {recipe.images.length}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRecipeOverlay(recipe);
                  }}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer shrink-0"
                  title="Rezept & Kochanleitung öffnen"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const selectedIsOwn = useMemo(
    () => !!selectedRecipe && !selectedRecipe.sharedFrom && recipes.some((r) => r.id === selectedRecipe.id),
    [selectedRecipe, recipes]
  );

  return (
    <div className="flex-1 h-full flex flex-col bg-[#FAF9F5] dark:bg-[#161719] text-neutral-900 dark:text-neutral-100 overflow-hidden select-none relative">
      {/* Main Content Area (Zero sub-header bar - Desktop switches in Header, Mobile uses FAB) */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-neutral-400">
          Lade Essensplan-Daten...
        </div>
      ) : !hasLibrary ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
          <div className="max-w-xl mx-auto space-y-5">
            <div className="text-center space-y-1.5 pt-2">
              <div
                style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
              >
                <Utensils className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Dein Essensplan ist noch leer
              </h2>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Erstelle eine eigene Essensplan-Bibliothek (privat oder freigegeben) oder nimm eine bestehende Einladung an.
              </p>
            </div>

            {pendingInvitations.length > 0 && (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  <Mail className="w-4 h-4" style={{ color: accentColor }} />
                  <span>Ausstehende Einladungen ({pendingInvitations.length})</span>
                </div>
                <div className="space-y-2.5">
                  {pendingInvitations.map((inv) => (
                    <div
                      key={inv.libraryId}
                      className="p-3 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                          {inv.name}
                        </span>
                        <span className="text-[11px] text-neutral-500 block">
                          Eingeladen von {inv.ownerDisplayName} · {inv.membersCount} Mitglieder
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={libActionLoading}
                          onClick={async () => {
                            setLibActionLoading(true);
                            setLibActionError(null);
                            try {
                              await api.declineMealLibrary(currentUser.username, inv.libraryId);
                              await loadCookbookData();
                            } catch (err: any) {
                              setLibActionError(err?.message || 'Einladung konnte nicht abgelehnt werden.');
                            } finally {
                              setLibActionLoading(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#363940] bg-white dark:bg-[#1E2024] text-xs font-semibold text-neutral-600 dark:text-neutral-300 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          Ablehnen
                        </button>
                        <button
                          type="button"
                          disabled={libActionLoading}
                          onClick={async () => {
                            setLibActionLoading(true);
                            setLibActionError(null);
                            try {
                              await api.joinMealLibrary(currentUser.username, inv.libraryId);
                              await loadCookbookData();
                            } catch (err: any) {
                              setLibActionError(err?.message || 'Beitritt fehlgeschlagen.');
                            } finally {
                              setLibActionLoading(false);
                            }
                          }}
                          style={{ backgroundColor: accentColor }}
                          className="px-3.5 py-1.5 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer hover:opacity-95"
                        >
                          Beitreten
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLibActionLoading(true);
                setLibActionError(null);
                try {
                  await api.createOrUpdateMealLibrary({
                    username: currentUser.username,
                    name: newLibName.trim() || `Essensplan von ${currentUser.displayName}`,
                    visibility: newLibVisibility,
                    invitedUsers: newLibVisibility === 'shared' ? newLibInvited : [],
                  });
                  await loadCookbookData();
                } catch (err: any) {
                  setLibActionError(err?.message || 'Bibliothek konnte nicht erstellt werden.');
                } finally {
                  setLibActionLoading(false);
                }
              }}
              className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs space-y-4 text-xs"
            >
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Neue Essensplan-Bibliothek erstellen
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Du kannst später in den Einstellungen weitere Personen einladen oder Einstellungen anpassen.
                </p>
              </div>

              <div>
                <label className="font-semibold block mb-1 text-neutral-700 dark:text-neutral-300">
                  Name der Bibliothek
                </label>
                <input
                  type="text"
                  required
                  value={newLibName}
                  onChange={(e) => setNewLibName(e.target.value)}
                  placeholder={`Essensplan von ${currentUser.displayName}`}
                  className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block text-neutral-700 dark:text-neutral-300">
                  Sichtbarkeit
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewLibVisibility('private')}
                    style={
                      newLibVisibility === 'private'
                        ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                        : undefined
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      newLibVisibility === 'private'
                        ? 'border-2'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/70 dark:bg-[#25272C]'
                    }`}
                  >
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accentColor }} />
                    <div>
                      <span className="font-bold block text-neutral-900 dark:text-neutral-100">Privat</span>
                      <span className="text-[10px] text-neutral-500 block">Nur für dich sichtbar</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewLibVisibility('shared')}
                    style={
                      newLibVisibility === 'shared'
                        ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                        : undefined
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      newLibVisibility === 'shared'
                        ? 'border-2'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/70 dark:bg-[#25272C]'
                    }`}
                  >
                    <Globe className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accentColor }} />
                    <div>
                      <span className="font-bold block text-neutral-900 dark:text-neutral-100">Freigegeben</span>
                      <span className="text-[10px] text-neutral-500 block">Gemeinsam planen</span>
                    </div>
                  </button>
                </div>
              </div>

              {newLibVisibility === 'shared' && allUsers.filter((u) => u.username !== currentUser.username).length > 0 && (
                <div className="space-y-1.5">
                  <label className="font-semibold block text-neutral-700 dark:text-neutral-300">
                    Benutzer einladen
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {allUsers
                      .filter((u) => u.username !== currentUser.username)
                      .map((u) => {
                        const isInvited = newLibInvited.includes(u.username);
                        return (
                          <button
                            key={u.username}
                            type="button"
                            onClick={() =>
                              setNewLibInvited((prev) =>
                                isInvited ? prev.filter((x) => x !== u.username) : [...prev, u.username]
                              )
                            }
                            style={
                              isInvited
                                ? { backgroundColor: accentColor, borderColor: accentColor, color: '#fff' }
                                : undefined
                            }
                            className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                              isInvited
                                ? 'shadow-2xs'
                                : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            {isInvited ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            <span>{u.displayName}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {libActionError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px]">
                  {libActionError}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={libActionLoading}
                  style={{ backgroundColor: accentColor }}
                  className="px-5 py-2 rounded-full text-white font-bold shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {libActionLoading ? 'Erstelle...' : 'Bibliothek anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex relative">
          {/* Desktop Left-Side Katalog Sidebar (Matching Notes Vault Sidebar on the LEFT in Calendar & Cycle) */}
          {(activeTab === 'calendar' || activeTab === 'cycle') && (
            <aside className="hidden lg:flex w-72 xl:w-80 shrink-0 h-full bg-white dark:bg-[#1A1C1F] border-r border-[#E5E3DC] dark:border-[#2B2D31] flex-col p-3 overflow-hidden">
              {renderCatalogSidebarContent(false)}
            </aside>
          )}

          {/* Mobile & Tablet Left Pull-Out "Katalog" Handle + 1:1 Pixel-Launcher Swipe Drawer */}
          {(activeTab === 'calendar' || activeTab === 'cycle') && (
            <div className="lg:hidden">
              {/* Left-edge Handle Tab */}
              {!isLightCatalogOpen && catalogDragX === null && (
                <button
                  type="button"
                  onClick={() => setIsLightCatalogOpen(true)}
                  style={{ backgroundColor: accentColor }}
                  className="fixed left-0 top-1/2 -translate-y-1/2 z-30 h-20 w-6 rounded-r-xl text-white shadow-lg flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 opacity-95"
                  title="Katalog reinziehen"
                  aria-label="Katalog öffnen"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <Utensils className="w-3 h-3" />
                </button>
              )}

              {/* Backdrop synced live with finger swipe & retracted drag */}
              {((isLightCatalogOpen && !isLightCatalogRetracted) ||
                (catalogDragX !== null && catalogDragX > -295)) && (
                <div
                  onClick={() => setIsLightCatalogOpen(false)}
                  style={
                    catalogDragX !== null
                      ? {
                          opacity: Math.max(0, Math.min(1, (catalogDragX + 300) / 300)),
                          transition: 'none',
                        }
                      : undefined
                  }
                  className={`fixed inset-0 ${
                    mobileBarPosition === 'bottom' ? 'bottom-[3.75rem]' : 'top-14'
                  } bg-black/30 backdrop-blur-2xs z-30`}
                />
              )}

              {/* Pull-out Katalog Panel: 1:1 finger-tracked swipe + retracts to 20% while dragging a dish */}
              <div
                style={
                  catalogDragX !== null
                    ? {
                        transform: `translateX(${catalogDragX}px)`,
                        transition: 'none',
                      }
                    : undefined
                }
                className={`fixed ${
                  mobileBarPosition === 'bottom' ? 'top-0 bottom-[3.75rem]' : 'top-14 bottom-0'
                } left-0 z-40 w-[300px] bg-white dark:bg-[#1A1C1F] border-r border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xl p-3 flex flex-col ${
                  catalogDragX === null ? 'transition-transform duration-200 ease-out' : ''
                } ${
                  catalogDragX !== null
                    ? ''
                    : !isLightCatalogOpen
                    ? '-translate-x-full pointer-events-none'
                    : isLightCatalogRetracted
                    ? '-translate-x-[80%] pointer-events-none'
                    : 'translate-x-0'
                }`}
              >
                {renderCatalogSidebarContent(true)}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 1: ESSENSKALENDER (Main Calendar Area on Right of Left Katalog) */}
          {/* ======================================================== */}
          {activeTab === 'calendar' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden p-3 md:p-5 pb-20 lg:pb-5">
              {/* Plan Owner Selector + Week Nav */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w - 1)}
                    className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                    title="Vorherige Woche"
                  >
                    <ChevronLeft className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                  </button>
                  {weekOffset === 0 ? (
                    <span
                      style={{ backgroundColor: accentColor }}
                      className="text-xs font-extrabold text-white px-3 py-1 rounded-full shadow-2xs tabular-nums"
                    >
                      Aktuelle Woche · {calendarDays[0]?.dayMonth} – {calendarDays[6]?.dayMonth}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 tabular-nums px-1">
                      {weekOffset > 0 ? `+${weekOffset} Wochen` : `${weekOffset} Wochen`} · {calendarDays[0]?.dayMonth} – {calendarDays[6]?.dayMonth}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w + 1)}
                    className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                    title="Nächste Woche"
                  >
                    <ChevronRight className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                  </button>
                  {weekOffset !== 0 && (
                    <button
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                      className="text-[11px] px-2.5 py-1 rounded-full font-bold cursor-pointer"
                    >
                      Zur aktuellen Woche
                    </button>
                  )}
                </div>

                {/* Plan Switcher if shared plans exist */}
                <div className="flex items-center gap-2 flex-wrap">
                  {mealLibrary && (
                    <span className="text-[11px] font-semibold text-neutral-500 hidden sm:inline">
                      {mealLibrary.name}
                    </span>
                  )}
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
                  {enableCycle && (
                    <span className="text-[11px] text-neutral-500">
                      {displayedCycle.cycleLengthDays}-Tage-Zyklus
                      {isViewingSharedPlan ? ' · Nur Lesen' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* 7-Days Calendar Cards with Configurable Sections & Right-Aligned Mobile Day Labels */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 overflow-y-auto overscroll-y-contain pr-1">
                {calendarDays.map((day) => {
                  const isDayDropHovered = pointerDrag?.hoverDate === day.date;
                  const weekdayColor = weekdayColors[day.isoWeekday] || accentColor;
                  return (
                    <div
                      key={day.date}
                      data-drop-date={day.date}
                      onDragOver={(e) => {
                        if (isViewingSharedPlan) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropOnDate(day.date, mealSections[0]?.id);
                      }}
                      style={
                        isDayDropHovered
                          ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                          : day.isToday
                          ? { borderColor: accentColor, backgroundColor: `${accentColor}0A` }
                          : { borderTopColor: weekdayColor, borderTopWidth: '3px' }
                      }
                      className={`rounded-2xl border p-2.5 flex flex-col transition-all min-h-[210px] ${
                        isDayDropHovered
                          ? 'ring-2 ring-offset-1 shadow-md'
                          : day.isToday
                          ? 'ring-2 shadow-sm'
                          : 'border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024]'
                      }`}
                    >
                      {/* Day Header: On Mobile/Tablet label sits on the RIGHT so open Katalog drawer never covers it */}
                      <div className="flex flex-row-reverse lg:flex-col items-start justify-between gap-1.5 pb-2 border-b border-[#E5E3DC]/70 dark:border-[#2B2D31]">
                        <div className="text-right lg:text-left lg:w-full">
                          <div className="flex items-center justify-end lg:justify-between gap-1.5 flex-wrap">
                            {day.isToday && (
                              <span
                                style={{ backgroundColor: accentColor }}
                                className="text-[10px] font-extrabold text-white px-2 py-0.5 rounded-full shadow-2xs"
                              >
                                Heute
                              </span>
                            )}
                            <span
                              style={{ color: weekdayColor }}
                              className="text-xs font-extrabold tracking-tight flex items-center gap-1"
                            >
                              <span
                                style={{ backgroundColor: weekdayColor }}
                                className="w-2 h-2 rounded-full inline-block shrink-0"
                              />
                              {day.weekday}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums block mt-0.5">
                            {day.dayMonth}
                          </span>
                        </div>

                        <div className="flex flex-col items-start lg:items-stretch lg:w-full gap-1">
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            {day.isOverridden ? (
                              <span
                                title="Einmalige Änderung"
                                style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                              >
                                Einmalig
                              </span>
                            ) : enableCycle ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
                                Zyklus Tag {day.cycleDayIndex + 1}
                              </span>
                            ) : (
                              <span />
                            )}

                            {/* Compact Day Portions Stepper */}
                            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 tabular-nums">
                              {!isViewingSharedPlan && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateDatePortions(day.date, day.portions - 1)}
                                  className="w-4 h-4 rounded bg-[#F4F3EF] dark:bg-[#2A2C31] hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center cursor-pointer"
                                  title="Portionen verringern"
                                >
                                  −
                                </button>
                              )}
                              <span className="px-1" title="Geplante Portionen an diesem Tag">
                                {day.portions}P
                              </span>
                              {!isViewingSharedPlan && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateDatePortions(day.date, day.portions + 1)}
                                  className="w-4 h-4 rounded bg-[#F4F3EF] dark:bg-[#2A2C31] hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center cursor-pointer"
                                  title="Portionen erhöhen"
                                >
                                  +
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Configurable Sections (e.g. Mittag, Abend, ...) */}
                      <div className="flex-1 py-2 space-y-2 overflow-y-auto overscroll-y-contain no-scrollbar">
                        {mealSections.map((sec, secIdx) => {
                          const slotIds = day.slots[sec.id] || [];
                          const isSectionHovered =
                            pointerDrag?.hoverDate === day.date &&
                            (pointerDrag.hoverSectionId
                              ? pointerDrag.hoverSectionId === sec.id
                              : secIdx === 0);
                          const isSlotDropped = recentDropFlash?.slotKey === `${day.date}__${sec.id}`;
                          return (
                            <div
                              key={sec.id}
                              data-drop-date={day.date}
                              data-drop-section={sec.id}
                              onDragOver={(e) => {
                                if (isViewingSharedPlan) return;
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'copy';
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDropOnDate(day.date, sec.id);
                              }}
                              style={
                                isSectionHovered || isSlotDropped
                                  ? { borderColor: accentColor, backgroundColor: `${accentColor}1C` }
                                  : undefined
                              }
                              className={`rounded-xl border p-1.5 space-y-1 transition-all duration-300 ${
                                isSectionHovered || isSlotDropped
                                  ? 'ring-2 shadow-xs'
                                  : 'border-[#E5E3DC]/80 dark:border-[#2B2D31] bg-[#FAF9F5]/80 dark:bg-[#191B1F]/70'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 px-0.5">
                                <span className="text-[10px] font-bold tracking-wide text-neutral-500 dark:text-neutral-400 truncate">
                                  {sec.label}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {isSlotDropped && (
                                    <span
                                      style={{ backgroundColor: accentColor }}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold text-white shadow-xs animate-in fade-in zoom-in-95 duration-200"
                                    >
                                      <Check className="w-2.5 h-2.5" />
                                      <span>Abgelegt</span>
                                    </span>
                                  )}
                                  {!isViewingSharedPlan && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCyclePickerSearch('');
                                        setCyclePickerCategory('all');
                                        setPickerTarget({ mode: 'calendar', dateIso: day.date, sectionId: sec.id });
                                      }}
                                      className="w-4 h-4 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center justify-center cursor-pointer shrink-0"
                                      title={`Gericht zu ${sec.label} hinzufügen`}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {slotIds.length === 0 ? (
                                <div className="border border-dashed border-[#E5E3DC] dark:border-[#2B2D31] rounded-lg px-2 py-1.5 text-center">
                                  <span className="text-[10px] text-neutral-400">
                                    {isViewingSharedPlan ? 'Offen' : 'Ziehen oder +'}
                                  </span>
                                </div>
                              ) : (
                                slotIds.map((rid) => {
                                  const r = getRecipeById(rid);
                                  if (!r) return null;
                                  const isDroppedCard =
                                    recentDropFlash?.targetKey === `${day.date}__${sec.id}__${rid}`;
                                  return (
                                    <div
                                      key={rid}
                                      onClick={() => openRecipeOverlay(r, day.portions)}
                                      style={
                                        isDroppedCard
                                          ? { borderColor: accentColor, backgroundColor: `${accentColor}16` }
                                          : undefined
                                      }
                                      className={`group p-1.5 rounded-lg bg-white dark:bg-[#26282E] border border-[#E5E3DC] dark:border-[#383A40] text-[11px] font-medium flex items-center justify-between hover:border-neutral-400 transition-all duration-300 cursor-pointer gap-1.5 ${
                                        isDroppedCard
                                          ? 'ring-2 scale-[1.03] shadow-md animate-in zoom-in-95 duration-200'
                                          : ''
                                      }`}
                                    >
                                      {r.images?.[0] && (
                                        <img
                                          src={r.images[0]}
                                          alt={r.title}
                                          className="w-5 h-5 rounded-md object-cover shrink-0"
                                        />
                                      )}
                                      <div className="truncate flex-1 pr-0.5">
                                        <span className="block truncate font-semibold text-neutral-800 dark:text-neutral-200">
                                          {r.title}
                                        </span>
                                      </div>
                                      {isDroppedCard && (
                                        <span
                                          style={{ backgroundColor: accentColor }}
                                          className="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0 animate-bounce"
                                        >
                                          <Check className="w-2.5 h-2.5" />
                                        </span>
                                      )}
                                      {!isViewingSharedPlan && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveFromDate(day.date, rid, sec.id);
                                          }}
                                          className="lg:opacity-0 lg:group-hover:opacity-100 p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-red-500 transition-opacity cursor-pointer shrink-0"
                                          title="Aus Abschnitt entfernen"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!isViewingSharedPlan && day.isOverridden && (
                        <button
                          type="button"
                          onClick={() => handleResetDateToCycle(day.date)}
                          style={{ color: accentColor }}
                          className="text-[10px] hover:underline text-center pt-1 block w-full cursor-pointer"
                        >
                          {enableCycle ? '↩ Auf Zyklus zurücksetzen' : '✕ Tag zurücksetzen'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: ZYKLUS BEARBEITEN (With Left Katalog + Drag&Drop + Sections + Right Mobile Labels) */}
          {/* ======================================================== */}
          {activeTab === 'cycle' && (
            <div className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 overflow-y-auto overscroll-y-contain space-y-5">
              <div className="max-w-5xl mx-auto space-y-5">
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
                      Ziehe Gerichte aus dem Katalog links direkt in die Abschnitte der Tage (Standard: {defaultCyclePortions} Port.).
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
                                slots: buildNormalizedSlots([], undefined, mealSections),
                                portions: defaultCyclePortions,
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {displayedCycle.days.map((cd) => {
                    const dayPortions = cd.portions ?? displayedCycle.defaultPortions ?? defaultCyclePortions;
                    const isDayDropHovered = pointerDrag?.hoverCycleDay === cd.dayIndex;
                    const cycleSlots = buildNormalizedSlots(cd.recipeIds, cd.slots, mealSections);
                    return (
                      <div
                        key={cd.dayIndex}
                        data-drop-cycleday={cd.dayIndex}
                        onDragOver={(e) => {
                          if (isViewingSharedPlan) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDropOnCycleDay(cd.dayIndex, mealSections[0]?.id);
                        }}
                        style={
                          isDayDropHovered
                            ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                            : undefined
                        }
                        className={`p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] shadow-2xs flex flex-col min-h-[210px] transition-all ${
                          isDayDropHovered ? 'ring-2 ring-offset-1 shadow-md' : ''
                        }`}
                      >
                        {/* Day Header: On Mobile/Tablet label sits on the RIGHT so open Katalog drawer never covers it */}
                        <div className="flex flex-row-reverse lg:flex-row items-center justify-between gap-2 pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                          <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate text-right lg:text-left">
                            {cd.label || `Tag ${cd.dayIndex + 1}`}
                          </span>

                          {/* Per-Day Target Portions Stepper */}
                          <div className="flex items-center gap-1 shrink-0">
                            {!isViewingSharedPlan ? (
                              <div className="flex items-center gap-0.5 bg-[#F4F3EF] dark:bg-[#25272C] px-1 py-0.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] text-[10px] font-bold tabular-nums">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCycleDayPortions(cd.dayIndex, dayPortions - 1)}
                                  className="w-4 h-4 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center cursor-pointer"
                                  title="Weniger Portionen"
                                >
                                  −
                                </button>
                                <span className="px-1 flex items-center gap-0.5" style={{ color: accentColor }}>
                                  <Users className="w-2.5 h-2.5" />
                                  {dayPortions}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCycleDayPortions(cd.dayIndex, dayPortions + 1)}
                                  className="w-4 h-4 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center cursor-pointer"
                                  title="Mehr Portionen"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-semibold tabular-nums flex items-center gap-0.5" style={{ color: accentColor }}>
                                <Users className="w-3 h-3" />
                                {dayPortions} Port.
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 py-2 space-y-2 overflow-y-auto overscroll-y-contain no-scrollbar">
                          {mealSections.map((sec, secIdx) => {
                            const secIds = cycleSlots[sec.id] || [];
                            const isSecHovered =
                              pointerDrag?.hoverCycleDay === cd.dayIndex &&
                              (pointerDrag.hoverSectionId
                                ? pointerDrag.hoverSectionId === sec.id
                                : secIdx === 0);
                            const isSlotDropped = recentDropFlash?.slotKey === `${cd.dayIndex}__${sec.id}`;
                            return (
                              <div
                                key={sec.id}
                                data-drop-cycleday={cd.dayIndex}
                                data-drop-section={sec.id}
                                onDragOver={(e) => {
                                  if (isViewingSharedPlan) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = 'copy';
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDropOnCycleDay(cd.dayIndex, sec.id);
                                }}
                                style={
                                  isSecHovered || isSlotDropped
                                    ? { borderColor: accentColor, backgroundColor: `${accentColor}1C` }
                                    : undefined
                                }
                                className={`rounded-xl border p-1.5 space-y-1 transition-all duration-300 ${
                                  isSecHovered || isSlotDropped
                                    ? 'ring-2 shadow-xs'
                                    : 'border-[#E5E3DC]/80 dark:border-[#2B2D31] bg-[#FAF9F5]/80 dark:bg-[#191B1F]/70'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 px-0.5">
                                  <span className="text-[10px] font-bold tracking-wide text-neutral-500 dark:text-neutral-400 truncate">
                                    {sec.label}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isSlotDropped && (
                                      <span
                                        style={{ backgroundColor: accentColor }}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold text-white shadow-xs animate-in fade-in zoom-in-95 duration-200"
                                      >
                                        <Check className="w-2.5 h-2.5" />
                                        <span>Abgelegt</span>
                                      </span>
                                    )}
                                    {!isViewingSharedPlan && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCyclePickerSearch('');
                                          setCyclePickerCategory('all');
                                          setPickerTarget({ mode: 'cycle', dayIndex: cd.dayIndex, sectionId: sec.id });
                                        }}
                                        className="w-4 h-4 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center justify-center cursor-pointer shrink-0"
                                        title={`Gericht zu ${sec.label} hinzufügen`}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {secIds.length === 0 ? (
                                  <div className="border border-dashed border-[#E5E3DC] dark:border-[#2B2D31] rounded-lg px-2 py-1.5 text-center">
                                    <span className="text-[10px] text-neutral-400">
                                      {isViewingSharedPlan ? 'Offen' : 'Gericht hierher ziehen'}
                                    </span>
                                  </div>
                                ) : (
                                  secIds.map((rid) => {
                                    const r = getRecipeById(rid);
                                    if (!r) return null;
                                    const isScaled = dayPortions !== r.portions;
                                    const isDroppedCard =
                                      recentDropFlash?.targetKey === `${cd.dayIndex}__${sec.id}__${rid}`;
                                    return (
                                      <div
                                        key={rid}
                                        onClick={() => openRecipeOverlay(r, dayPortions)}
                                        style={
                                          isDroppedCard
                                            ? { borderColor: accentColor, backgroundColor: `${accentColor}16` }
                                            : undefined
                                        }
                                        className={`p-1.5 rounded-lg bg-white dark:bg-[#282A2F] border border-[#E5E3DC]/80 dark:border-[#363940] text-[11px] font-medium flex items-center justify-between gap-1.5 cursor-pointer hover:border-neutral-400 transition-all duration-300 ${
                                          isDroppedCard
                                            ? 'ring-2 scale-[1.03] shadow-md animate-in zoom-in-95 duration-200'
                                            : ''
                                        }`}
                                      >
                                        {r.images?.[0] && (
                                          <img
                                            src={r.images[0]}
                                            alt={r.title}
                                            className="w-6 h-6 rounded-md object-cover shrink-0"
                                          />
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <span className="truncate block font-semibold">{r.title}</span>
                                          <span className="text-[9px] text-neutral-400 tabular-nums">
                                            {dayPortions} Port.{isScaled ? ` (Basis: ${r.portions})` : ''}
                                          </span>
                                        </div>
                                        {isDroppedCard && (
                                          <span
                                            style={{ backgroundColor: accentColor }}
                                            className="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0 animate-bounce"
                                          >
                                            <Check className="w-2.5 h-2.5" />
                                          </span>
                                        )}
                                        {!isViewingSharedPlan && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRemoveFromCycleDay(cd.dayIndex, rid, sec.id);
                                            }}
                                            className="p-0.5 rounded text-neutral-400 hover:text-red-500 cursor-pointer shrink-0"
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
                            );
                          })}
                        </div>

                        {!isViewingSharedPlan && (
                          <div className="pt-2 border-t border-[#E5E3DC]/60 dark:border-[#2B2D31]">
                            {/* Mobile & Tablet: Opens top-anchored Light Katalog Overlay */}
                            <button
                              type="button"
                              onClick={() => {
                                setCyclePickerSearch('');
                                setCyclePickerCategory('all');
                                setPickerTarget({
                                  mode: 'cycle',
                                  dayIndex: cd.dayIndex,
                                  sectionId: mealSections[0]?.id || 'mittag',
                                });
                              }}
                              style={{ borderColor: `${accentColor}44`, color: accentColor }}
                              className="lg:hidden w-full min-h-[40px] px-3 py-1.5 rounded-xl border bg-[#F4F3EF] dark:bg-[#25272C] hover:bg-amber-500/10 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Gericht hinzufügen</span>
                            </button>

                            {/* Desktop: Quick dropdown into first section */}
                            <select
                              onChange={(e) => {
                                if (!e.target.value) return;
                                handleAssignRecipeToCycleDay(
                                  cd.dayIndex,
                                  e.target.value,
                                  mealSections[0]?.id || 'mittag'
                                );
                                e.target.value = '';
                              }}
                              defaultValue=""
                              className="hidden lg:block w-full text-[10px] p-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-700 dark:text-neutral-300 outline-hidden cursor-pointer"
                            >
                              <option value="" disabled>
                                + Gericht hinzufügen ({mealSections[0]?.label || 'Mittag'})...
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
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: KATALOG (Tellergerichte | Zutaten + Duplikatenmanager) */}
          {/* ======================================================== */}
          {activeTab === 'recipes' && (
            <div className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 overflow-y-auto overscroll-y-contain space-y-4">
              <div className="max-w-5xl mx-auto space-y-4">
                {/* Katalog Sub-Switcher: Tellergerichte vs. Zutaten */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setCatalogSubTab('dishes')}
                      style={catalogSubTab === 'dishes' ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        catalogSubTab === 'dishes'
                          ? 'shadow-xs'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Tellergerichte</span>
                      <span className="text-[11px] opacity-80 tabular-nums">({recipes.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCatalogSubTab('ingredients')}
                      style={catalogSubTab === 'ingredients' ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        catalogSubTab === 'ingredients'
                          ? 'shadow-xs'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                      }`}
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>Zutaten</span>
                      <span className="text-[11px] opacity-80 tabular-nums">({collectedIngredients.length})</span>
                      {duplicatePairs.length > 0 && (
                        <span
                          className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full tabular-nums ${
                            catalogSubTab === 'ingredients'
                              ? 'bg-white/25 text-white'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {duplicatePairs.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {catalogSubTab === 'ingredients' && (
                    <span className="text-[11px] text-neutral-500 tabular-nums">
                      {collectedIngredients.filter((i) => !i.excludeFromShoppingList).length} auf Einkaufsliste ·{' '}
                      {collectedIngredients.filter((i) => i.excludeFromShoppingList).length} deaktiviert
                    </span>
                  )}
                </div>

                {catalogSubTab === 'dishes' && (
                  <>
                {/* Filter Toolbar: Search + Source + Food Categories (No bulky header buttons!) */}
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

                    {/* Compact Desktop icon-only quick add inside toolbar (Mobile uses Floating Nav "Neu") */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecipe(null);
                        setIsRecipeModalOpen(true);
                      }}
                      style={{ backgroundColor: accentColor }}
                      className="hidden lg:flex w-8 h-8 rounded-xl text-white items-center justify-center shadow-2xs cursor-pointer hover:opacity-90 active:scale-95 shrink-0"
                      title="Neues Tellergericht hinzufügen"
                      aria-label="Neues Gericht"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
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

                {/* Recipe Cards Grid (Supports Desktop Drag & Drop of Image Files directly onto Cards) */}
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
                      const coverImage = recipe.images?.[0];
                      const isFileDragTarget = dragOverCardId === recipe.id;
                      return (
                        <div
                          key={recipe.id}
                          onClick={() => openRecipeOverlay(recipe)}
                          onDragOver={(e) => {
                            if (isOwn && e.dataTransfer.types.includes('Files')) {
                              e.preventDefault();
                              setDragOverCardId(recipe.id);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverCardId === recipe.id) setDragOverCardId(null);
                          }}
                          onDrop={(e) => {
                            if (isOwn && e.dataTransfer.files?.length) {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverCardId(null);
                              handleUploadRecipeImages(recipe, e.dataTransfer.files);
                            }
                          }}
                          style={
                            isFileDragTarget
                              ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                              : undefined
                          }
                          className="rounded-2xl border border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] hover:border-neutral-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group overflow-hidden"
                        >
                          {coverImage && (
                            <div className="relative h-36 w-full overflow-hidden border-b border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF] dark:bg-[#161719]">
                              <img
                                src={coverImage}
                                alt={recipe.title}
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                              {recipe.images && recipe.images.length > 1 && (
                                <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/65 text-white text-[10px] font-semibold flex items-center gap-1">
                                  <Images className="w-3 h-3" />
                                  {recipe.images.length}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="p-4 flex-1 flex flex-col justify-between">
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
                              {recipe.mealTypes && recipe.mealTypes.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {recipe.mealTypes.map((mt) => (
                                    <span
                                      key={mt}
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-600 dark:text-neutral-300"
                                    >
                                      {mt}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="pt-3 mt-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] flex items-center justify-between text-xs text-neutral-400 gap-2">
                              <span className="tabular-nums truncate">
                                {recipe.ingredients.length} Komponenten · {recipe.portions} Port.
                              </span>
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
                        </div>
                      );
                    })}
                  </div>
                )}
                  </>
                )}

                {/* ======================================================== */}
                {/* SUB-TAB 2: ZUTATEN + EINKAUFSLISTE OPT-OUT + DUPLIKATE-BUTTON */}
                {/* ======================================================== */}
                {catalogSubTab === 'ingredients' && (
                  <div className="space-y-4">
                    {/* Compact Toolbar: Duplikate-Manager + Standalone Zutat anlegen (+) */}
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        >
                          {duplicatePairs.length > 0 ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block">
                            {duplicatePairs.length > 0
                              ? `${duplicatePairs.length} mögliche Zutaten-Duplikate erkannt`
                              : 'Keine offenen Zutaten-Duplikate'}
                          </span>
                          <span className="text-[11px] text-neutral-500 block">
                            Zutaten anlegen oder Einkaufsliste pro Zutat steuern.
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setNewIngredientName('');
                            setNewIngredientUnit(availableUnits[0] || 'Gramm');
                            setNewIngredientExcludeShopping(false);
                            setNewIngredientError(null);
                            setShowAddIngredientModal(true);
                          }}
                          style={{ backgroundColor: accentColor }}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-xs hover:opacity-95 active:scale-95 transition-all"
                          title="Zutat manuell ohne Gericht anlegen"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Zutat</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowDuplicatesModal(true)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-700 dark:text-neutral-200 hover:border-neutral-400"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>Duplikate-Manager</span>
                          {duplicatePairs.length > 0 && (
                            <span
                              style={{ backgroundColor: accentColor }}
                              className="px-1.5 py-0.5 rounded-full text-white text-[10px] font-extrabold tabular-nums"
                            >
                              {duplicatePairs.length}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Ingredients Search & Filter Bar */}
                    <div className="p-3 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={ingredientSearch}
                          onChange={(e) => setIngredientSearch(e.target.value)}
                          placeholder="Zutat oder zugehöriges Gericht suchen..."
                          className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                        />
                      </div>

                      <div className="flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#25272C] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]">
                        {(
                          [
                            { id: 'all' as const, label: 'Alle' },
                            { id: 'active' as const, label: 'Einkaufsliste An' },
                            { id: 'excluded' as const, label: 'Deaktiviert' },
                          ]
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setIngredientFilter(f.id)}
                            style={ingredientFilter === f.id ? { backgroundColor: accentColor } : undefined}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                              ingredientFilter === f.id
                                ? 'text-white'
                                : 'text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Collected Ingredients List with Per-Ingredient Einkaufsliste Switch */}
                    {filteredIngredients.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl border border-dashed border-[#E5E3DC] dark:border-[#2B2D31] text-xs text-neutral-500 space-y-2.5">
                        <p>
                          Keine Zutaten gefunden. Du kannst Zutaten hier direkt anlegen oder aus Tellergerichten übernehmen.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setNewIngredientName('');
                            setNewIngredientUnit(availableUnits[0] || 'Gramm');
                            setNewIngredientExcludeShopping(false);
                            setNewIngredientError(null);
                            setShowAddIngredientModal(true);
                          }}
                          style={{ backgroundColor: accentColor }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white font-semibold cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Erste Zutat anlegen</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] divide-y divide-[#E5E3DC]/70 dark:divide-[#2B2D31] overflow-hidden shadow-2xs">
                        {filteredIngredients.map((ing) => {
                          const isShoppingOn = !ing.excludeFromShoppingList;
                          return (
                            <div
                              key={ing.key}
                              className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#FBFBFA] dark:hover:bg-[#23252A] transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`text-sm font-semibold truncate ${
                                      isShoppingOn
                                        ? 'text-neutral-900 dark:text-neutral-100'
                                        : 'text-neutral-400 line-through'
                                    }`}
                                  >
                                    {ing.displayName}
                                  </span>
                                  {ing.defaultUnit && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-600 dark:text-neutral-300 border border-[#E5E3DC] dark:border-[#2F3136] shrink-0">
                                      {ing.defaultUnit}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-neutral-400 tabular-nums shrink-0">
                                    {ing.recipeCount === 0
                                      ? '0× verwendet · Manuell'
                                      : `${ing.recipeCount}× verwendet`}
                                  </span>
                                </div>
                                <span className="text-[11px] text-neutral-500 block truncate mt-0.5">
                                  {ing.recipeTitles.length > 0
                                    ? `${ing.recipeTitles.join(' · ')}${
                                        ing.sampleAmounts.length > 0
                                          ? ` (${ing.sampleAmounts.slice(0, 3).join(', ')})`
                                          : ''
                                      }`
                                    : 'Bereit zur Auswahl in neuen Tellergerichten'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {ing.recipeCount === 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUnusedIngredient(ing.key)}
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                                    title="Manuelle Zutat entfernen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <span className="text-[11px] font-medium text-neutral-500 hidden sm:inline">
                                  {isShoppingOn ? 'Auf Einkaufsliste' : 'Ohne Einkaufsliste'}
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={isShoppingOn}
                                  onClick={() => handleToggleIngredientShoppingList(ing.key, ing.displayName)}
                                  style={isShoppingOn ? { backgroundColor: accentColor } : undefined}
                                  className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                                    isShoppingOn ? 'justify-end' : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                                  }`}
                                  title={
                                    isShoppingOn
                                      ? `${ing.displayName} von der Einkaufsliste ausschließen`
                                      : `${ing.displayName} wieder auf die Einkaufsliste setzen`
                                  }
                                >
                                  <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: EINKAUFSLISTE (Wochen-Forecast der Verbrauchsgüter) */}
          {/* ======================================================== */}
          {activeTab === 'shopping' && (
            <div className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 overflow-y-auto overscroll-y-contain">
              <div className="max-w-4xl mx-auto space-y-4">
                {/* Week Switcher & Summary Card */}
                <div className="p-4 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4" style={{ color: accentColor }} />
                      <span>Wochen-Einkaufsliste & Verbrauchs-Forecast</span>
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                      {calendarDays[0]?.dayMonth} – {calendarDays[6]?.dayMonth} ·{' '}
                      {shoppingSummary.includedRecipeCount} geplante Gerichte ·{' '}
                      {shoppingSummary.items.length} Komponenten
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setWeekOffset((w) => w - 1)}
                      className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
                      title="Vorherige Woche"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      style={weekOffset === 0 ? { backgroundColor: `${accentColor}1A`, color: accentColor } : undefined}
                      className="px-2.5 py-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] text-xs font-bold tabular-nums cursor-pointer"
                    >
                      {weekOffset === 0 ? 'Diese Woche' : weekOffset > 0 ? `+${weekOffset} W.` : `${weekOffset} W.`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekOffset((w) => w + 1)}
                      className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
                      title="Nächste Woche"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    {Object.values(checkedShoppingKeys).some(Boolean) && (
                      <button
                        type="button"
                        onClick={clearCheckedShoppingItems}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                        title="Häkchen für diese Woche zurücksetzen"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Zurücksetzen</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Notice if ingredients were deactivated in Katalog -> Zutaten */}
                {shoppingSummary.excludedIngredientNames.length > 0 && (
                  <div className="px-4 py-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#222429] border border-[#E5E3DC] dark:border-[#2F3136] text-xs text-neutral-600 dark:text-neutral-300">
                    Deaktivierte Zutaten (Katalog → Zutaten):{' '}
                    <strong className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {shoppingSummary.excludedIngredientNames.join(', ')}
                    </strong>
                  </div>
                )}

                {/* Shopping Forecast List */}
                {shoppingSummary.items.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-[#E5E3DC] dark:border-[#2B2D31] bg-white dark:bg-[#1E2024] space-y-2">
                    <p className="text-xs font-medium text-neutral-500">
                      Für diese Woche stehen noch keine Verbrauchsgüter im Essenskalender.
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      Plane Gerichte mit Komponenten im Essenskalender oder prüfe unter Katalog → Zutaten, ob Zutaten deaktiviert sind.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] divide-y divide-[#E5E3DC]/70 dark:divide-[#2B2D31] overflow-hidden shadow-2xs">
                    {[...shoppingSummary.items]
                      .sort((a, b) => Number(!!checkedShoppingKeys[a.key]) - Number(!!checkedShoppingKeys[b.key]))
                      .map((item) => {
                        const isChecked = !!checkedShoppingKeys[item.key];
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => toggleShoppingItemChecked(item.key)}
                            className={`w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                              isChecked
                                ? 'bg-neutral-50/80 dark:bg-[#191B1E] opacity-55'
                                : 'hover:bg-[#FBFBFA] dark:hover:bg-[#23252A]'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <span
                                style={
                                  isChecked
                                    ? { backgroundColor: accentColor, borderColor: accentColor }
                                    : undefined
                                }
                                className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  isChecked
                                    ? 'text-white'
                                    : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-[#25272C]'
                                }`}
                              >
                                {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <span
                                  className={`text-sm font-semibold block truncate ${
                                    isChecked
                                      ? 'line-through text-neutral-400'
                                      : 'text-neutral-900 dark:text-neutral-100'
                                  }`}
                                >
                                  {item.name}
                                </span>
                                <span className="text-[11px] text-neutral-400 block truncate mt-0.5">
                                  {item.sources
                                    .map((s) => `${s.weekday}: ${s.recipeTitle} (${s.portions}P)`)
                                    .join(' · ')}
                                </span>
                              </div>
                            </div>

                            <span
                              style={!isChecked ? { color: accentColor } : undefined}
                              className={`text-xs sm:text-sm font-bold tabular-nums shrink-0 ${
                                isChecked ? 'line-through text-neutral-400' : ''
                              }`}
                            >
                              {item.totalAmountDisplay}
                            </span>
                          </button>
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
      {/* FULLSCREEN OVERLAY: WOCHENSCHAU / PRÄSENTATIONSMODUS */}
      {/* ======================================================== */}
      {activeTab === 'presentation' && (
        <div className="fixed inset-0 z-[130] bg-gradient-to-br from-[#FFF9F2] via-[#FAF0E1] to-[#F2E0C8] dark:from-[#121110] dark:via-[#1B1815] dark:to-[#241E17] text-neutral-900 dark:text-neutral-100 flex flex-col overflow-hidden animate-in fade-in duration-200">
          {/* Presentation Top Bar */}
          <div className="px-4 md:px-8 py-3.5 border-b border-black/10 dark:border-white/10 bg-white/75 dark:bg-[#181715]/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div
                style={{ backgroundColor: accentColor }}
                className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0"
              >
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                  Wochen-Speiseplan
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums truncate">
                  Montag {calendarDays[0]?.dayMonth} – Sonntag {calendarDays[6]?.dayMonth}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                className="w-9 h-9 rounded-xl bg-white dark:bg-[#252320] border border-black/10 dark:border-white/10 flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
                title="Vorherige Woche"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 1)}
                className="w-9 h-9 rounded-xl bg-white dark:bg-[#252320] border border-black/10 dark:border-white/10 flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
                title="Nächste Woche"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setPresentationAutoPlay((p) => !p)}
                style={presentationAutoPlay ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  presentationAutoPlay
                    ? 'border-transparent shadow-sm'
                    : 'bg-white dark:bg-[#252320] border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-200'
                }`}
              >
                {presentationAutoPlay ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{presentationAutoPlay ? 'Pause' : 'Diashow'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPresentationAutoPlay(false);
                  setActiveTab('calendar');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                title="Präsentationsmodus beenden"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Schließen</span>
              </button>
            </div>
          </div>

          {/* Sticky Weekday Jump Navigation (Mo - So) */}
          <div className="px-4 md:px-8 py-2.5 bg-white/45 dark:bg-black/20 border-b border-black/5 dark:border-white/5 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar shrink-0">
            {calendarDays.map((day, idx) => {
              const isSelected = activePresentationDayIdx === idx;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    setPresentationAutoPlay(false);
                    setActivePresentationDayIdx(idx);
                    presentationDayRefs.current[idx]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  style={
                    isSelected
                      ? { backgroundColor: accentColor, color: '#FFFFFF' }
                      : day.isToday
                      ? { borderColor: accentColor, color: accentColor }
                      : undefined
                  }
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-all cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'border-transparent shadow-sm'
                      : 'bg-white/80 dark:bg-[#252320] border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {day.weekday} · {day.dayMonth}
                  {day.isToday ? ' (Heute)' : ''}
                </button>
              );
            })}
          </div>

          {/* Scrollable Animated Monday -> Sunday Showcase */}
          <div
            ref={presentationScrollRef}
            className="flex-1 overflow-y-auto overscroll-y-contain scroll-smooth snap-y snap-proximity px-4 md:px-8 py-6 space-y-8"
          >
            <div className="max-w-5xl mx-auto space-y-8 pb-12">
              {calendarDays.map((day, idx) => {
                const fullWeekday = day.dateObj.toLocaleDateString('de-DE', { weekday: 'long' });
                const weekdayColor = weekdayColors[day.isoWeekday] || accentColor;

                const renderSlotCard = (
                  slotLabel: string,
                  SlotIcon: React.ComponentType<{ className?: string }>,
                  recipe: Recipe | null,
                  keySuffix: string
                ) => (
                  <div
                    key={keySuffix}
                    onClick={() => recipe && openRecipeOverlay(recipe, day.portions)}
                    className={`group relative rounded-3xl overflow-hidden border border-black/10 dark:border-white/10 shadow-md transition-all duration-300 ${
                      recipe
                        ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl bg-white dark:bg-[#211E1A]'
                        : 'bg-white/55 dark:bg-[#1E1C19]/70 border-dashed'
                    }`}
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden">
                      {recipe?.images?.[0] ? (
                        <>
                          <img
                            src={recipe.images[0]}
                            alt={recipe.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
                        </>
                      ) : recipe ? (
                        <div
                          style={{
                            background: `linear-gradient(135deg, ${accentColor}26 0%, ${accentColor}55 100%)`,
                          }}
                          className="w-full h-full flex flex-col items-center justify-center p-6 text-center relative"
                        >
                          <div
                            style={{ backgroundColor: accentColor }}
                            className="w-16 h-16 rounded-2xl text-white flex items-center justify-center shadow-lg mb-3 group-hover:scale-110 transition-transform duration-300"
                          >
                            <Utensils className="w-8 h-8" />
                          </div>
                          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 opacity-85">
                            {recipe.category}
                          </span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-neutral-400">
                          <SlotIcon className="w-8 h-8 mb-2 opacity-40" />
                          <span className="text-sm font-semibold">Noch offen</span>
                          <span className="text-xs opacity-75">Kein Gericht eingeplant</span>
                        </div>
                      )}

                      {/* Slot Label Tag top-left */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/55 backdrop-blur-xs text-white text-xs font-bold">
                        <SlotIcon className="w-3.5 h-3.5" />
                        <span>{slotLabel}</span>
                      </div>

                      {/* Dish Name & Details overlay at bottom when recipe exists */}
                      {recipe && (
                        <div
                          className={`absolute bottom-0 left-0 right-0 p-4 sm:p-5 ${
                            recipe.images?.[0] ? 'text-white' : 'text-neutral-900 dark:text-white'
                          }`}
                        >
                          <h4 className="text-xl sm:text-2xl font-extrabold leading-tight drop-shadow-xs">
                            {recipe.title}
                          </h4>
                          <p
                            className={`text-xs mt-1 font-medium tabular-nums ${
                              recipe.images?.[0] ? 'text-white/85' : 'text-neutral-600 dark:text-neutral-300'
                            }`}
                          >
                            {recipe.prepTimeMinutes} Min · {day.portions} Portionen
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );

                return (
                  <section
                    key={day.date}
                    ref={(el) => {
                      presentationDayRefs.current[idx] = el as HTMLDivElement | null;
                    }}
                    className="snap-start scroll-mt-4 space-y-3"
                  >
                    <div className="flex items-baseline justify-between gap-2 px-1">
                      <div className="flex items-baseline gap-2.5">
                        <span
                          style={{ backgroundColor: weekdayColor }}
                          className="w-3 h-3 rounded-full inline-block shrink-0 self-center"
                        />
                        <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight capitalize">
                          {fullWeekday}
                        </h3>
                        <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                          {day.dayMonth}
                        </span>
                      </div>
                      {day.isToday && (
                        <span
                          style={{ backgroundColor: accentColor }}
                          className="px-3 py-0.5 rounded-full text-white text-xs font-bold shadow-xs"
                        >
                          Heute
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {mealSections.map((sec) => {
                        const secLabelLower = sec.label.toLowerCase();
                        const SlotIcon =
                          secLabelLower.includes('abend') || secLabelLower.includes('nacht')
                            ? Moon
                            : secLabelLower.includes('mittag') || secLabelLower.includes('früh')
                            ? Sun
                            : Utensils;
                        const slotIds = day.slots[sec.id] || [];
                        const slotRecipes = slotIds
                          .map((rid) => getRecipeById(rid))
                          .filter((r): r is Recipe => !!r);
                        if (slotRecipes.length === 0) {
                          return renderSlotCard(sec.label, SlotIcon, null, `${sec.id}_empty`);
                        }
                        return slotRecipes.map((r, rIdx) =>
                          renderSlotCard(sec.label, SlotIcon, r, `${sec.id}_${r.id}_${rIdx}`)
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Floating Pointer-Drag Pill when dragging a dish out of Katalog */}
      {pointerDrag && (
        <div
          style={{
            left: pointerDrag.x + 12,
            top: pointerDrag.y - 18,
            borderColor: accentColor,
          }}
          className="fixed z-[130] pointer-events-none px-3 py-1.5 rounded-full bg-white dark:bg-[#1E2024] border-2 shadow-2xl flex items-center gap-1.5 text-xs font-bold text-neutral-900 dark:text-neutral-100"
        >
          <Utensils className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
          <span className="max-w-[180px] truncate">{pointerDrag.recipe.title}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* OVERLAY: TOP-ANCHORED LIGHT KATALOG PICKER (Calendar & Cycle Sections) */}
      {/* ======================================================== */}
      {pickerTarget !== null && (
        <div
          onClick={() => setPickerTarget(null)}
          className="fixed inset-0 bg-black/55 z-[115] flex items-start justify-center p-3 pt-14 sm:pt-16 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1E2024] w-full max-w-md max-h-[78dvh] rounded-3xl shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] flex flex-col overflow-hidden animate-in slide-in-from-top-3 duration-150"
          >
            <div className="px-4 py-3 border-b border-[#E5E3DC] dark:border-[#2B2D31] flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                  {pickerTarget.mode === 'cycle'
                    ? `Light Katalog · ${
                        cycle.days.find((d) => d.dayIndex === pickerTarget.dayIndex)?.label ||
                        `Tag ${pickerTarget.dayIndex + 1}`
                      }`
                    : (() => {
                        const dObj = calendarDays.find((d) => d.date === pickerTarget.dateIso);
                        return `Light Katalog · ${dObj ? `${dObj.weekday} ${dObj.dayMonth}` : pickerTarget.dateIso}`;
                      })()}
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Abschnitt wählen & Gericht antippen
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerTarget(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section Tabs + Search & Category Filter */}
            <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2B2D31] space-y-2 shrink-0">
              {mealSections.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {mealSections.map((sec) => {
                    const isSecActive = pickerTarget.sectionId === sec.id;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() =>
                          setPickerTarget((prev) => (prev ? { ...prev, sectionId: sec.id } : null))
                        }
                        style={isSecActive ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                          isSecActive
                            ? 'shadow-2xs'
                            : 'bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {sec.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cyclePickerSearch}
                  onChange={(e) => setCyclePickerSearch(e.target.value)}
                  placeholder="Gericht oder Komponente suchen..."
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  type="button"
                  onClick={() => setCyclePickerCategory('all')}
                  style={cyclePickerCategory === 'all' ? { backgroundColor: accentColor } : undefined}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    cyclePickerCategory === 'all'
                      ? 'text-white'
                      : 'bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  Alle
                </button>
                {allAvailableCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCyclePickerCategory(cat)}
                    style={cyclePickerCategory === cat ? { backgroundColor: accentColor } : undefined}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                      cyclePickerCategory === cat
                        ? 'text-white'
                        : 'bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {(() => {
                let assignedIds: string[] = [];
                if (pickerTarget.mode === 'cycle') {
                  const targetDay = cycle.days.find((d) => d.dayIndex === pickerTarget.dayIndex);
                  const slots = buildNormalizedSlots(targetDay?.recipeIds, targetDay?.slots, mealSections);
                  assignedIds = slots[pickerTarget.sectionId] || [];
                } else {
                  const targetDay = calendarDays.find((d) => d.date === pickerTarget.dateIso);
                  assignedIds = targetDay?.slots?.[pickerTarget.sectionId] || [];
                }
                const q = cyclePickerSearch.toLowerCase().trim();
                const list = allCombinedRecipes.filter((r) => {
                  const matchCat = cyclePickerCategory === 'all' || r.category === cyclePickerCategory;
                  const matchQ =
                    !q ||
                    r.title.toLowerCase().includes(q) ||
                    r.ingredients.some((i) => i.name.toLowerCase().includes(q));
                  return matchCat && matchQ;
                });

                if (list.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-neutral-400">
                      Keine passenden Gerichte gefunden.
                    </div>
                  );
                }

                return list.map((r) => {
                  const isAssigned = assignedIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleToggleRecipeInTarget(pickerTarget, r.id)}
                      style={
                        isAssigned
                          ? { borderColor: accentColor, backgroundColor: `${accentColor}14` }
                          : undefined
                      }
                      className={`w-full min-h-[48px] p-2.5 rounded-2xl border flex items-center justify-between gap-2.5 text-left transition-all cursor-pointer active:scale-[0.98] ${
                        isAssigned
                          ? 'border-2'
                          : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {r.images?.[0] ? (
                          <img
                            src={r.images[0]}
                            alt={r.title}
                            className="w-10 h-10 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-[#F4F3EF] dark:bg-[#2A2C31] flex items-center justify-center shrink-0">
                            <Utensils className="w-4 h-4 text-neutral-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                            {r.title}
                          </span>
                          <span className="text-[11px] text-neutral-500 block truncate">
                            {r.category} · {r.prepTimeMinutes} Min
                          </span>
                        </div>
                      </div>

                      <span
                        style={isAssigned ? { backgroundColor: accentColor } : undefined}
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isAssigned
                            ? 'text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                        }`}
                      >
                        {isAssigned ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </span>
                    </button>
                  );
                });
              })()}
            </div>

            <div className="px-4 py-2.5 border-t border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF] dark:bg-[#1A1C1F] flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setPickerTarget(null)}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-1.5 rounded-full text-white text-xs font-bold cursor-pointer"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL OVERLAY: DUPLIKATE-MANAGER (Zutaten-Bereinigung)   */}
      {/* ======================================================== */}
      {showDuplicatesModal && (
        <div
          onClick={() => setShowDuplicatesModal(false)}
          className="fixed inset-0 bg-black/60 z-[135] flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1E2024] w-full max-w-2xl max-h-[85dvh] rounded-3xl shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
          >
            <div className="px-5 py-3.5 border-b border-[#E5E3DC] dark:border-[#2B2D31] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                >
                  <GitMerge className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                    Duplikate-Manager ({duplicatePairs.length})
                  </h3>
                  <p className="text-[11px] text-neutral-500 truncate">
                    Ähnliche Zutaten vergleichen, Master auswählen oder beide behalten
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {dismissedDuplicates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => persistCookbook({ dismissedDuplicates: [] })}
                    className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="hidden sm:inline">Ignorierte ({dismissedDuplicates.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDuplicatesModal(false)}
                  className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center cursor-pointer"
                  aria-label="Schließen"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {duplicatePairs.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#F4F3EF]/80 dark:bg-[#25272C] text-center space-y-1.5">
                  <CheckCircle2 className="w-7 h-7 mx-auto text-emerald-500" />
                  <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                    Keine offenen Zutaten-Duplikate erkannt
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    Deine Zutatenliste im Katalog ist sauber zusammengeführt.
                  </p>
                </div>
              ) : (
                duplicatePairs.map((pair) => {
                  const selectedSide =
                    duplicateMasterChoices[pair.pairKey] ||
                    (pair.right.recipeCount > pair.left.recipeCount ? 'right' : 'left');
                  const masterItem = selectedSide === 'left' ? pair.left : pair.right;
                  return (
                    <div
                      key={pair.pairKey}
                      className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#191B1F] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold" style={{ color: accentColor }}>
                          {pair.reason}
                        </span>
                        <span className="text-neutral-400">Master anklicken zum Übernehmen</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(
                          [
                            { side: 'left' as const, item: pair.left },
                            { side: 'right' as const, item: pair.right },
                          ]
                        ).map(({ side, item }) => {
                          const isMaster = selectedSide === side;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() =>
                                setDuplicateMasterChoices((prev) => ({
                                  ...prev,
                                  [pair.pairKey]: side,
                                }))
                              }
                              style={
                                isMaster
                                  ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                                  : undefined
                              }
                              className={`p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                                isMaster
                                  ? 'border-2 shadow-2xs'
                                  : 'border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#222429] hover:border-neutral-400'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                                  {item.displayName}
                                </span>
                                <span
                                  style={isMaster ? { backgroundColor: accentColor } : undefined}
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                    isMaster
                                      ? 'text-white'
                                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                                  }`}
                                >
                                  {isMaster ? 'Master' : 'Als Master wählen'}
                                </span>
                              </div>
                              <span className="text-[11px] text-neutral-500 block truncate">
                                In {item.recipeCount} {item.recipeCount === 1 ? 'Gericht' : 'Gerichten'}:{' '}
                                {item.recipeTitles.join(', ')}
                              </span>
                              {item.sampleAmounts.length > 0 && (
                                <span className="text-[10px] text-neutral-400 block truncate">
                                  Mengen: {item.sampleAmounts.join(', ')}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
                        <button
                          type="button"
                          onClick={() => handleKeepBothDuplicates(pair.pairKey)}
                          className="px-3 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#222429] hover:border-neutral-400 text-xs font-semibold text-neutral-700 dark:text-neutral-300 cursor-pointer"
                        >
                          Beide behalten
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMergeDuplicatePair(pair)}
                          style={{ backgroundColor: accentColor }}
                          className="px-3.5 py-1.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs hover:opacity-95 cursor-pointer active:scale-95"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>Zu „{masterItem.displayName}“ mergen</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF] dark:bg-[#1A1C1F] flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowDuplicatesModal(false)}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-1.5 rounded-full text-white text-xs font-bold cursor-pointer"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REZEPT-ANLEITUNG, PORTIONSSKALIERUNG & BILDERKATALOG */}
      {/* ======================================================== */}
      {selectedRecipe && (
        <div
          onClick={() => setSelectedRecipe(null)}
          className="fixed inset-0 bg-black/60 z-[140] flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e) => {
              if (selectedIsOwn && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setIsOverlayFileDragOver(true);
              }
            }}
            onDragLeave={() => setIsOverlayFileDragOver(false)}
            onDrop={(e) => {
              if (selectedIsOwn && e.dataTransfer.files?.length) {
                e.preventDefault();
                e.stopPropagation();
                setIsOverlayFileDragOver(false);
                setShowMediaCatalog(true);
                handleUploadRecipeImages(selectedRecipe, e.dataTransfer.files);
              }
            }}
            style={isOverlayFileDragOver ? { borderColor: accentColor } : undefined}
            className={`bg-white dark:bg-[#1E2024] w-full max-w-2xl max-h-[88vh] rounded-3xl shadow-2xl border-2 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${
              isOverlayFileDragOver
                ? 'ring-4 ring-amber-500/20'
                : 'border-[#E5E3DC] dark:border-[#2B2D31]'
            }`}
          >
            {/* Header with Bilder button directly beside Share2 */}
            <div className="p-4 md:p-5 border-b border-[#E5E3DC] dark:border-[#2B2D31] flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold tracking-wider" style={{ color: accentColor }}>
                  {selectedRecipe.category}
                  {selectedRecipe.sharedFrom ? ` · von ${selectedRecipe.sharedFrom}` : ''}
                </span>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-0.5 leading-snug">
                  {selectedRecipe.title}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 mt-1.5 tabular-nums">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    {selectedRecipe.prepTimeMinutes} Min
                  </span>

                  {/* Interactive Portion Scaler */}
                  <div className="flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#25272C] px-1.5 py-0.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136]">
                    <Users className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    <button
                      type="button"
                      onClick={() => setViewPortions((p) => Math.max(1, p - 1))}
                      className="w-5 h-5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 font-bold flex items-center justify-center cursor-pointer"
                      aria-label="Portionen reduzieren"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold text-neutral-800 dark:text-neutral-100 px-1">
                      {viewPortions} Portionen
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewPortions((p) => Math.min(24, p + 1))}
                      className="w-5 h-5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 font-bold flex items-center justify-center cursor-pointer"
                      aria-label="Portionen erhöhen"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {viewPortions !== selectedRecipe.portions && (
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                    >
                      Skaliert (Basis: {selectedRecipe.portions})
                    </span>
                  )}

                  {selectedRecipe.mealTypes && selectedRecipe.mealTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {selectedRecipe.mealTypes.map((mt) => (
                        <span
                          key={mt}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-700 dark:text-neutral-300 border border-[#E5E3DC] dark:border-[#2F3136]"
                        >
                          {mt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Top-Right Controls: Bilder (neben Teilen), Teilen, Bearbeiten, Schließen */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMediaCatalog((v) => !v)}
                  style={showMediaCatalog ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                    showMediaCatalog
                      ? 'shadow-xs'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                  title="Bilderkatalog, Kamera & Upload öffnen"
                >
                  <Images className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bilder</span>
                  {selectedRecipe.images && selectedRecipe.images.length > 0 && (
                    <span className="text-[10px] opacity-85">({selectedRecipe.images.length})</span>
                  )}
                </button>

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
                {selectedIsOwn && (
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
                  type="button"
                  onClick={() => setSelectedRecipe(null)}
                  className="p-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto space-y-5 text-neutral-800 dark:text-neutral-200">
              {/* Collapsible / Interactive Recipe Bilderkatalog (Media Browser + Mobile Camera + Upload) */}
              {showMediaCatalog && (
                <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/80 dark:bg-[#23252A] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Images className="w-4 h-4" style={{ color: accentColor }} />
                      <span className="text-xs font-bold">Bilderkatalog ({selectedRecipe.images?.length || 0})</span>
                    </div>

                    {selectedIsOwn && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              handleUploadRecipeImages(selectedRecipe, e.target.files);
                              e.target.value = '';
                            }
                          }}
                        />
                        <input
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              handleUploadRecipeImages(selectedRecipe, e.target.files);
                              e.target.value = '';
                            }
                          }}
                        />

                        <button
                          type="button"
                          disabled={uploadingMedia}
                          onClick={() => uploadInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-400 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5" style={{ color: accentColor }} />
                          <span>Bild hochladen</span>
                        </button>

                        <button
                          type="button"
                          disabled={uploadingMedia}
                          onClick={() => cameraInputRef.current?.click()}
                          style={{ backgroundColor: accentColor }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-white text-[11px] font-semibold shadow-2xs cursor-pointer disabled:opacity-50"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Kamera</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {uploadingMedia && (
                    <p className="text-[11px] font-medium" style={{ color: accentColor }}>
                      Speichere Foto im Rezept-Medienordner...
                    </p>
                  )}

                  {!selectedRecipe.images || selectedRecipe.images.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[#E5E3DC] dark:border-[#2F3136] text-center text-[11px] text-neutral-500">
                      Noch keine Fotos vorhanden.{' '}
                      {selectedIsOwn
                        ? 'Auf Desktop einfach ein Bild hierher ziehen oder oben hochladen / Kamera nutzen.'
                        : ''}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {selectedRecipe.images.map((url) => (
                        <div
                          key={url}
                          className="relative group rounded-xl overflow-hidden border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] aspect-4/3"
                        >
                          <img
                            src={url}
                            alt={selectedRecipe.title}
                            onClick={() => setLightboxImageUrl(url)}
                            className="w-full h-full object-cover cursor-pointer"
                          />
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setLightboxImageUrl(url)}
                              className="p-1 rounded-lg bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                              title="Vergrößern"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                            {selectedIsOwn && (
                              <button
                                type="button"
                                onClick={() => handleDeleteRecipeImage(selectedRecipe, url)}
                                className="p-1 rounded-lg bg-red-600/85 text-white hover:bg-red-700 cursor-pointer"
                                title="Bild löschen"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cover Hero Preview when Bilder drawer is closed and images exist */}
              {!showMediaCatalog && selectedRecipe.images && selectedRecipe.images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {selectedRecipe.images.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt={selectedRecipe.title}
                      onClick={() => setLightboxImageUrl(url)}
                      className="h-32 sm:h-40 rounded-2xl object-cover border border-[#E5E3DC] dark:border-[#2F3136] cursor-pointer shrink-0 hover:opacity-95 transition-opacity"
                    />
                  ))}
                </div>
              )}

              {selectedRecipe.description && (
                <p className="text-xs md:text-sm text-neutral-600 dark:text-neutral-300 italic bg-[#F4F3EF] dark:bg-[#25272C] p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136]">
                  "{selectedRecipe.description}"
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-500">
                    Benötigte Komponenten ({viewPortions} {viewPortions === 1 ? 'Portion' : 'Portionen'}):
                  </h4>
                  {viewPortions !== selectedRecipe.portions && (
                    <button
                      type="button"
                      onClick={() => setViewPortions(selectedRecipe.portions)}
                      style={{ color: accentColor }}
                      className="text-[11px] hover:underline font-medium cursor-pointer"
                    >
                      Auf {selectedRecipe.portions} zurücksetzen
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedRecipe.ingredients.map((ing) => {
                    const scaled = getScaledIngredientDisplay(
                      ing,
                      selectedRecipe.portions,
                      viewPortions
                    );
                    return (
                      <div
                        key={ing.id}
                        className="p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#1A1C1F] text-xs flex items-center justify-between gap-2"
                      >
                        <span className="font-medium">{scaled.name}</span>
                        {scaled.amount && (
                          <span className="text-neutral-500 font-semibold shrink-0">{scaled.amount}</span>
                        )}
                      </div>
                    );
                  })}
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

            <div className="p-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF] dark:bg-[#1A1C1F] flex items-center justify-between gap-2">
              <span className="text-[11px] text-neutral-400 hidden sm:inline">
                {selectedIsOwn ? 'Tipp: Bilddatei einfach ins Fenster ziehen' : ''}
              </span>
              <button
                type="button"
                onClick={() => setSelectedRecipe(null)}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-xs cursor-pointer ml-auto"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for Fullscreen Recipe Image */}
      {lightboxImageUrl && (
        <div
          onClick={() => setLightboxImageUrl(null)}
          className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <button
            type="button"
            onClick={() => setLightboxImageUrl(null)}
            className="fixed top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImageUrl}
            alt="Gericht Vorschau"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[88vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: NEUE ZUTAT MANUELL ANLEGEN (KATALOG -> ZUTATEN)   */}
      {/* ======================================================== */}
      {showAddIngredientModal && (
        <div
          onClick={() => setShowAddIngredientModal(false)}
          className="fixed inset-0 bg-black/60 z-[148] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1E2024] w-full max-w-md rounded-3xl p-5 shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <Plus className="w-4 h-4" style={{ color: accentColor }} />
                <span>Neue Zutat anlegen</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddIngredientModal(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStandaloneIngredient} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1">Name der Zutat</label>
                <input
                  type="text"
                  autoFocus
                  value={newIngredientName}
                  onChange={(e) => {
                    setNewIngredientName(e.target.value);
                    setNewIngredientError(null);
                  }}
                  placeholder="z. B. Kokosmilch, Olivenöl, Dinkelmehl..."
                  className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                />
                {newIngredientError && (
                  <p className="text-[11px] text-red-500 mt-1 font-medium">{newIngredientError}</p>
                )}
              </div>

              <div>
                <label className="font-semibold block mb-1">Standard-Einheit (Vorauswahl in Rezepten)</label>
                <select
                  value={newIngredientUnit}
                  onChange={(e) => setNewIngredientUnit(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden cursor-pointer"
                >
                  <option value="">Keine Vorgabe</option>
                  {availableUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF]/80 dark:bg-[#25272C] flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                    Auf Einkaufsliste aufnehmen
                  </span>
                  <span className="text-[11px] text-neutral-500 block">
                    Deaktivieren z. B. für Vorrat wie Salz oder Pfeffer.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!newIngredientExcludeShopping}
                  onClick={() => setNewIngredientExcludeShopping((v) => !v)}
                  style={!newIngredientExcludeShopping ? { backgroundColor: accentColor } : undefined}
                  className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                    !newIngredientExcludeShopping
                      ? 'justify-end'
                      : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddIngredientModal(false)}
                  className="px-3.5 py-2 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-400 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: accentColor }}
                  className="px-4 py-2 rounded-full text-white font-bold shadow-xs cursor-pointer"
                >
                  Zutat speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REZEPT ERSTELLEN / BEARBEITEN (MIT TOP-TABS & SMARTER ZUTATENSUCHE) */}
      {/* ======================================================== */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[145] flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-lg rounded-3xl shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] flex flex-col max-h-[90dvh] overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 pt-4 pb-2.5 border-b border-[#E5E3DC] dark:border-[#2B2D31] flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                {editingRecipe ? (
                  <Edit3 className="w-4 h-4" style={{ color: accentColor }} />
                ) : (
                  <Plus className="w-4 h-4" style={{ color: accentColor }} />
                )}
                <span>{editingRecipe ? 'Tellergericht bearbeiten' : 'Neues Tellergericht hinzufügen'}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsRecipeModalOpen(false);
                  setEditingRecipe(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer p-1"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Clean Top Navigation Tabs */}
            <div className="px-5 py-2.5 bg-[#F7F6F2] dark:bg-[#181A1E] border-b border-[#E5E3DC] dark:border-[#2B2D31] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {[
                { id: 'recipe' as const, label: 'Rezept', badge: formComponents.filter((c) => c.name.trim()).length },
                { id: 'category' as const, label: 'Kategorie & Zeit' },
                { id: 'availability' as const, label: 'Verfügbarkeit', badge: formMealTypes.length },
              ].map((t) => {
                const isActive = recipeFormTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRecipeFormTab(t.id)}
                    style={isActive ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                      isActive
                        ? 'shadow-xs'
                        : 'text-neutral-600 dark:text-neutral-300 bg-white dark:bg-[#23252A] border border-[#E5E3DC] dark:border-[#2F3136]'
                    }`}
                  >
                    <span>{t.label}</span>
                    {typeof t.badge === 'number' && t.badge > 0 && (
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full tabular-nums ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : 'bg-[#F4F3EF] dark:bg-[#2C2E34] text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const titleVal = formTitle.trim();
                if (!titleVal) {
                  setRecipeFormTab('recipe');
                  setFormValidationError('Bitte einen Namen für das Tellergericht eingeben.');
                  return;
                }

                const chosenCat = (formCustomCategory.trim() || formCategory).trim();
                if (chosenCat && !categories.includes(chosenCat)) {
                  persistCookbook({ categories: [...categories, chosenCat] });
                }

                const parsedComponents = bulkComponentsMode
                  ? bulkComponentsText
                      .split('\n')
                      .filter((l: string) => l.trim())
                      .map((l: string, i: number) => {
                        const trimmed = l.trim();
                        const pipeIdx = trimmed.indexOf('|');
                        if (pipeIdx !== -1) {
                          return {
                            id: `comp_${Date.now()}_${i}`,
                            name: trimmed.slice(0, pipeIdx).trim(),
                            amount: trimmed.slice(pipeIdx + 1).trim(),
                          };
                        }
                        return {
                          id: `comp_${Date.now()}_${i}`,
                          name: trimmed,
                          amount: '',
                        };
                      })
                  : formComponents
                      .filter((c) => c.name.trim())
                      .map((c, i) => {
                        const qty = c.amount.trim();
                        const combinedAmount = qty
                          ? [qty, c.unit.trim()].filter(Boolean).join(' ')
                          : '';
                        return {
                          id: c.id || `comp_${Date.now()}_${i}`,
                          name: c.name.trim(),
                          amount: combinedAmount,
                        };
                      });

                const recId = editingRecipe ? editingRecipe.id : `r_${Date.now()}`;
                const newRec: Recipe = {
                  id: recId,
                  title: titleVal,
                  category: chosenCat || 'Mittagessen',
                  prepTimeMinutes: Math.max(1, parseInt(formPrepTime, 10) || 20),
                  portions: Math.max(1, parseInt(formPortions, 10) || 2),
                  description: formDescription.trim(),
                  instructions: formInstructions.split('\n').filter((l: string) => l.trim()),
                  ingredients: parsedComponents,
                  tags: editingRecipe ? editingRecipe.tags : ['selbstgemacht'],
                  images: editingRecipe?.images || [],
                  mediaDir:
                    editingRecipe?.mediaDir ||
                    getClientMediaDir({ ...editingRecipe, id: recId, title: titleVal } as Recipe),
                  mealTypes: formMealTypes,
                };

                const nextRecipes = editingRecipe
                  ? recipes.map((r) => (r.id === editingRecipe.id ? newRec : r))
                  : [...recipes, newRec];
                persistCookbook({ recipes: nextRecipes });
                setIsRecipeModalOpen(false);
                setEditingRecipe(null);
              }}
              className="flex-1 flex flex-col overflow-hidden text-xs"
            >
              <div className="flex-1 overflow-y-auto overscroll-y-contain p-5 space-y-4">
                {formValidationError && (
                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold">
                    {formValidationError}
                  </div>
                )}

                {/* TAB 1: REZEPT (Titel, Smart Zutaten-Auswahl, Komponenten mit Menge + Einheit, Beschreibung, Zubereitung) */}
                {recipeFormTab === 'recipe' && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-semibold block mb-1">Name des Gerichts</label>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => {
                          setFormTitle(e.target.value);
                          if (formValidationError) setFormValidationError(null);
                        }}
                        placeholder="z. B. Ofen-Lachs mit Dillkartoffeln"
                        className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                      />
                    </div>

                    {/* Smart Komponenten & Mengen Editor */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="font-semibold">
                          Komponenten & Mengen (skalierbar auf {formPortions || 2} Port.)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (!bulkComponentsMode) {
                              setBulkComponentsText(
                                formComponents
                                  .filter((c) => c.name.trim())
                                  .map((c) => {
                                    const combined = [c.amount.trim(), c.unit.trim()].filter(Boolean).join(' ');
                                    return combined ? `${c.name} | ${combined}` : c.name;
                                  })
                                  .join('\n')
                              );
                            } else {
                              const rows = bulkComponentsText
                                .split('\n')
                                .filter((l) => l.trim())
                                .map((l, idx) => {
                                  const pIdx = l.indexOf('|');
                                  if (pIdx !== -1) {
                                    const rawAmt = l.slice(pIdx + 1).trim();
                                    const split = splitAmountValueAndUnit(rawAmt, availableUnits);
                                    return {
                                      id: `comp_${Date.now()}_${idx}`,
                                      name: l.slice(0, pIdx).trim(),
                                      amount: split.amount,
                                      unit: split.unit,
                                    };
                                  }
                                  return {
                                    id: `comp_${Date.now()}_${idx}`,
                                    name: l.trim(),
                                    amount: '',
                                    unit: '',
                                  };
                                });
                              setFormComponents(rows);
                            }
                            setBulkComponentsMode((v) => !v);
                          }}
                          style={{ color: accentColor }}
                          className="text-[11px] font-semibold hover:underline cursor-pointer"
                        >
                          {bulkComponentsMode ? 'Einzelzeilen' : 'Als Text einfügen'}
                        </button>
                      </div>

                      {bulkComponentsMode ? (
                        <textarea
                          rows={5}
                          value={bulkComponentsText}
                          onChange={(e) => setBulkComponentsText(e.target.value)}
                          placeholder="Lachsfilet | 200 Gramm&#10;Kartoffeln | 500 Gramm&#10;Sahne | 1 Becher"
                          className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                        />
                      ) : (
                        <div className="space-y-2.5">
                          {/* Fast Existing Ingredient Picker */}
                          <div className="relative">
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={ingredientPickerQuery}
                                onFocus={() => setShowIngredientDropdown(true)}
                                onChange={(e) => {
                                  setIngredientPickerQuery(e.target.value);
                                  setShowIngredientDropdown(true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setShowIngredientDropdown(false);
                                }}
                                placeholder="Bestehende Zutat suchen & hinzufügen (oder neu tippen)..."
                                className="w-full text-xs pl-8 pr-8 py-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                              />
                              {(ingredientPickerQuery || showIngredientDropdown) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIngredientPickerQuery('');
                                    setShowIngredientDropdown(false);
                                  }}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                                  title="Auswahl schließen"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {showIngredientDropdown && (() => {
                              const rawQ = ingredientPickerQuery.trim();
                              const normQ = normalizeIngredientKey(rawQ);
                              const lowerQ = rawQ.toLowerCase();
                              const matchingExisting = collectedIngredients
                                .filter(
                                  (ing) =>
                                    !lowerQ ||
                                    ing.displayName.toLowerCase().includes(lowerQ) ||
                                    ing.key.includes(normQ)
                                )
                                .sort((a, b) => {
                                  const aStarts = lowerQ && a.displayName.toLowerCase().startsWith(lowerQ) ? 0 : 1;
                                  const bStarts = lowerQ && b.displayName.toLowerCase().startsWith(lowerQ) ? 0 : 1;
                                  if (aStarts !== bStarts) return aStarts - bStarts;
                                  return b.recipeCount - a.recipeCount;
                                })
                                .slice(0, 12);

                              const hasExactMatch =
                                normQ.length > 0 &&
                                collectedIngredients.some((ing) => ing.key === normQ);

                              return (
                                <div className="mt-1.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] shadow-lg overflow-hidden max-h-52 overflow-y-auto overscroll-y-contain divide-y divide-[#E5E3DC]/60 dark:divide-[#2F3136]">
                                  {matchingExisting.map((ing) => {
                                    const alreadyInRecipe = formComponents.some(
                                      (fc) => normalizeIngredientKey(fc.name) === ing.key
                                    );
                                    return (
                                      <button
                                        key={ing.key}
                                        type="button"
                                        onClick={() => {
                                          setFormComponents((prev) => [
                                            ...prev,
                                            {
                                              id: `comp_${Date.now()}_${prev.length}`,
                                              name: ing.displayName,
                                              amount: '',
                                              unit: ing.defaultUnit || availableUnits[0] || '',
                                            },
                                          ]);
                                          setIngredientPickerQuery('');
                                          setShowIngredientDropdown(false);
                                        }}
                                        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-[#F4F3EF] dark:hover:bg-[#2B2D33] transition-colors cursor-pointer"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <span className="font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                                            {ing.displayName}
                                          </span>
                                          <span className="text-[10px] text-neutral-400 block truncate">
                                            {ing.recipeCount > 0
                                              ? `${ing.recipeCount}× in Gerichten`
                                              : 'Vorhandene Zutat'}
                                            {ing.defaultUnit ? ` · ${ing.defaultUnit}` : ''}
                                          </span>
                                        </div>
                                        <span
                                          style={
                                            alreadyInRecipe
                                              ? undefined
                                              : { backgroundColor: `${accentColor}1A`, color: accentColor }
                                          }
                                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                            alreadyInRecipe
                                              ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                                              : ''
                                          }`}
                                        >
                                          {alreadyInRecipe ? 'Bereits drin (+)' : '+ Wählen'}
                                        </span>
                                      </button>
                                    );
                                  })}

                                  {rawQ.length > 0 && !hasExactMatch && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newKey = normalizeIngredientKey(rawQ);
                                        const defaultUnit = availableUnits[0] || 'Gramm';
                                        if (newKey && !ingredientMeta[newKey]) {
                                          const nextMeta: Record<string, IngredientMeta> = {
                                            ...ingredientMeta,
                                            [newKey]: {
                                              key: newKey,
                                              displayName: rawQ,
                                              defaultUnit,
                                              excludeFromShoppingList: false,
                                              isCustom: true,
                                            },
                                          };
                                          persistCookbook({ ingredientMeta: nextMeta });
                                        }
                                        setFormComponents((prev) => [
                                          ...prev,
                                          {
                                            id: `comp_${Date.now()}_${prev.length}`,
                                            name: rawQ,
                                            amount: '',
                                            unit: defaultUnit,
                                          },
                                        ]);
                                        setIngredientPickerQuery('');
                                        setShowIngredientDropdown(false);
                                      }}
                                      style={{ color: accentColor }}
                                      className="w-full px-3 py-2.5 flex items-center gap-2 text-left font-bold bg-[#FAF9F5] dark:bg-[#1E2024] hover:bg-amber-500/10 cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">
                                        „{rawQ}“ als neue Zutat anlegen & hinzufügen
                                      </span>
                                    </button>
                                  )}

                                  {matchingExisting.length === 0 && rawQ.length === 0 && (
                                    <div className="px-3 py-2.5 text-[11px] text-neutral-400">
                                      Noch keine Zutaten gespeichert – tippe einen Namen ein, um eine neue Zutat anzulegen.
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Added Component Rows with Quantity + Unit Select */}
                          {formComponents.length === 0 ? (
                            <div className="p-3 rounded-xl border border-dashed border-[#E5E3DC] dark:border-[#2F3136] text-[11px] text-neutral-400 text-center">
                              Wähle oben eine bestehende Zutat oder tippe einen neuen Namen ein.
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {formComponents.map((comp, idx) => (
                                <div key={comp.id} className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={comp.name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormComponents((prev) =>
                                        prev.map((c, i) => (i === idx ? { ...c, name: val } : c))
                                      );
                                    }}
                                    placeholder="Zutat"
                                    className="flex-1 min-w-0 p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden font-medium"
                                  />
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={comp.amount}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormComponents((prev) =>
                                        prev.map((c, i) => (i === idx ? { ...c, amount: val } : c))
                                      );
                                    }}
                                    placeholder="Menge"
                                    className="w-16 sm:w-20 p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden text-right tabular-nums"
                                  />
                                  <select
                                    value={comp.unit}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormComponents((prev) =>
                                        prev.map((c, i) => (i === idx ? { ...c, unit: val } : c))
                                      );
                                    }}
                                    className="w-24 sm:w-28 p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden cursor-pointer shrink-0"
                                    title="Einheit wählen"
                                  >
                                    <option value="">Einheit…</option>
                                    {Array.from(
                                      new Set(
                                        comp.unit && !availableUnits.includes(comp.unit)
                                          ? [comp.unit, ...availableUnits]
                                          : availableUnits
                                      )
                                    ).map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFormComponents((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    className="p-2 rounded-xl text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer shrink-0"
                                    title="Komponente entfernen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">Kurzbeschreibung</label>
                      <input
                        type="text"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Kurze Zusammenfassung..."
                        className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">Zubereitungsschritte (einer pro Zeile)</label>
                      <textarea
                        rows={4}
                        value={formInstructions}
                        onChange={(e) => setFormInstructions(e.target.value)}
                        placeholder="1. Kartoffeln schälen und kochen.&#10;2. Lachs mit Zitronensaft würzen.&#10;3. Im Ofen bei 180°C 15 Minuten garen."
                        className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: KATEGORIE & ZEIT */}
                {recipeFormTab === 'category' && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-semibold block mb-1">Essenskategorie</label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden cursor-pointer"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">Oder neue Kategorie anlegen (optional)</label>
                      <input
                        type="text"
                        value={formCustomCategory}
                        onChange={(e) => setFormCustomCategory(e.target.value)}
                        placeholder="z. B. Sommergerichte, Suppen, Meal-Prep..."
                        className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold block mb-1">Dauer (Min)</label>
                        <input
                          type="number"
                          min={1}
                          value={formPrepTime}
                          onChange={(e) => setFormPrepTime(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="font-semibold block mb-1">Portionen</label>
                        <input
                          type="number"
                          min={1}
                          value={formPortions}
                          onChange={(e) => setFormPortions(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: VERFÜGBARKEIT (Mahlzeiten-Eignung Mehrfachauswahl) */}
                {recipeFormTab === 'availability' && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/80 dark:bg-[#25272C] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-neutral-900 dark:text-neutral-100">
                          Mahlzeiten-Eignung (Mehrfachauswahl)
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          {formMealTypes.length === 0 ? 'Keine festgelegt' : `${formMealTypes.length} gewählt`}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        Wähle aus, zu welchen Tageszeiten oder Abschnitten dieses Gericht passt.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {Array.from(
                          new Set([
                            ...MEAL_TYPE_OPTIONS,
                            ...mealSections.map((s) => s.label),
                          ])
                        ).map((mt) => {
                          const isSelected = formMealTypes.includes(mt);
                          return (
                            <button
                              key={mt}
                              type="button"
                              onClick={() =>
                                setFormMealTypes((prev) =>
                                  isSelected ? prev.filter((x) => x !== mt) : [...prev, mt]
                                )
                              }
                              style={
                                isSelected
                                  ? { backgroundColor: accentColor, borderColor: accentColor, color: '#fff' }
                                  : undefined
                              }
                              className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                                isSelected
                                  ? 'shadow-2xs'
                                  : 'border-[#E5E3DC] dark:border-[#363940] bg-white dark:bg-[#1E2024] text-neutral-700 dark:text-neutral-300'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                              <span>{mt}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F7F6F2] dark:bg-[#181A1E] flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecipeModalOpen(false);
                    setEditingRecipe(null);
                  }}
                  className="px-3.5 py-2 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-400 cursor-pointer font-medium"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: accentColor }}
                  className="px-4 py-2 rounded-full text-white font-bold shadow-xs cursor-pointer hover:opacity-95"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile & Tablet Floating Action Navigation (Kalender, Zyklus, Katalog, Einkaufsliste, Wochenshow, Neu) */}
      {isMobileNavExpanded && activeTab !== 'presentation' && hasLibrary && (
        <div
          onClick={() => setIsMobileNavExpanded(false)}
          className="fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-2xs z-40 lg:hidden animate-in fade-in duration-150"
        />
      )}

      {activeTab !== 'presentation' && hasLibrary && (
        <div className="lg:hidden select-none">
          {isMobileNavExpanded ? (
            <div
              style={{ borderColor: accentColor }}
              className={`fixed ${
                mobileBarPosition === 'bottom' ? 'bottom-[4.75rem]' : 'bottom-5'
              } left-3 right-3 sm:left-auto sm:right-4 sm:min-w-[400px] sm:max-w-[calc(100vw-2rem)] z-50 h-14 px-2 sm:px-3 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-between gap-1 sm:gap-1.5 text-neutral-800 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-200`}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTab('calendar');
                  setIsMobileNavExpanded(false);
                }}
                style={activeTab === 'calendar' ? { backgroundColor: accentColor } : undefined}
                className={`flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  activeTab === 'calendar'
                    ? 'text-white shadow-xs'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                }`}
                title="Essenskalender"
                aria-label="Essenskalender"
              >
                <CalendarIcon className="w-4.5 h-4.5 shrink-0" />
                <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">Kalender</span>
              </button>

              {enableCycle && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('cycle');
                    setIsMobileNavExpanded(false);
                  }}
                  style={activeTab === 'cycle' ? { backgroundColor: accentColor } : undefined}
                  className={`flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                    activeTab === 'cycle'
                      ? 'text-white shadow-xs'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                  }`}
                  title={`Zyklus (${displayedCycle.cycleLengthDays} Tage)`}
                  aria-label="Zyklus"
                >
                  <Repeat className="w-4.5 h-4.5 shrink-0" />
                  <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">Zyklus</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveTab('recipes');
                  setIsMobileNavExpanded(false);
                }}
                style={activeTab === 'recipes' ? { backgroundColor: accentColor } : undefined}
                className={`flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  activeTab === 'recipes'
                    ? 'text-white shadow-xs'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                }`}
                title={`Katalog (${recipes.length} Gerichte / ${collectedIngredients.length} Zutaten)`}
                aria-label="Katalog"
              >
                <BookOpen className="w-4.5 h-4.5 shrink-0" />
                <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">Katalog</span>
              </button>

              {effectiveShoppingEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('shopping');
                    setIsMobileNavExpanded(false);
                  }}
                  style={activeTab === 'shopping' ? { backgroundColor: accentColor } : undefined}
                  className={`flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                    activeTab === 'shopping'
                      ? 'text-white shadow-xs'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                  }`}
                  title="Einkaufsliste (Wochen-Forecast)"
                  aria-label="Einkaufsliste"
                >
                  <ShoppingCart className="w-4.5 h-4.5 shrink-0" />
                  <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">Einkauf</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveTab('presentation');
                  setIsMobileNavExpanded(false);
                }}
                className="flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800"
                title="Wochenshow (Präsentationsmodus)"
                aria-label="Wochenshow"
              >
                <Sparkles className="w-4.5 h-4.5 shrink-0" />
                <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">Show</span>
              </button>

              <div className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5 shrink-0" />

              <button
                type="button"
                onClick={() => {
                  setIsMobileNavExpanded(false);
                  setEditingRecipe(null);
                  setIsRecipeModalOpen(true);
                }}
                style={{ backgroundColor: accentColor }}
                className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-3.5 rounded-full text-xs font-semibold text-white transition-all cursor-pointer active:scale-95 shrink-0 shadow-xs hover:opacity-95"
                title="Neues Tellergericht hinzufügen"
                aria-label="Neu"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Neu</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMobileNavExpanded(false)}
                className="w-9.5 h-9.5 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 shrink-0"
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
              className={`fixed ${
                mobileBarPosition === 'bottom' ? 'bottom-[4.75rem]' : 'bottom-5'
              } right-4 z-40 w-13 h-13 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer`}
              title="Essensplan-Navigation öffnen"
              aria-label="Essensplan-Navigation umschalten"
            >
              {activeTab === 'calendar' && <CalendarIcon className="w-5 h-5" />}
              {activeTab === 'cycle' && <Repeat className="w-5 h-5" />}
              {activeTab === 'recipes' && <BookOpen className="w-5 h-5" />}
              {activeTab === 'shopping' && <ShoppingCart className="w-5 h-5" />}
              <span
                style={{ backgroundColor: accentColor }}
                className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1E1F23]"
              />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
