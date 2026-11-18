import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Upload, 
  Plus, 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Filter, 
  X, 
  Check, 
  AlertCircle,
  Tag,
  Building,
  CreditCard,
  Banknote,
  Search,
  Calendar,
  Users,
  Trash2
} from 'lucide-react';
import { FinanceTransaction, CreditorCategory, CreditorRule, CreditorRecord } from '../../types';

const INITIAL_CATEGORIES: CreditorCategory[] = [
  { id: 'cat_groceries', name: 'Lebensmittel & Haushalt', color: '#C87D20' },
  { id: 'cat_housing', name: 'Wohnen & Fixkosten', color: '#8E6126' },
  { id: 'cat_mobility', name: 'Mobilität & Transport', color: '#B87333' },
  { id: 'cat_leisure', name: 'Freizeit & Restaurant', color: '#C26D2D' },
  { id: 'cat_tech', name: 'Technik & Software', color: '#6D4C2F' },
  { id: 'cat_health', name: 'Gesundheit & Apotheke', color: '#A67C21' },
  { id: 'cat_other', name: 'Sonstiges & Bar', color: '#78716C' },
];

const LEGACY_COLOR_MIGRATION: Record<string, string> = {
  '#10B981': '#C87D20',
  '#3B82F6': '#8E6126',
  '#F59E0B': '#B87333',
  '#EC4899': '#C26D2D',
  '#8B5CF6': '#6D4C2F',
  '#06B6D4': '#A67C21',
  '#6B7280': '#78716C',
};

const INITIAL_RULES: CreditorRule[] = [
  { id: 'r1', matchPattern: 'rewe|edeka|aldi|lidl|kaufland|penny|dm-drogerie|rossmann', creditorName: 'Supermarkt / Drogerie', categoryId: 'cat_groceries' },
  { id: 'r2', matchPattern: 'miete|strom|stadtwerke|telekom|vodafone|rundfunk', creditorName: 'Wohnen / Versorger', categoryId: 'cat_housing' },
  { id: 'r3', matchPattern: 'db vertrieb|bvg|uber|shell|aral|totalenergies', creditorName: 'Mobilität & Tanken', categoryId: 'cat_mobility' },
  { id: 'r4', matchPattern: 'restaurant|lieferando|cafe|bäckerei|cinema|mcdonalds', creditorName: 'Gastronomie & Ausgehen', categoryId: 'cat_leisure' },
  { id: 'r5', matchPattern: 'apple|google|amazon|hetzner|github', creditorName: 'Cloud & Technik', categoryId: 'cat_tech' },
  { id: 'r6', matchPattern: 'apotheke|docmorris|arzt', creditorName: 'Gesundheit', categoryId: 'cat_health' },
];

const INITIAL_TRANSACTIONS: FinanceTransaction[] = [
  { id: 'tx_1', date: '2026-11-08', creditor: 'REWE Markt', categoryId: 'cat_groceries', amount: -48.60, description: 'Wocheneinkauf Frischetheke', type: 'card' },
  { id: 'tx_2', date: '2026-11-07', creditor: 'Aral Tankstelle', categoryId: 'cat_mobility', amount: -65.20, description: 'Super E10 getankt', type: 'card' },
  { id: 'tx_3', date: '2026-11-06', creditor: 'Bäckerei Schmidt', categoryId: 'cat_leisure', amount: -7.50, description: 'Kaffee & Croissant', type: 'cash', isCash: true },
  { id: 'tx_4', date: '2026-11-05', creditor: 'Stadtwerke Strom', categoryId: 'cat_housing', amount: -82.00, description: 'Monatsabschlag Strom', type: 'direct_debit' },
  { id: 'tx_5', date: '2026-11-04', creditor: 'Gehaltseingang', categoryId: 'cat_housing', amount: 2850.00, description: 'Gehalt November', type: 'transfer' },
  { id: 'tx_6', date: '2026-11-03', creditor: 'DM Drogerie', categoryId: 'cat_groceries', amount: -22.40, description: 'Haushaltsbedarf', type: 'card' },
  { id: 'tx_7', date: '2026-11-01', creditor: 'Wochenmarkt Obst', categoryId: 'cat_groceries', amount: -15.00, description: 'Frische Äpfel & Gemüse', type: 'cash', isCash: true },
];

interface FinanceViewProps {
  accentColor?: string;
  mobileBarPosition?: 'top' | 'bottom';
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  accentColor = '#8E6126',
  mobileBarPosition = 'top',
}) => {
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState(false);
  const [mobileFocusSection, setMobileFocusSection] = useState<'overview' | 'transactions'>('overview');
  const overviewRef = React.useRef<HTMLDivElement>(null);
  const transactionsRef = React.useRef<HTMLDivElement>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>(() => {
    const saved = localStorage.getItem('ochre_finance_tx');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  const [categories, setCategories] = useState<CreditorCategory[]>(() => {
    const saved = localStorage.getItem('ochre_finance_cats');
    if (saved) {
      const parsed: CreditorCategory[] = JSON.parse(saved);
      return parsed.map((c) => ({
        ...c,
        color: LEGACY_COLOR_MIGRATION[c.color] || c.color,
      }));
    }
    return INITIAL_CATEGORIES;
  });

  const [rules, setRules] = useState<CreditorRule[]>(() => {
    const saved = localStorage.getItem('ochre_finance_rules');
    return saved ? JSON.parse(saved) : INITIAL_RULES;
  });

  const [creditors, setCreditors] = useState<CreditorRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ochre_finance_creditors');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: 'cred_rewe', name: 'REWE Markt', defaultCategoryId: 'cat_groceries', isCashPreferred: false, createdAt: '2026-11-01T10:00:00Z' },
      { id: 'cred_baeckerei', name: 'Bäckerei Schmidt', defaultCategoryId: 'cat_leisure', isCashPreferred: true, notes: 'Stamm-Bäcker ums Eck', createdAt: '2026-11-01T10:00:00Z' },
      { id: 'cred_wochenmarkt', name: 'Wochenmarkt Obst', defaultCategoryId: 'cat_groceries', isCashPreferred: true, notes: 'Nur Barzahlung', createdAt: '2026-11-01T10:00:00Z' },
    ];
  });

  // Inline Creditor Creation Form state
  const [isCreditorModalOpen, setIsCreditorModalOpen] = useState(false);
  const [newCreditorName, setNewCreditorName] = useState('');
  const [newCreditorCatId, setNewCreditorCatId] = useState('cat_groceries');
  const [newCreditorCashPreferred, setNewCreditorCashPreferred] = useState(true);
  const [newCreditorNotes, setNewCreditorNotes] = useState('');

  // Modal: Quick Cash Transaction (Mobile / Desktop)
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashCreditor, setCashCreditor] = useState('');
  const [cashCategoryId, setCashCategoryId] = useState('cat_groceries');
  const [cashDescription, setCashDescription] = useState('');
  const [saveCashCreditor, setSaveCashCreditor] = useState(true);

  // Modal: CSV Upload Modal
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][]; totalDetected: number } | null>(null);
  const [csvUploadSuccess, setCsvUploadSuccess] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedCreditorFilter, setSelectedCreditorFilter] = useState<string>('all');
  const creditorsRef = React.useRef<HTMLDivElement>(null);

  // Persistence helpers
  const saveTransactions = (data: FinanceTransaction[]) => {
    setTransactions(data);
    localStorage.setItem('ochre_finance_tx', JSON.stringify(data));
  };

  const saveCreditors = (next: CreditorRecord[]) => {
    setCreditors(next);
    try {
      localStorage.setItem('ochre_finance_creditors', JSON.stringify(next));
    } catch {}
  };

  // Automated categorization helper based on rules
  const detectCreditorAndCategory = (rawText: string) => {
    const lower = rawText.toLowerCase();
    for (const rule of rules) {
      const regex = new RegExp(rule.matchPattern, 'i');
      if (regex.test(lower)) {
        return { creditor: rule.creditorName, categoryId: rule.categoryId };
      }
    }
    return { creditor: rawText.slice(0, 30) || 'Unbekannter Empfänger', categoryId: 'cat_other' };
  };

  // CSV File Reader & Parser (Standard German/European Bank CSV format)
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) return;

      // Detect separator (; or , or tab)
      const firstLine = lines[0];
      const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
      
      const rows = lines.map(line => {
        // Simple regex to split by delimiter respecting quotes
        return line.split(sep).map(col => col.replace(/^"|"$/g, '').trim());
      });

      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Try to detect column indices
      let dateIdx = -1;
      let creditorIdx = -1;
      let amountIdx = -1;
      let descIdx = -1;

      headers.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (lower.includes('datum') || lower.includes('valuta') || lower.includes('date') || lower.includes('buchungstag')) dateIdx = idx;
        if (lower.includes('begünstigter') || lower.includes('zahlungsempfänger') || lower.includes('name') || lower.includes('partner') || lower.includes('auftraggeber')) creditorIdx = idx;
        if (lower.includes('betrag') || lower.includes('amount') || lower.includes('umsatz')) amountIdx = idx;
        if (lower.includes('verwendungszweck') || lower.includes('beschreibung') || lower.includes('text')) descIdx = idx;
      });

      // Fallbacks if not auto-detected
      if (dateIdx === -1) dateIdx = 0;
      if (creditorIdx === -1) creditorIdx = Math.min(1, headers.length - 1);
      if (amountIdx === -1) amountIdx = headers.length - 1;

      const detectedTx: FinanceTransaction[] = [];

      dataRows.forEach((cols, i) => {
        if (cols.length < 2) return;
        const rawDate = cols[dateIdx] || new Date().toISOString().split('T')[0];
        // Parse date (DD.MM.YYYY to YYYY-MM-DD or keep YYYY-MM-DD)
        let isoDate = rawDate;
        const dMatch = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (dMatch) {
          isoDate = `${dMatch[3]}-${dMatch[2].padStart(2, '0')}-${dMatch[1].padStart(2, '0')}`;
        }

        const rawCreditor = cols[creditorIdx] || '';
        const rawDesc = descIdx !== -1 ? cols[descIdx] || '' : '';
        const combined = `${rawCreditor} ${rawDesc}`;

        // Parse amount (support German format e.g. -48,50 or standard -48.50)
        let amountStr = (cols[amountIdx] || '0').replace(/\./g, '').replace(',', '.');
        let amountNum = parseFloat(amountStr) || 0;

        const { creditor, categoryId } = detectCreditorAndCategory(combined);

        detectedTx.push({
          id: `csv_${Date.now()}_${i}`,
          date: isoDate,
          creditor: rawCreditor.trim() || creditor,
          categoryId,
          amount: amountNum,
          description: rawDesc || 'Importierte Banktransaktion',
          type: 'card'
        });
      });

      if (detectedTx.length > 0) {
        saveTransactions([...detectedTx, ...transactions]);
        setCsvUploadSuccess(`${detectedTx.length} Transaktionen erfolgreich importiert und automatisch kategorisiert!`);
        setTimeout(() => {
          setCsvUploadSuccess(null);
          setIsCsvModalOpen(false);
        }, 2500);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Add Quick Cash Transaction (with optional inline Creditor creation)
  const handleAddCash = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(cashAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;

    const cleanCreditor = cashCreditor.trim() || 'Barzahlung';
    if (
      saveCashCreditor &&
      cleanCreditor !== 'Barzahlung' &&
      !creditors.some((c) => c.name.toLowerCase() === cleanCreditor.toLowerCase())
    ) {
      const created: CreditorRecord = {
        id: `cred_${Date.now()}`,
        name: cleanCreditor,
        defaultCategoryId: cashCategoryId,
        isCashPreferred: true,
        createdAt: new Date().toISOString(),
      };
      saveCreditors([created, ...creditors]);
    }

    const newTx: FinanceTransaction = {
      id: `cash_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      creditor: cleanCreditor,
      categoryId: cashCategoryId,
      amount: -Math.abs(val),
      description: cashDescription.trim() || 'Schnelle Barzahlung',
      type: 'cash',
      isCash: true
    };

    saveTransactions([newTx, ...transactions]);
    setCashAmount('');
    setCashCreditor('');
    setCashDescription('');
    setIsCashModalOpen(false);
  };

  const handleCreateCreditor = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCreditorName.trim();
    if (!trimmed) return;
    if (creditors.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setIsCreditorModalOpen(false);
      return;
    }
    const created: CreditorRecord = {
      id: `cred_${Date.now()}`,
      name: trimmed,
      defaultCategoryId: newCreditorCatId,
      isCashPreferred: newCreditorCashPreferred,
      notes: newCreditorNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    saveCreditors([created, ...creditors]);
    setNewCreditorName('');
    setNewCreditorNotes('');
    setIsCreditorModalOpen(false);
  };

  const handleDeleteCreditor = (id: string) => {
    saveCreditors(creditors.filter((c) => c.id !== id));
    const removed = creditors.find((c) => c.id === id);
    if (removed && selectedCreditorFilter.toLowerCase() === removed.name.toLowerCase()) {
      setSelectedCreditorFilter('all');
    }
  };

  // Statistics Calculation
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cashSpent = 0;
    const catMap: Record<string, number> = {};

    transactions.forEach(tx => {
      if (tx.amount > 0) {
        income += tx.amount;
      } else {
        const absVal = Math.abs(tx.amount);
        expense += absVal;
        if (tx.isCash) cashSpent += absVal;
        catMap[tx.categoryId] = (catMap[tx.categoryId] || 0) + absVal;
      }
    });

    const categoryBreakdown = categories.map(cat => ({
      ...cat,
      total: catMap[cat.id] || 0,
      percentage: expense > 0 ? Math.round(((catMap[cat.id] || 0) / expense) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    return { income, expense, balance: income - expense, cashSpent, categoryBreakdown };
  }, [transactions, categories]);

  // Per-Creditor Statistics (combines explicit creditors + any creditor appearing in transactions)
  const creditorStats = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        record?: CreditorRecord;
        name: string;
        defaultCategoryId: string;
        spent: number;
        income: number;
        cashSpent: number;
        cardSpent: number;
        txCount: number;
        lastDate: string;
      }
    >();

    creditors.forEach((c) => {
      const key = c.name.trim().toLowerCase();
      map.set(key, {
        key,
        record: c,
        name: c.name,
        defaultCategoryId: c.defaultCategoryId,
        spent: 0,
        income: 0,
        cashSpent: 0,
        cardSpent: 0,
        txCount: 0,
        lastDate: '',
      });
    });

    transactions.forEach((tx) => {
      const name = (tx.creditor || 'Unbekannt').trim();
      const key = name.toLowerCase();
      const existing = map.get(key) || {
        key,
        name,
        defaultCategoryId: tx.categoryId,
        spent: 0,
        income: 0,
        cashSpent: 0,
        cardSpent: 0,
        txCount: 0,
        lastDate: '',
      };
      existing.txCount += 1;
      if (tx.date > existing.lastDate) existing.lastDate = tx.date;
      if (tx.amount >= 0) {
        existing.income += tx.amount;
      } else {
        const abs = Math.abs(tx.amount);
        existing.spent += abs;
        if (tx.isCash || tx.type === 'cash') existing.cashSpent += abs;
        else existing.cardSpent += abs;
      }
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.spent - a.spent || b.txCount - a.txCount);
  }, [creditors, transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.creditor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategoryFilter === 'all' || tx.categoryId === selectedCategoryFilter;
      const matchesCred =
        selectedCreditorFilter === 'all' ||
        tx.creditor.trim().toLowerCase() === selectedCreditorFilter.toLowerCase();
      return matchesSearch && matchesCat && matchesCred;
    });
  }, [transactions, searchQuery, selectedCategoryFilter, selectedCreditorFilter]);

  const getCategory = (catId: string) => categories.find(c => c.id === catId) || categories[categories.length - 1];

  return (
    <div
      style={{ '--finance-accent': accentColor } as React.CSSProperties}
      className="flex-1 h-full flex flex-col bg-[#F9F8F5] dark:bg-[#161719] text-neutral-900 dark:text-neutral-100 overflow-hidden select-none relative"
    >
      {/* Header Bar with Subtle Warm Ochre Theme & Controls */}
      <div className="h-12 border-b border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF]/90 dark:bg-[#1C1E22]/90 backdrop-blur-xs px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--finance-accent)] text-white flex items-center justify-center shadow-xs">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Ochre Finanzen & CSV Analyse
            </h2>
          </div>
        </div>

        {/* Action Buttons: CSV Import & Add Cash */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:border-[var(--finance-accent)] shadow-2xs cursor-pointer active:scale-95 transition-all"
            title="Bank CSV-Datei hochladen"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--finance-accent)]" />
            <span className="hidden sm:inline">Bank-CSV importieren</span>
          </button>

          <button
            onClick={() => setIsCashModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--finance-accent)] text-white text-xs font-semibold hover:opacity-90 shadow-xs cursor-pointer active:scale-95 transition-all"
            title="Schnelle Barzahlung erfassen"
          >
            <Banknote className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Barzahlung erfassen</span>
          </button>
        </div>
      </div>

      {/* Main Finance Canvas */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain p-3 md:p-6 pb-24 lg:pb-6 space-y-5">
        <div ref={overviewRef} className="max-w-6xl mx-auto space-y-5">
          
          {/* Top KPI Cards: Einnahmen, Ausgaben, Saldo, Baranteil */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Balance */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-neutral-400 block">Gesamtsaldo</span>
              <span className={`text-lg md:text-xl font-bold ${stats.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {stats.balance.toFixed(2)} €
              </span>
              <span className="text-[10px] text-neutral-400 block">Differenz Ein- & Ausgaben</span>
            </div>

            {/* Income */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-neutral-400 block flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                <span>Einnahmen</span>
              </span>
              <span className="text-lg md:text-xl font-bold text-emerald-600">
                +{stats.income.toFixed(2)} €
              </span>
              <span className="text-[10px] text-neutral-400 block">Gehalt & Gutschriften</span>
            </div>

            {/* Expense */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-neutral-400 block flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-500" />
                <span>Ausgaben</span>
              </span>
              <span className="text-lg md:text-xl font-bold text-red-500">
                -{stats.expense.toFixed(2)} €
              </span>
              <span className="text-[10px] text-neutral-400 block">Umsätze & Fixkosten</span>
            </div>

            {/* Cash Outflow */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-neutral-400 block flex items-center gap-1">
                <Banknote className="w-3 h-3 text-[var(--finance-accent)]" />
                <span>Bar bezahlt</span>
              </span>
              <span className="text-lg md:text-xl font-bold tabular-nums text-neutral-800 dark:text-neutral-200">
                {stats.cashSpent.toFixed(2)} €
              </span>
              <span className="text-[10px] text-neutral-400 block">Manuell erfasste Barbeträge</span>
            </div>
          </div>

          {/* Section: Category Distribution Statistics ("Wo geht das Geld hin?") */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-[var(--finance-accent)]" />
                <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                  Kategorie-Auswertung & Verteilung (Wohin fließt das Geld?)
                </h3>
              </div>
              <span className="text-[11px] text-neutral-400 font-medium tabular-nums">
                Gesamtausgaben: {stats.expense.toFixed(2)} €
              </span>
            </div>

            {/* Visual Progress Bar Distribution */}
            <div className="h-3 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex shadow-inner">
              {stats.categoryBreakdown.map(cat => (
                cat.percentage > 0 && (
                  <div
                    key={cat.id}
                    style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                    title={`${cat.name}: ${cat.total.toFixed(2)} € (${cat.percentage}%)`}
                    className="h-full transition-all duration-300"
                  />
                )
              ))}
            </div>

            {/* Categories List Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
              {stats.categoryBreakdown.map(cat => (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategoryFilter(selectedCategoryFilter === cat.id ? 'all' : cat.id)}
                  className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                    selectedCategoryFilter === cat.id
                      ? 'border-[var(--finance-accent)] bg-amber-500/10 shadow-xs'
                      : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226] hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></span>
                    <span className="font-semibold truncate text-neutral-800 dark:text-neutral-200">
                      {cat.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <span className="font-bold block">{cat.total.toFixed(0)} €</span>
                    <span className="text-[10px] text-neutral-400">{cat.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Kreditoren & Empfänger-Statistik */}
          <div ref={creditorsRef} className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--finance-accent)]" />
                <div>
                  <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                    Kreditoren &amp; Empfänger-Statistik ({creditorStats.length})
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    Klicke auf einen Kreditor zum Filtern · Auch für Barzahlungen anlegbar
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreditorModalOpen(true)}
                style={{ backgroundColor: accentColor }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-xs font-semibold shadow-xs cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Kreditor anlegen</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {creditorStats.map((item) => {
                const cat = getCategory(item.defaultCategoryId);
                const isSelected = selectedCreditorFilter.toLowerCase() === item.key;
                return (
                  <div
                    key={item.key}
                    onClick={() =>
                      setSelectedCreditorFilter(isSelected ? 'all' : item.name)
                    }
                    className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'border-[var(--finance-accent)] bg-amber-500/10 shadow-xs'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226] hover:border-neutral-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-[var(--finance-accent)] shrink-0" />
                          <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.2 rounded-full font-medium"
                            style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                          >
                            {cat.name}
                          </span>
                          {(item.record?.isCashPreferred || item.cashSpent > 0) && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-[var(--finance-accent)] font-semibold">
                              Bar
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="text-right tabular-nums">
                          <span className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100 block">
                            {item.spent > 0 ? `-${item.spent.toFixed(2)} €` : item.income > 0 ? `+${item.income.toFixed(2)} €` : '0,00 €'}
                          </span>
                          <span className="text-[10px] text-neutral-400">{item.txCount} Buch.</span>
                        </div>
                        {item.record && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCreditor(item.record!.id);
                            }}
                            className="p-1 rounded-full text-neutral-400 hover:text-red-500 cursor-pointer"
                            title="Gespeicherten Kreditor entfernen"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {(item.cashSpent > 0 || item.cardSpent > 0) && (
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-[#E5E3DC]/60 dark:border-[#2F3136] tabular-nums">
                        <span>Karte/Bank: {item.cardSpent.toFixed(2)} €</span>
                        <span>Bar: {item.cashSpent.toFixed(2)} €</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Transactions Table & Search */}
          <div ref={transactionsRef} className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-1 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--finance-accent)]" />
                <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                  Buchungen & Transaktionen ({filteredTransactions.length})
                </h3>
              </div>

              {/* Filters & Search Input */}
              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Empfänger, Zweck..."
                    className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden focus:border-[var(--finance-accent)]"
                  />
                </div>

                {(selectedCategoryFilter !== 'all' || selectedCreditorFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSelectedCategoryFilter('all');
                      setSelectedCreditorFilter('all');
                    }}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold cursor-pointer"
                  >
                    Filter zurücksetzen{selectedCreditorFilter !== 'all' ? ` (${selectedCreditorFilter})` : ''}
                  </button>
                )}
              </div>
            </div>

            {/* Transactions List */}
            <div className="divide-y divide-[#E5E3DC]/60 dark:divide-[#2B2D31]">
              {filteredTransactions.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400 italic">
                  Keine Transaktionen gefunden. Lade eine Bank-CSV hoch oder erfasse eine Barzahlung.
                </div>
              ) : (
                filteredTransactions.map(tx => {
                  const cat = getCategory(tx.categoryId);
                  const isPositive = tx.amount > 0;

                  return (
                    <div
                      key={tx.id}
                      className="py-2.5 flex items-center justify-between gap-2 hover:bg-[#F4F3EF]/50 dark:hover:bg-[#25272C]/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Type Icon */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          tx.isCash 
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-[var(--finance-accent)]' 
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                        }`}>
                          {tx.isCash ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                            {tx.creditor}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" />
                              {tx.date}
                            </span>
                            <span>•</span>
                            <span className="truncate max-w-[200px]">{tx.description}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-xs md:text-sm font-bold tabular-nums ${
                          isPositive ? 'text-emerald-600' : 'text-neutral-900 dark:text-neutral-100'
                        }`}>
                          {isPositive ? '+' : ''}{tx.amount.toFixed(2)} €
                        </span>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span 
                            className="text-[9px] px-1.5 py-0.2 rounded-full font-medium"
                            style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                          >
                            {cat.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MOBILE & TABLET FLOATING THUMB-ZONE NAVIGATION MENU */}
      {/* ======================================================== */}
      {isMobileNavExpanded && (
        <div
          onClick={() => setIsMobileNavExpanded(false)}
          className="fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-2xs z-40 lg:hidden"
        />
      )}

      <div className="lg:hidden select-none">
        {isMobileNavExpanded ? (
          <div
            style={{ borderColor: accentColor }}
            className={`fixed ${
              mobileBarPosition === 'bottom' ? 'bottom-[4.75rem]' : 'bottom-5'
            } left-3 right-3 sm:left-auto sm:right-4 sm:min-w-[340px] sm:max-w-[calc(100vw-2rem)] z-50 h-14 px-2 sm:px-3 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-between gap-1 sm:gap-1.5 text-neutral-800 dark:text-neutral-200`}
          >
            <button
              type="button"
              onClick={() => {
                setMobileFocusSection('overview');
                overviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setIsMobileNavExpanded(false);
              }}
              style={mobileFocusSection === 'overview' ? { backgroundColor: accentColor } : undefined}
              className={`flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                mobileFocusSection === 'overview'
                  ? 'text-white shadow-xs'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
              }`}
              title="Finanzübersicht & KPIs"
              aria-label="Übersicht"
            >
              <PieChart className="w-4.5 h-4.5 shrink-0" />
              <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">Übersicht</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileFocusSection('transactions');
                transactionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setIsMobileNavExpanded(false);
              }}
              style={mobileFocusSection === 'transactions' ? { backgroundColor: accentColor } : undefined}
              className={`flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                mobileFocusSection === 'transactions'
                  ? 'text-white shadow-xs'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
              }`}
              title="Buchungen & Filter"
              aria-label="Buchungen"
            >
              <FileText className="w-4.5 h-4.5 shrink-0" />
              <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">Buchungen</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMobileNavExpanded(false);
                setIsCsvModalOpen(true);
              }}
              className="flex-1 sm:flex-initial h-10 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800"
              title="Bank-CSV importieren"
              aria-label="CSV-Import"
            >
              <Upload className="w-4.5 h-4.5 shrink-0" />
              <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">CSV</span>
            </button>

            <div className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5 shrink-0" />

            <button
              type="button"
              onClick={() => {
                setIsMobileNavExpanded(false);
                setIsCashModalOpen(true);
              }}
              style={{ backgroundColor: accentColor }}
              className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-3.5 rounded-full text-xs font-semibold text-white transition-all cursor-pointer active:scale-95 shrink-0 shadow-xs hover:opacity-95"
              title="Schnelle Barzahlung erfassen"
              aria-label="Barzahlung"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Bar</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMobileNavExpanded(false)}
              className="w-9.5 h-9.5 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 shrink-0"
              aria-label="Finanz-Navigation schließen"
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
            title="Finanzen-Navigation öffnen"
            aria-label="Finanzen-Navigation umschalten"
          >
            {mobileFocusSection === 'transactions' ? (
              <FileText className="w-5 h-5" />
            ) : (
              <BarChart3 className="w-5 h-5" />
            )}
            <span
              style={{ backgroundColor: accentColor }}
              className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1E1F23]"
            />
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: SCHNELLE BARZAHLUNG ERFASSEN */}
      {/* ======================================================== */}
      {isCashModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-[var(--finance-accent)] flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  Barzahlung erfassen
                </h3>
              </div>
              <button onClick={() => setIsCashModalOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCash} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Betrag in Euro (€)</label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="z. B. 12,50"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full text-base font-bold p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden focus:border-[var(--finance-accent)]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Kreditor wählen oder neu eingeben</label>
                {creditors.length > 0 && (
                  <select
                    value={creditors.some((c) => c.name === cashCreditor) ? cashCreditor : ''}
                    onChange={(e) => {
                      const chosenName = e.target.value;
                      setCashCreditor(chosenName);
                      const rec = creditors.find((c) => c.name === chosenName);
                      if (rec) setCashCategoryId(rec.defaultCategoryId);
                    }}
                    className="w-full p-2 mb-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden cursor-pointer"
                  >
                    <option value="">-- Gespeicherten Kreditor wählen --</option>
                    {creditors.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} {c.isCashPreferred ? '(Bar)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="Oder neuen Kreditor tippen (z. B. Wochenmarkt, Kiosk)..."
                  value={cashCreditor}
                  onChange={(e) => setCashCreditor(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden focus:border-[var(--finance-accent)]"
                />
                {cashCreditor.trim() &&
                  !creditors.some((c) => c.name.toLowerCase() === cashCreditor.trim().toLowerCase()) && (
                    <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveCashCreditor}
                        onChange={(e) => setSaveCashCreditor(e.target.checked)}
                        className="rounded accent-[var(--finance-accent)]"
                      />
                      <span>„{cashCreditor.trim()}“ direkt als Kreditor speichern</span>
                    </label>
                  )}
              </div>

              <div>
                <label className="font-semibold block mb-1">Kategorie zuordnen</label>
                <select
                  value={cashCategoryId}
                  onChange={(e) => setCashCategoryId(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Notiz / Verwendungszweck (optional)</label>
                <input
                  type="text"
                  placeholder="z. B. Kaffee und belegtes Brötchen"
                  value={cashDescription}
                  onChange={(e) => setCashDescription(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden focus:border-[var(--finance-accent)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCashModalOpen(false)}
                  className="px-3 py-1.5 rounded-full border text-neutral-600 dark:text-neutral-400"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-full bg-[var(--finance-accent)] text-white font-bold shadow-xs hover:opacity-90"
                >
                  Barausgabe buchen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KREDITOR ANLEGEN (AUCH BARZAHLUNG)               */}
      {/* ======================================================== */}
      {isCreditorModalOpen && (
        <div
          onClick={() => setIsCreditorModalOpen(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1E2024] w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-[var(--finance-accent)] flex items-center justify-center">
                  <Building className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  Kreditor anlegen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreditorModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCreditor} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Name des Kreditors / Empfängers</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="z. B. Wochenmarkt, Hofladen, Baumarkt..."
                  value={newCreditorName}
                  onChange={(e) => setNewCreditorName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden focus:border-[var(--finance-accent)]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Standard-Kategorie</label>
                <select
                  value={newCreditorCatId}
                  onChange={(e) => setNewCreditorCatId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCreditorCashPreferred}
                  onChange={(e) => setNewCreditorCashPreferred(e.target.checked)}
                  className="rounded accent-[var(--finance-accent)]"
                />
                <span>Barzahlung (auch ohne Bank-CSV erfassen)</span>
              </label>

              <div>
                <label className="font-semibold block mb-1">Notiz (optional)</label>
                <input
                  type="text"
                  placeholder="z. B. Jeden Samstag auf dem Marktplatz"
                  value={newCreditorNotes}
                  onChange={(e) => setNewCreditorNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreditorModalOpen(false)}
                  className="px-3 py-1.5 rounded-full border text-neutral-600 dark:text-neutral-400 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-full bg-[var(--finance-accent)] text-white font-bold shadow-xs hover:opacity-90 cursor-pointer"
                >
                  Kreditor speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CSV BANKDATEI HOCHLADEN */}
      {/* ======================================================== */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E2024] w-full max-w-md rounded-3xl p-5 shadow-2xl border border-[#E5E3DC] dark:border-[#2B2D31] space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-[var(--finance-accent)] flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  Bank CSV-Umsätze importieren
                </h3>
              </div>
              <button onClick={() => setIsCsvModalOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-600 dark:text-neutral-300">
              <p>
                Lade den CSV-Kontoauszug deiner Bank (z. B. Sparkasse, DKB, ING, Commerzbank, N26, Volksbank) hoch.
                Transaktionen werden automatisch den passenden Kreditoren und Kategorien zugeteilt.
              </p>

              <label className="border-2 border-dashed border-[var(--finance-accent)] rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-amber-500/5 transition-colors block text-center">
                <Upload className="w-8 h-8 text-[var(--finance-accent)]" />
                <span className="font-bold text-neutral-900 dark:text-neutral-100">
                  CSV-Datei auswählen oder hierher ziehen
                </span>
                <span className="text-[11px] text-neutral-400">
                  Unterstützt Standard-Kontoauszüge im CSV-Format (; oder , getrennt)
                </span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />
              </label>

              {csvUploadSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{csvUploadSuccess}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsCsvModalOpen(false)}
                className="px-4 py-1.5 rounded-full border text-neutral-600 dark:text-neutral-400"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
