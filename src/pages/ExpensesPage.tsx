import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  TrendingDown,
  Tag,
  Copy,
  RefreshCw,
  FileText,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';
import { toastError } from '../lib/toast';
// pdfjs-dist é importado dinamicamente dentro de handlePdfUpload
// para não inflar o bundle inicial (~1.5MB carregado só quando necessário)
import { Expense, ExpenseCategory } from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { ExpenseFormData, ExpenseFormModal } from './expenses/ExpenseFormModal';
import { parsePdfContent } from './expenses/expenseUtils';

const DEFAULT_FORM: ExpenseFormData = {
  description: '',
  beneficiary: '',
  razaoSocial: '',
  nomeFantasia: '',
  productDescription: '',
  amount: 0,
  category: ExpenseCategory.OTHER,
  date: new Date().toISOString().split('T')[0],
  isRecurring: false,
};

export const ExpensesPage = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState<ExpenseFormData>(DEFAULT_FORM);
  const [amountInput, setAmountInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReadingPdf, setIsReadingPdf] = useState(false);

  // ── Paginação ─────────────────────────────────────────────────────────────
  const ITEMS_PER_PAGE = 40;
  const [currentPage, setCurrentPage] = useState(1);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadExpenses = async () => {
    setIsLoading(true);
    try {
      const data = await api.getExpenses();
      setExpenses(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
      console.error('Erro ao carregar despesas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadExpenses(); }, []);

  // ── Handlers CRUD ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingExpense) {
        await api.updateExpense(editingExpense.id, formData);
      } else {
        await api.createExpense(formData);
      }
      await loadExpenses();
      setIsModalOpen(false);
      setEditingExpense(null);
      setFormData(DEFAULT_FORM);
    } catch {
      toastError('Erro ao salvar despesa');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      description: expense.description,
      beneficiary: expense.beneficiary || '',
      razaoSocial: expense.razaoSocial || '',
      nomeFantasia: expense.nomeFantasia || '',
      productDescription: expense.productDescription || '',
      amount: expense.amount,
      category: expense.category,
      date: expense.date,
      isRecurring: expense.isRecurring,
    });
    setAmountInput(expense.amount > 0 ? expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setIsModalOpen(true);
  };

  const handleDuplicate = (expense: Expense) => {
    setEditingExpense(null);
    setFormData({
      description: `${expense.description} (Cópia)`,
      beneficiary: expense.beneficiary || '',
      razaoSocial: expense.razaoSocial || '',
      nomeFantasia: expense.nomeFantasia || '',
      productDescription: expense.productDescription || '',
      amount: expense.amount,
      category: expense.category,
      date: new Date().toISOString().split('T')[0],
      isRecurring: expense.isRecurring,
    });
    setAmountInput(expense.amount > 0 ? expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setIsModalOpen(true);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = e.target.value.replace(/[^0-9.,]/g, '');
    setAmountInput(filtered);
    const numeric = parseFloat(filtered.replace(',', '.'));
    setFormData(prev => ({ ...prev, amount: isNaN(numeric) ? 0 : numeric }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta despesa?')) return;
    try {
      await api.deleteExpense(id);
      await loadExpenses();
    } catch {
      toastError('Erro ao excluir despesa');
    }
  };

  // ── PDF Upload ────────────────────────────────────────────────────────────
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsReadingPdf(true);
    let successCount = 0;
    let failCount = 0;
    let duplicateCount = 0;

    try {
      // Dynamic import do PDF.js (só carrega quando necessário — ~1.5MB)
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const currentExpenses = await api.getExpenses();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let fullText = '';
          for (let j = 1; j <= Math.min(pdf.numPages, 3); j++) {
            const page = await pdf.getPage(j);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
          }

          const extractedData = await parsePdfContent(fullText);

          // Checa duplicidade por valor + data
          const isDuplicate = currentExpenses.some(
            exp => exp.amount === extractedData.amount && exp.date === extractedData.date
          );
          if (isDuplicate) {
            duplicateCount++;
            if (files.length === 1) alert('Esta despesa (mesmo valor e data) já consta no sistema.');
            continue;
          }

          if (files.length === 1) {
            // 1 arquivo → abre modal para revisão
            setFormData(prev => ({ ...prev, ...extractedData }));
            setAmountInput(extractedData.amount > 0 ? extractedData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
            setEditingExpense(null);
            setIsModalOpen(true);
            successCount++;
          } else {
            // Vários arquivos → cria automaticamente
            await api.createExpense({ ...formData, ...extractedData, category: ExpenseCategory.OTHER });
            successCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (files.length > 1) {
        await loadExpenses();
        let msg = `${successCount} despesas importadas!`;
        if (duplicateCount > 0) msg += `\n${duplicateCount} ignoradas (já cadastradas).`;
        if (failCount > 0) msg += `\n${failCount} falhas.`;
        alert(msg + '\nRevise os dados na tabela.');
      }
    } catch {
      alert('Ocorreu um erro ao processar os arquivos.');
    } finally {
      setIsReadingPdf(false);
      e.target.value = '';
    }
  };

  // ── Recorrências ──────────────────────────────────────────────────────────
  const handleProcessRecurring = async () => {
    if (!confirm('Processar despesas recorrentes do mês anterior para o mês atual?')) return;
    setIsProcessing(true);
    try {
      const allExpenses = await api.getExpenses();
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastMonthDate = new Date(now);
      lastMonthDate.setMonth(now.getMonth() - 1);
      const lastMonth = lastMonthDate.getMonth();
      const lastYear = lastMonthDate.getFullYear();

      const lastMonthRecurring = allExpenses.filter(e => {
        const d = new Date(e.date + 'T12:00:00');
        return e.isRecurring && d.getMonth() === lastMonth && d.getFullYear() === lastYear;
      });
      const currentMonthExpenses = allExpenses.filter(e => {
        const d = new Date(e.date + 'T12:00:00');
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      let count = 0;
      for (const recurring of lastMonthRecurring) {
        const alreadyExists = currentMonthExpenses.some(
          e => e.description === recurring.description && e.amount === recurring.amount && e.category === recurring.category
        );
        if (!alreadyExists) {
          const newDate = new Date(recurring.date + 'T12:00:00');
          newDate.setMonth(newDate.getMonth() + 1);
          await api.createExpense({
            description: recurring.description,
            amount: recurring.amount,
            category: recurring.category,
            date: newDate.toISOString().split('T')[0],
            isRecurring: true,
          });
          count++;
        }
      }
      await loadExpenses();
      alert(`${count} despesas recorrentes processadas com sucesso!`);
    } catch {
      alert('Erro ao processar despesas recorrentes');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Cálculos derivados ────────────────────────────────────────────────────
  const totalExpenses = useMemo(() => expenses.reduce((acc, exp) => acc + exp.amount, 0), [expenses]);
  const totalPages = Math.ceil(expenses.length / ITEMS_PER_PAGE);
  const paginatedExpenses = useMemo(
    () => expenses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [expenses, currentPage]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Controle de Despesas</h2>
          <p className="text-zinc-500">Gerencie os custos fixos e variáveis da clínica.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleProcessRecurring}
            variant="outline"
            isLoading={isProcessing}
            className="flex items-center gap-2 border-priori-navy text-priori-navy hover:bg-priori-navy/5"
          >
            <RefreshCw size={18} className={cn(isProcessing && 'animate-spin')} />
            Processar Recorrências
          </Button>
          <div className="relative">
            <input
              type="file"
              accept=".pdf"
              multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handlePdfUpload}
              disabled={isReadingPdf}
            />
            <Button
              variant="outline"
              className="flex items-center gap-2 border-priori-gold text-priori-gold hover:bg-priori-gold/5"
              isLoading={isReadingPdf}
            >
              {isReadingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              Importar PDF
            </Button>
          </div>
          <Button
            onClick={() => { setEditingExpense(null); setAmountInput(''); setFormData(DEFAULT_FORM); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-priori-navy hover:bg-priori-navy/90"
          >
            <Plus size={18} /> Nova Despesa
          </Button>
        </div>
      </div>

      {/* KPI Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 rounded-lg text-red-500"><TrendingDown size={20} /></div>
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Total de Despesas</p>
          </div>
          <p className="text-3xl font-bold text-priori-navy">
            R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Fornecedor / Detalhes</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Categoria</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recorrente</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-400">Nenhuma despesa cadastrada.</td>
                </tr>
              ) : (
                paginatedExpenses.map(expense => {
                  const mainText = expense.beneficiary || expense.description;
                  const subText = expense.productDescription || (expense.beneficiary ? expense.description : '');
                  return (
                    <tr key={expense.id} className="hover:bg-zinc-50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-priori-navy">{mainText}</p>
                        {subText && subText !== mainText && (
                          <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">{subText}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-500 border border-zinc-200">
                          <Tag size={10} />{expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-zinc-500">{new Date(expense.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-red-500">
                          R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider', expense.isRecurring ? 'text-priori-navy' : 'text-zinc-400')}>
                          {expense.isRecurring ? 'Sim' : 'Não'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleDuplicate(expense)} className="p-2 text-zinc-400 hover:text-priori-gold transition-colors" title="Duplicar"><Copy size={16} /></button>
                          <button onClick={() => handleEdit(expense)} className="p-2 text-zinc-400 hover:text-priori-navy transition-colors" title="Editar"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(expense.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors" title="Excluir"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-xs text-zinc-400">
            Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, expenses.length)} de {expenses.length} despesas
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              ← Anterior
            </button>
            <span className="text-xs text-zinc-500 font-medium">{currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Próxima →
            </button>
          </div>
        </div>
      )}

      {/* Modal do formulário */}
      <ExpenseFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingExpense(null); }}
        editingExpense={editingExpense}
        formData={formData}
        setFormData={setFormData}
        amountInput={amountInput}
        handleAmountChange={handleAmountChange}
        handleSubmit={handleSubmit}
        isSaving={isSaving}
      />
    </div>
  );
};
