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
  Trash2,
  ArrowLeftRight,
  Scale,
  SlidersHorizontal,
  RotateCcw,
  Wallet
} from 'lucide-react';
import { FinanceTransaction, CreditorCategory, CreditorRule, CreditorRecord } from '../../types';
import { FINANCE_UNASSIGNED_CATEGORY_ID } from '../../services/profileDefaults';

const INITIAL_CATEGORIES: CreditorCategory[] = [
  { id: 'cat_groceries', name: 'Lebensmittel & Haushalt', color: '#C87D20' },
  { id: 'cat_housing', name: 'Wohnen & Fixkosten', color: '#8E6126' },
  { id: 'cat_mobility', name: 'Mobilität & Transport', color: '#B87333' },
  { id: 'cat_leisure', name: 'Freizeit & Restaurant', color: '#C26D2D' },
  { id: 'cat_tech', name: 'Technik & Software', color: '#6D4C2F' },
  { id: 'cat_health', name: 'Gesundheit & Apotheke', color: '#A67C21' },
  { id: 'cat_other', name: 'Sonstiges & Bar', color: '#78716C' },
  { id: FINANCE_UNASSIGNED_CATEGORY_ID, name: 'Nicht zuzuordnen / Füllfinanz', color: '#A8A29E' },
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

type FinanceSubView = 'overview' | 'transactions' | 'creditors' | 'import_balance';

interface CsvDraftState {
  fileName: string;
  headers: string[];
  rows: string[][];
  dateCol: number;
  creditorCol: number;
  amountCol: number;
  descCol: number;
}

function splitCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result.map((col) => col.replace(/^"|"$/g, '').trim());
}

function parseCsvDateToIso(rawDate: string): string {
  const trimmed = (rawDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const dMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (dMatch) {
    const year = dMatch[3].length === 2 ? `20${dMatch[3]}` : dMatch[3];
    return `${year}-${dMatch[2].padStart(2, '0')}-${dMatch[1].padStart(2, '0')}`;
  }
  return new Date().toISOString().split('T')[0];
}

function parseLocalizedAmount(raw: string): number {
  const cleaned = (raw || '0').replace(/[^\d,.\-+]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Determine whether comma or dot is decimal separator
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  return parseFloat(cleaned) || 0;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  accentColor = '#8E6126',
  mobileBarPosition = 'top',
}) => {
  const [activeTab, setActiveTab] = useState<FinanceSubView>('overview');
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState(false);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('ochre_finance_tx');
      return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
    } catch {
      return INITIAL_TRANSACTIONS;
    }
  });

  const [categories, setCategories] = useState<CreditorCategory[]>(() => {
    try {
      const saved = localStorage.getItem('ochre_finance_cats');
      if (saved) {
        const parsed: CreditorCategory[] = JSON.parse(saved);
        const migrated = parsed.map((c) => ({
          ...c,
          color: LEGACY_COLOR_MIGRATION[c.color] || c.color,
        }));
        if (!migrated.some((c) => c.id === FINANCE_UNASSIGNED_CATEGORY_ID)) {
          migrated.push({
            id: FINANCE_UNASSIGNED_CATEGORY_ID,
            name: 'Nicht zuzuordnen / Füllfinanz',
            color: '#A8A29E',
          });
        }
        return migrated;
      }
    } catch {}
    return INITIAL_CATEGORIES;
  });

  const [rules] = useState<CreditorRule[]>(() => {
    try {
      const saved = localStorage.getItem('ochre_finance_rules');
      return saved ? JSON.parse(saved) : INITIAL_RULES;
    } catch {
      return INITIAL_RULES;
    }
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
  const [creditorSearch, setCreditorSearch] = useState('');

  // Modal: Quick Cash Transaction (Mobile / Desktop)
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashCreditor, setCashCreditor] = useState('');
  const [cashCategoryId, setCashCategoryId] = useState('cat_groceries');
  const [cashDescription, setCashDescription] = useState('');
  const [saveCashCreditor, setSaveCashCreditor] = useState(true);

  // CSV Column-Mapping & Duplicate Preview state
  const [csvDraft, setCsvDraft] = useState<CsvDraftState | null>(null);
  const [csvImportResult, setCsvImportResult] = useState<{
    importedCount: number;
    skippedDuplicates: number;
    dateSpan: string;
  } | null>(null);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [skipDuplicatesOnImport, setSkipDuplicatesOnImport] = useState(true);

  // Kontostand-Abgleich & Füllfinanz state
  const [balanceDate, setBalanceDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [targetBalanceInput, setTargetBalanceInput] = useState<string>('');
  const [balanceCategoryId, setBalanceCategoryId] = useState<string>(FINANCE_UNASSIGNED_CATEGORY_ID);
  const [balanceDescription, setBalanceDescription] = useState<string>('Füllfinanz / Kontostand-Abgleich');
  const [balanceSuccessMsg, setBalanceSuccessMsg] = useState<string | null>(null);

  // Search & Multi-Filter (Transactions)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedCreditorFilter, setSelectedCreditorFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'card' | 'transfer' | 'cash' | 'direct_debit'>('all');
  const [selectedDirectionFilter, setSelectedDirectionFilter] = useState<'all' | 'income' | 'expense'>('all');

  // Persistence helpers
  const saveTransactions = (data: FinanceTransaction[]) => {
    setTransactions(data);
    try {
      localStorage.setItem('ochre_finance_tx', JSON.stringify(data));
    } catch {}
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
    return { creditor: rawText.slice(0, 36) || 'Unbekannter Empfänger', categoryId: 'cat_other' };
  };

  // CSV File Reader -> Step 1: Parse & Column-Mapping Draft
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvParseError(null);
    setCsvImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setCsvParseError('Die CSV-Datei enthält zu wenige Zeilen (mindestens Kopfzeile + 1 Buchung).');
        return;
      }

      const firstLine = lines[0];
      const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
      const parsedRows = lines.map((line) => splitCsvLine(line, sep));
      const headers = parsedRows[0];
      const dataRows = parsedRows.slice(1).filter((r) => r.some((cell) => cell.trim().length > 0));

      let dateIdx = -1;
      let creditorIdx = -1;
      let amountIdx = -1;
      let descIdx = -1;

      headers.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (dateIdx === -1 && (lower.includes('datum') || lower.includes('valuta') || lower.includes('date') || lower.includes('buchungstag'))) dateIdx = idx;
        if (creditorIdx === -1 && (lower.includes('begünstigter') || lower.includes('zahlungsempfänger') || lower.includes('empfänger') || lower.includes('name') || lower.includes('partner') || lower.includes('auftraggeber'))) creditorIdx = idx;
        if (amountIdx === -1 && (lower.includes('betrag') || lower.includes('amount') || lower.includes('umsatz'))) amountIdx = idx;
        if (descIdx === -1 && (lower.includes('verwendungszweck') || lower.includes('beschreibung') || lower.includes('buchungstext') || lower.includes('text'))) descIdx = idx;
      });

      if (dateIdx === -1) dateIdx = 0;
      if (creditorIdx === -1) creditorIdx = Math.min(1, headers.length - 1);
      if (amountIdx === -1) amountIdx = headers.length - 1;

      setCsvDraft({
        fileName: file.name,
        headers,
        rows: dataRows,
        dateCol: dateIdx,
        creditorCol: creditorIdx,
        amountCol: amountIdx,
        descCol: descIdx,
      });
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  // Preview parsed CSV rows with duplicate detection
  const csvMappedPreview = useMemo(() => {
    if (!csvDraft) return [];
    const existingKeys = new Set(
      transactions.map((tx) => {
        const normCred = tx.creditor.trim().toLowerCase();
        const normDesc = tx.description.trim().toLowerCase();
        return `${tx.date}__${tx.amount.toFixed(2)}__${normCred}__${normDesc}`;
      })
    );
    const existingLooseKeys = new Set(
      transactions.map((tx) => `${tx.date}__${tx.amount.toFixed(2)}__${tx.creditor.trim().toLowerCase()}`)
    );

    return csvDraft.rows.map((cols, index) => {
      const isoDate = parseCsvDateToIso(cols[csvDraft.dateCol] || '');
      const rawCreditor = (cols[csvDraft.creditorCol] || '').trim();
      const rawDesc = csvDraft.descCol >= 0 ? (cols[csvDraft.descCol] || '').trim() : '';
      const amountNum = parseLocalizedAmount(cols[csvDraft.amountCol] || '0');
      const detected = detectCreditorAndCategory(`${rawCreditor} ${rawDesc}`);
      const finalCreditor = rawCreditor || detected.creditor;
      const finalDesc = rawDesc || 'Importierte Banktransaktion';
      const exactKey = `${isoDate}__${amountNum.toFixed(2)}__${finalCreditor.toLowerCase()}__${finalDesc.toLowerCase()}`;
      const looseKey = `${isoDate}__${amountNum.toFixed(2)}__${finalCreditor.toLowerCase()}`;
      const isDuplicate = existingKeys.has(exactKey) || existingLooseKeys.has(looseKey);

      return {
        index,
        date: isoDate,
        creditor: finalCreditor,
        categoryId: detected.categoryId,
        amount: Number(amountNum.toFixed(2)),
        description: finalDesc,
        isDuplicate,
      };
    });
  }, [csvDraft, transactions, rules]);

  const handleConfirmCsvImport = () => {
    if (!csvDraft || csvMappedPreview.length === 0) return;
    const toImport = skipDuplicatesOnImport
      ? csvMappedPreview.filter((item) => !item.isDuplicate)
      : csvMappedPreview;
    const skippedDuplicates = csvMappedPreview.length - toImport.length;

    const newTransactions: FinanceTransaction[] = toImport.map((item, idx) => ({
      id: `csv_${Date.now()}_${idx}`,
      date: item.date,
      creditor: item.creditor,
      categoryId: item.categoryId,
      amount: item.amount,
      description: item.description,
      type: 'card',
    }));

    if (newTransactions.length > 0) {
      saveTransactions([...newTransactions, ...transactions]);
    }
    const sortedDates = toImport.map((t) => t.date).sort();
    const dateSpan =
      sortedDates.length > 0
        ? sortedDates[0] === sortedDates[sortedDates.length - 1]
          ? sortedDates[0]
          : `${sortedDates[0]} bis ${sortedDates[sortedDates.length - 1]}`
        : '—';

    setCsvImportResult({
      importedCount: newTransactions.length,
      skippedDuplicates,
      dateSpan,
    });
    setCsvDraft(null);
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

  const handleDeleteTransaction = (id: string) => {
    saveTransactions(transactions.filter((tx) => tx.id !== id));
  };

  const handleChangeTransactionCategory = (txId: string, nextCatId: string) => {
    saveTransactions(
      transactions.map((tx) => (tx.id === txId ? { ...tx, categoryId: nextCatId } : tx))
    );
  };

  // Filtered creditors for Creditors tab
  const filteredCreditorStats = useMemo(() => {
    const q = creditorSearch.trim().toLowerCase();
    if (!q) return creditorStats;
    return creditorStats.filter((item) => item.name.toLowerCase().includes(q));
  }, [creditorStats, creditorSearch]);

  // Filtered transactions (Multi-Filter)
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions
      .filter((tx) => {
        const matchesSearch =
          !q ||
          tx.creditor.toLowerCase().includes(q) ||
          tx.description.toLowerCase().includes(q);
        const matchesCat =
          selectedCategoryFilter === 'all' || tx.categoryId === selectedCategoryFilter;
        const matchesCred =
          selectedCreditorFilter === 'all' ||
          tx.creditor.trim().toLowerCase() === selectedCreditorFilter.toLowerCase();
        const matchesType =
          selectedTypeFilter === 'all' ||
          tx.type === selectedTypeFilter ||
          (selectedTypeFilter === 'cash' && tx.isCash);
        const matchesDirection =
          selectedDirectionFilter === 'all' ||
          (selectedDirectionFilter === 'income' ? tx.amount >= 0 : tx.amount < 0);
        return matchesSearch && matchesCat && matchesCred && matchesType && matchesDirection;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    transactions,
    searchQuery,
    selectedCategoryFilter,
    selectedCreditorFilter,
    selectedTypeFilter,
    selectedDirectionFilter,
  ]);

  const hasActiveTxFilters =
    searchQuery.trim().length > 0 ||
    selectedCategoryFilter !== 'all' ||
    selectedCreditorFilter !== 'all' ||
    selectedTypeFilter !== 'all' ||
    selectedDirectionFilter !== 'all';

  const resetAllTxFilters = () => {
    setSearchQuery('');
    setSelectedCategoryFilter('all');
    setSelectedCreditorFilter('all');
    setSelectedTypeFilter('all');
    setSelectedDirectionFilter('all');
  };

  // Kontostand-Abgleich & Füllfinanz live calculation
  const balanceAtDateStats = useMemo(() => {
    const sumAtDate = transactions
      .filter((tx) => tx.date <= balanceDate)
      .reduce((acc, tx) => acc + tx.amount, 0);
    const parsedTarget = targetBalanceInput.trim()
      ? parseLocalizedAmount(targetBalanceInput)
      : NaN;
    const hasTarget = targetBalanceInput.trim().length > 0 && !Number.isNaN(parsedTarget);
    const delta = hasTarget ? parsedTarget - sumAtDate : 0;
    return { sumAtDate, parsedTarget, hasTarget, delta };
  }, [transactions, balanceDate, targetBalanceInput]);

  const handleApplyBalanceReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceAtDateStats.hasTarget) return;
    const delta = Number(balanceAtDateStats.delta.toFixed(2));
    if (Math.abs(delta) < 0.01) {
      setBalanceSuccessMsg('Kontostand stimmt zu diesem Datum bereits exakt überein.');
      setTimeout(() => setBalanceSuccessMsg(null), 3000);
      return;
    }

    const newTx: FinanceTransaction = {
      id: `fill_${Date.now()}`,
      date: balanceDate,
      creditor: 'Kontostand-Abgleich',
      categoryId: balanceCategoryId || FINANCE_UNASSIGNED_CATEGORY_ID,
      amount: delta,
      description: balanceDescription.trim() || 'Füllfinanz / Kontostand-Abgleich',
      type: 'transfer',
    };
    saveTransactions([newTx, ...transactions]);
    setTargetBalanceInput('');
    setBalanceSuccessMsg(
      `Füllfinanz-Buchung über ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} € am ${balanceDate} erstellt.`
    );
    setTimeout(() => setBalanceSuccessMsg(null), 4000);
  };

  const getCategory = (catId: string) =>
    categories.find((c) => c.id === catId) ||
    categories.find((c) => c.id === FINANCE_UNASSIGNED_CATEGORY_ID) ||
    categories[categories.length - 1];

  const subTabs: Array<{ id: FinanceSubView; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Übersicht', icon: <PieChart className="w-3.5 h-3.5" /> },
    { id: 'transactions', label: 'Transaktionen', icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
    { id: 'creditors', label: 'Kreditoren', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'import_balance', label: 'Import & Saldo', icon: <Scale className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      style={{ '--finance-accent': accentColor } as React.CSSProperties}
      className="flex-1 h-full flex flex-col bg-[#F9F8F5] dark:bg-[#161719] text-neutral-900 dark:text-neutral-100 overflow-hidden select-none relative"
    >
      {/* Header Bar with Sub-View Tabs & Quick Actions */}
      <div className="min-h-12 border-b border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF]/90 dark:bg-[#1C1E22]/90 backdrop-blur-xs px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--finance-accent)] text-white flex items-center justify-center shadow-xs shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
            Finanzen
          </h2>
          <span className="hidden xl:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-200/70 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
            100% Lokal / Offline
          </span>
        </div>

        {/* Desktop Sub-View Tabs */}
        <div className="hidden md:flex items-center gap-1 p-1 rounded-full bg-[#EAE8E1] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136]">
          {subTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={active ? { backgroundColor: accentColor } : undefined}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'text-white shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Buttons: CSV Import & Add Cash */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('import_balance')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:border-[var(--finance-accent)] shadow-2xs cursor-pointer active:scale-95 transition-all"
            title="Bank CSV-Datei hochladen & Kontostand abgleichen"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--finance-accent)]" />
            <span className="hidden sm:inline">CSV &amp; Saldo</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCashModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--finance-accent)] text-white text-xs font-semibold hover:opacity-90 shadow-xs cursor-pointer active:scale-95 transition-all"
            title="Schnelle Barzahlung erfassen"
          >
            <Banknote className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Barzahlung</span>
          </button>
        </div>
      </div>

      {/* Main Finance Canvas */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain p-3 md:p-6 pb-24 lg:pb-8">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* ==================== SUB-VIEW 1: ÜBERSICHT ==================== */}
          {activeTab === 'overview' && (
            <>
              {/* Top KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-neutral-400 block">Gesamtsaldo</span>
                  <span className={`text-lg md:text-xl font-bold tabular-nums ${stats.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {stats.balance.toFixed(2)} €
                  </span>
                  <span className="text-[10px] text-neutral-400 block">{transactions.length} Buchungen gesamt</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    <span>Einnahmen</span>
                  </span>
                  <span className="text-lg md:text-xl font-bold tabular-nums text-emerald-600">
                    +{stats.income.toFixed(2)} €
                  </span>
                  <span className="text-[10px] text-neutral-400 block">Gutschriften &amp; Abgleich</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    <span>Ausgaben</span>
                  </span>
                  <span className="text-lg md:text-xl font-bold tabular-nums text-red-500">
                    -{stats.expense.toFixed(2)} €
                  </span>
                  <span className="text-[10px] text-neutral-400 block">Umsätze &amp; Fixkosten</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                    <Banknote className="w-3 h-3 text-[var(--finance-accent)]" />
                    <span>Bar bezahlt</span>
                  </span>
                  <span className="text-lg md:text-xl font-bold tabular-nums text-neutral-800 dark:text-neutral-200">
                    {stats.cashSpent.toFixed(2)} €
                  </span>
                  <span className="text-[10px] text-neutral-400 block">Manuell erfasste Barbeträge</span>
                </div>
              </div>

              {/* Category Distribution */}
              <div className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-[var(--finance-accent)]" />
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                      Kategorie-Auswertung &amp; Verteilung
                    </h3>
                  </div>
                  <span className="text-[11px] text-neutral-400 font-medium tabular-nums">
                    Ausgaben: {stats.expense.toFixed(2)} € · Klick filtert Transaktionen
                  </span>
                </div>

                <div className="h-3 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex shadow-inner">
                  {stats.categoryBreakdown.map((cat) =>
                    cat.percentage > 0 ? (
                      <div
                        key={cat.id}
                        style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                        title={`${cat.name}: ${cat.total.toFixed(2)} € (${cat.percentage}%)`}
                        className="h-full transition-all duration-300"
                      />
                    ) : null
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                  {stats.categoryBreakdown.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryFilter(cat.id);
                        setActiveTab('transactions');
                      }}
                      className="p-2.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226] hover:border-[var(--finance-accent)] text-xs flex items-center justify-between cursor-pointer transition-all text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="font-semibold truncate text-neutral-800 dark:text-neutral-200">
                          {cat.name}
                        </span>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        <span className="font-bold block">{cat.total.toFixed(0)} €</span>
                        <span className="text-[10px] text-neutral-400">{cat.percentage}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Top Creditors & Recent Bookings Quick Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[var(--finance-accent)]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Top Kreditoren</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('creditors')}
                      className="text-[11px] font-bold text-[var(--finance-accent)] hover:underline cursor-pointer"
                    >
                      Alle ({creditorStats.length}) →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {creditorStats.slice(0, 4).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setSelectedCreditorFilter(item.name);
                          setActiveTab('transactions');
                        }}
                        className="w-full p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/70 dark:border-[#32353B] flex items-center justify-between text-left hover:border-[var(--finance-accent)] cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-bold block truncate">{item.name}</span>
                          <span className="text-[10px] text-neutral-400">{item.txCount} Buchungen</span>
                        </div>
                        <span className="text-xs font-extrabold tabular-nums">
                          {item.spent > 0 ? `-${item.spent.toFixed(2)} €` : `+${item.income.toFixed(2)} €`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[var(--finance-accent)]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Letzte Buchungen</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('transactions')}
                      className="text-[11px] font-bold text-[var(--finance-accent)] hover:underline cursor-pointer"
                    >
                      Alle ({transactions.length}) →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[...transactions]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 4)
                      .map((tx) => (
                        <div
                          key={tx.id}
                          className="p-2.5 rounded-2xl bg-[#FBFBFA] dark:bg-[#25272C] border border-[#E5E3DC]/70 dark:border-[#32353B] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">{tx.creditor}</span>
                            <span className="text-[10px] text-neutral-400 block truncate">
                              {tx.date} · {tx.description}
                            </span>
                          </div>
                          <span className={`text-xs font-extrabold tabular-nums shrink-0 ${tx.amount >= 0 ? 'text-emerald-600' : ''}`}>
                            {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)} €
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ==================== SUB-VIEW 2: TRANSAKTIONEN ==================== */}
          {activeTab === 'transactions' && (
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-4">
              <div className="flex flex-col gap-3 pb-3 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-[var(--finance-accent)]" />
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                      Transaktionen &amp; Multi-Filter ({filteredTransactions.length} / {transactions.length})
                    </h3>
                  </div>
                  {hasActiveTxFilters && (
                    <button
                      type="button"
                      onClick={resetAllTxFilters}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/15 text-[var(--finance-accent)] font-semibold cursor-pointer hover:bg-amber-500/25"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Filter zurücksetzen</span>
                    </button>
                  )}
                </div>

                {/* Search & Multi-Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <div className="relative lg:col-span-2">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Empfänger, Verwendungszweck suchen..."
                      className="w-full text-xs pl-8 pr-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden focus:border-[var(--finance-accent)]"
                    />
                  </div>

                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden cursor-pointer"
                    aria-label="Kategorie filtern"
                  >
                    <option value="all">Alle Kategorien</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedCreditorFilter}
                    onChange={(e) => setSelectedCreditorFilter(e.target.value)}
                    className="text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden cursor-pointer"
                    aria-label="Kreditor filtern"
                  >
                    <option value="all">Alle Kreditoren</option>
                    {creditorStats.map((c) => (
                      <option key={c.key} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-1.5">
                    <select
                      value={selectedTypeFilter}
                      onChange={(e) => setSelectedTypeFilter(e.target.value as any)}
                      className="flex-1 text-xs px-2 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden cursor-pointer"
                      aria-label="Zahlungsart filtern"
                    >
                      <option value="all">Alle Arten</option>
                      <option value="card">Karte</option>
                      <option value="transfer">Überweisung</option>
                      <option value="direct_debit">Lastschrift</option>
                      <option value="cash">Bar</option>
                    </select>
                    <select
                      value={selectedDirectionFilter}
                      onChange={(e) => setSelectedDirectionFilter(e.target.value as any)}
                      className="flex-1 text-xs px-2 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden cursor-pointer"
                      aria-label="Richtung filtern"
                    >
                      <option value="all">Ein &amp; Aus</option>
                      <option value="expense">Ausgaben</option>
                      <option value="income">Einnahmen</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Transactions List */}
              <div className="divide-y divide-[#E5E3DC]/60 dark:divide-[#2B2D31]">
                {filteredTransactions.length === 0 ? (
                  <div className="py-10 text-center text-xs text-neutral-400 italic">
                    Keine passenden Buchungen gefunden. Passe die Filter an oder importiere eine CSV.
                  </div>
                ) : (
                  filteredTransactions.map((tx) => {
                    const cat = getCategory(tx.categoryId);
                    const isPositive = tx.amount > 0;
                    return (
                      <div
                        key={tx.id}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#F4F3EF]/50 dark:hover:bg-[#25272C]/40 px-2 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              tx.isCash || tx.type === 'cash'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-[var(--finance-accent)]'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                            }`}
                          >
                            {tx.isCash || tx.type === 'cash' ? (
                              <Banknote className="w-4 h-4" />
                            ) : (
                              <CreditCard className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block truncate">
                              {tx.creditor}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-2.5 h-2.5" />
                                {tx.date}
                              </span>
                              <span>•</span>
                              <span className="truncate max-w-[240px]">{tx.description}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-11 sm:pl-0">
                          <select
                            value={tx.categoryId}
                            onChange={(e) => handleChangeTransactionCategory(tx.id, e.target.value)}
                            style={{ borderColor: `${cat.color}55`, color: cat.color }}
                            className="text-[10px] font-semibold px-2 py-1 rounded-full bg-[#FBFBFA] dark:bg-[#25272C] border outline-hidden cursor-pointer max-w-[165px] truncate"
                            aria-label={`Kategorie für ${tx.creditor}`}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>

                          <span
                            className={`text-xs md:text-sm font-bold tabular-nums min-w-[76px] text-right ${
                              isPositive ? 'text-emerald-600' : 'text-neutral-900 dark:text-neutral-100'
                            }`}
                          >
                            {isPositive ? '+' : ''}{tx.amount.toFixed(2)} €
                          </span>

                          <button
                            type="button"
                            onClick={() => handleDeleteTransaction(tx.id)}
                            className="p-1.5 rounded-full text-neutral-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                            title="Buchung löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ==================== SUB-VIEW 3: KREDITOREN ==================== */}
          {activeTab === 'creditors' && (
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E5E3DC] dark:border-[#2B2D31]">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--finance-accent)]" />
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                      Kreditoren &amp; Empfänger-Statistik ({filteredCreditorStats.length})
                    </h3>
                    <span className="text-[11px] text-neutral-400">
                      Klick öffnet gefilterte Transaktionen · Auch für Barzahlungen anlegbar
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-52">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={creditorSearch}
                      onChange={(e) => setCreditorSearch(e.target.value)}
                      placeholder="Kreditor suchen..."
                      className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-full bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden focus:border-[var(--finance-accent)]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreditorModalOpen(true)}
                    style={{ backgroundColor: accentColor }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-xs font-semibold shadow-xs cursor-pointer active:scale-95 transition-all shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Kreditor anlegen</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {filteredCreditorStats.map((item) => {
                  const cat = getCategory(item.defaultCategoryId);
                  return (
                    <div
                      key={item.key}
                      onClick={() => {
                        setSelectedCreditorFilter(item.name);
                        setActiveTab('transactions');
                      }}
                      className="p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#202226] hover:border-[var(--finance-accent)] transition-all cursor-pointer space-y-2"
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
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                            >
                              {cat.name}
                            </span>
                            {(item.record?.isCashPreferred || item.cashSpent > 0) && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-[var(--finance-accent)] font-semibold">
                                Bar
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="text-right tabular-nums">
                            <span className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100 block">
                              {item.spent > 0
                                ? `-${item.spent.toFixed(2)} €`
                                : item.income > 0
                                ? `+${item.income.toFixed(2)} €`
                                : '0,00 €'}
                            </span>
                            <span className="text-[10px] text-neutral-400">
                              {item.txCount} Buch.{item.lastDate ? ` · ${item.lastDate}` : ''}
                            </span>
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
          )}

          {/* ==================== SUB-VIEW 4: IMPORT & SALDO ==================== */}
          {activeTab === 'import_balance' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Bank CSV Upload + Column Mapping & Duplicate Preview */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[var(--finance-accent)]" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Bank-CSV Import &amp; Spalten-Mapping
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Lokal geparst mit Duplikat-Prüfung vor der Übernahme
                    </p>
                  </div>
                </div>

                <label className="border-2 border-dashed border-[var(--finance-accent)]/70 rounded-2xl p-5 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-amber-500/5 transition-colors text-center">
                  <Upload className="w-6 h-6 text-[var(--finance-accent)]" />
                  <span className="text-xs font-bold">CSV-Kontoauszug auswählen (.csv / .txt)</span>
                  <span className="text-[10px] text-neutral-400">
                    Sparkasse, DKB, ING, N26, Volksbank (; , oder Tab getrennt)
                  </span>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvFileUpload}
                    className="hidden"
                  />
                </label>

                {csvParseError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{csvParseError}</span>
                  </div>
                )}

                {csvImportResult && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>{csvImportResult.importedCount} Transaktionen importiert</span>
                    </div>
                    <p className="text-[11px] opacity-90">
                      Übersprungene Duplikate: {csvImportResult.skippedDuplicates} · Zeitraum: {csvImportResult.dateSpan}
                    </p>
                  </div>
                )}

                {csvDraft && (
                  <div className="space-y-3 pt-2 border-t border-[#E5E3DC] dark:border-[#2B2D31]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold truncate">Datei: {csvDraft.fileName}</span>
                      <button
                        type="button"
                        onClick={() => setCsvDraft(null)}
                        className="text-[11px] text-neutral-400 hover:text-neutral-700 cursor-pointer"
                      >
                        Verwerfen
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Spalte: Datum</label>
                        <select
                          value={csvDraft.dateCol}
                          onChange={(e) => setCsvDraft({ ...csvDraft, dateCol: Number(e.target.value) })}
                          className="w-full p-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136]"
                        >
                          {csvDraft.headers.map((h, i) => (
                            <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Spalte: Empfänger / Kreditor</label>
                        <select
                          value={csvDraft.creditorCol}
                          onChange={(e) => setCsvDraft({ ...csvDraft, creditorCol: Number(e.target.value) })}
                          className="w-full p-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136]"
                        >
                          {csvDraft.headers.map((h, i) => (
                            <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Spalte: Betrag</label>
                        <select
                          value={csvDraft.amountCol}
                          onChange={(e) => setCsvDraft({ ...csvDraft, amountCol: Number(e.target.value) })}
                          className="w-full p-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136]"
                        >
                          {csvDraft.headers.map((h, i) => (
                            <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Spalte: Verwendungszweck</label>
                        <select
                          value={csvDraft.descCol}
                          onChange={(e) => setCsvDraft({ ...csvDraft, descCol: Number(e.target.value) })}
                          className="w-full p-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136]"
                        >
                          <option value={-1}>-- Keine / Standard --</option>
                          {csvDraft.headers.map((h, i) => (
                            <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] bg-[#F4F3EF] dark:bg-[#25272C] p-2.5 rounded-xl">
                      <span>
                        Erkannt: <strong>{csvMappedPreview.length}</strong> · Duplikate:{' '}
                        <strong className="text-amber-600">
                          {csvMappedPreview.filter((r) => r.isDuplicate).length}
                        </strong>
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={skipDuplicatesOnImport}
                          onChange={(e) => setSkipDuplicatesOnImport(e.target.checked)}
                          className="rounded accent-[var(--finance-accent)]"
                        />
                        <span>Duplikate überspringen</span>
                      </label>
                    </div>

                    <div className="max-h-56 overflow-y-auto rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] divide-y divide-[#E5E3DC]/60 dark:divide-[#2F3136] text-[11px]">
                      {csvMappedPreview.slice(0, 15).map((row) => (
                        <div
                          key={row.index}
                          className={`p-2 flex items-center justify-between gap-2 ${
                            row.isDuplicate ? 'bg-amber-500/10 opacity-75' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-bold block truncate">
                              {row.creditor}{' '}
                              {row.isDuplicate && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 ml-1">
                                  Duplikat
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-neutral-400 block truncate">
                              {row.date} · {row.description}
                            </span>
                          </div>
                          <span className={`font-bold tabular-nums shrink-0 ${row.amount >= 0 ? 'text-emerald-600' : ''}`}>
                            {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)} €
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleConfirmCsvImport}
                      style={{ backgroundColor: accentColor }}
                      className="w-full py-2.5 rounded-full text-white text-xs font-bold shadow-xs hover:opacity-95 cursor-pointer"
                    >
                      Import bestätigen ({skipDuplicatesOnImport
                        ? csvMappedPreview.filter((r) => !r.isDuplicate).length
                        : csvMappedPreview.length}{' '}
                      Buchungen)
                    </button>
                  </div>
                )}
              </div>

              {/* Kontostand-Abgleich & Füllfinanz */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2B2D31] shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[var(--finance-accent)]" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Kontostand-Abgleich &amp; „Füllfinanz“
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Setze deinen echten Kontostand zu Datum X – die Differenz wird als Ausgleichsbuchung erstellt
                    </p>
                  </div>
                </div>

                <form onSubmit={handleApplyBalanceReconciliation} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-semibold block mb-1">Stichtag (Datum X)</label>
                      <input
                        type="date"
                        required
                        value={balanceDate}
                        onChange={(e) => setBalanceDate(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Ziel-Kontostand (€)</label>
                      <input
                        type="text"
                        required
                        placeholder="z. B. 3450,00"
                        value={targetBalanceInput}
                        onChange={(e) => setTargetBalanceInput(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1">Kategorie für Ausgleichsbuchung</label>
                    <select
                      value={balanceCategoryId}
                      onChange={(e) => setBalanceCategoryId(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden cursor-pointer"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1">Bezeichnung</label>
                    <input
                      type="text"
                      value={balanceDescription}
                      onChange={(e) => setBalanceDescription(e.target.value)}
                      placeholder="Füllfinanz / Kontostand-Abgleich"
                      className="w-full p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] space-y-1.5 tabular-nums">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">Erfasster Saldo bis {balanceDate}:</span>
                      <span className="font-bold">{balanceAtDateStats.sumAtDate.toFixed(2)} €</span>
                    </div>
                    {balanceAtDateStats.hasTarget && (
                      <>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-neutral-500">Ziel-Kontostand:</span>
                          <span className="font-bold">{balanceAtDateStats.parsedTarget.toFixed(2)} €</span>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                          <span className="font-bold">Füllfinanz-Differenz:</span>
                          <span
                            className={`font-extrabold ${
                              balanceAtDateStats.delta >= 0 ? 'text-emerald-600' : 'text-red-500'
                            }`}
                          >
                            {balanceAtDateStats.delta >= 0 ? '+' : ''}
                            {balanceAtDateStats.delta.toFixed(2)} €
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {balanceSuccessMsg && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 font-medium">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{balanceSuccessMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!balanceAtDateStats.hasTarget}
                    style={{ backgroundColor: accentColor }}
                    className="w-full py-2.5 rounded-full text-white font-bold shadow-xs hover:opacity-95 disabled:opacity-45 cursor-pointer"
                  >
                    Kontostand jetzt abgleichen
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MOBILE & TABLET FLOATING THUMB-ZONE NAVIGATION MENU */}
      {/* ======================================================== */}
      {isMobileNavExpanded && (
        <div
          onClick={() => setIsMobileNavExpanded(false)}
          className="fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-2xs z-40 md:hidden"
        />
      )}

      <div className="md:hidden select-none">
        {isMobileNavExpanded ? (
          <div
            style={{ borderColor: accentColor }}
            className={`fixed ${
              mobileBarPosition === 'bottom' ? 'bottom-[4.75rem]' : 'bottom-5'
            } left-2.5 right-2.5 sm:left-auto sm:right-4 sm:min-w-[360px] z-50 h-14 px-2 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-between gap-1 text-neutral-800 dark:text-neutral-200`}
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('overview');
                setIsMobileNavExpanded(false);
              }}
              style={activeTab === 'overview' ? { backgroundColor: accentColor } : undefined}
              className={`flex-1 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'overview' ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
              }`}
              title="Übersicht"
              aria-label="Übersicht"
            >
              <PieChart className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('transactions');
                setIsMobileNavExpanded(false);
              }}
              style={activeTab === 'transactions' ? { backgroundColor: accentColor } : undefined}
              className={`flex-1 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'transactions' ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
              }`}
              title="Transaktionen"
              aria-label="Transaktionen"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('creditors');
                setIsMobileNavExpanded(false);
              }}
              style={activeTab === 'creditors' ? { backgroundColor: accentColor } : undefined}
              className={`flex-1 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'creditors' ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
              }`}
              title="Kreditoren"
              aria-label="Kreditoren"
            >
              <Users className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('import_balance');
                setIsMobileNavExpanded(false);
              }}
              style={activeTab === 'import_balance' ? { backgroundColor: accentColor } : undefined}
              className={`flex-1 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'import_balance' ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
              }`}
              title="Import & Saldo"
              aria-label="Import & Saldo"
            >
              <Scale className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5 shrink-0" />

            <button
              type="button"
              onClick={() => {
                setIsMobileNavExpanded(false);
                setIsCashModalOpen(true);
              }}
              style={{ backgroundColor: accentColor }}
              className="flex items-center justify-center gap-1 h-10 px-2.5 rounded-full text-xs font-semibold text-white cursor-pointer shrink-0 shadow-xs"
              title="Barzahlung erfassen"
              aria-label="Barzahlung"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Bar</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMobileNavExpanded(false)}
              className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Finanz-Navigation schließen"
            >
              <X className="w-4 h-4" />
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
            {activeTab === 'transactions' ? (
              <ArrowLeftRight className="w-5 h-5" />
            ) : activeTab === 'creditors' ? (
              <Users className="w-5 h-5" />
            ) : activeTab === 'import_balance' ? (
              <Scale className="w-5 h-5" />
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

    </div>
  );
};
