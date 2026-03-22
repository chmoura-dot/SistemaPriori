import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  DollarSign, 
  TrendingDown, 
  Calendar,
  Tag,
  AlertCircle,
  Copy,
  RefreshCw,
  FileText,
  Loader2
} from 'lucide-react';
import { api } from '../services/api';
import * as pdfjsLib from 'pdfjs-dist';

// Configuração do worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
import { Expense, ExpenseCategory } from '../services/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { cn } from '../lib/utils';

export const ExpensesPage = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    category: ExpenseCategory.OTHER,
    date: new Date().toISOString().split('T')[0],
    isRecurring: false
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReadingPdf, setIsReadingPdf] = useState(false);

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

  useEffect(() => {
    loadExpenses();
  }, []);

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
      setFormData({
        description: '',
        amount: 0,
        category: ExpenseCategory.OTHER,
        date: new Date().toISOString().split('T')[0],
        isRecurring: false
      });
    } catch (error) {
      alert('Erro ao salvar despesa');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      date: expense.date,
      isRecurring: expense.isRecurring
    });
    setIsModalOpen(true);
  };

  const handleDuplicate = (expense: Expense) => {
    setEditingExpense(null);
    setFormData({
      description: `${expense.description} (Cópia)`,
      amount: expense.amount,
      category: expense.category,
      date: new Date().toISOString().split('T')[0],
      isRecurring: expense.isRecurring
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir esta despesa?')) {
      try {
        await api.deleteExpense(id);
        await loadExpenses();
      } catch (error) {
        alert('Erro ao excluir despesa');
      }
    }
  };

  const parsePdfContent = (text: string) => {
    // Tenta encontrar padrões de data (DD/MM/AAAA, DD-MM-AAAA, DD.MM.AAAA ou DD/MM/AA)
    const dateRegex = /(\d{2})[/-|\.](\d{2})[/-|\.](\d{2,4})/g;
    const matches = Array.from(text.matchAll(dateRegex));
    
    let extractedDate = new Date().toISOString().split('T')[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (matches.length > 0) {
      // Procura primeiro por datas que venham após a palavra "Vencimento" ou "Venc" no texto próximo
      const vencPos = text.toLowerCase().search(/vencimento|venc|pago até/);
      
      let bestDate: Date | null = null;
      let minDiff = Infinity;

      for (const match of matches) {
        let [_, day, month, year] = match;
        if (year.length === 2) year = `20${year}`;
        const dateObj = new Date(`${year}-${month}-${day}T12:00:00`);

        if (!isNaN(dateObj.getTime())) {
          // Se houver uma data próxima à palavra "vencimento", prioriza essa
          if (vencPos !== -1 && Math.abs(match.index! - vencPos) < 100) {
            bestDate = dateObj;
            break; 
          }

          // Caso contrário, tenta pegar a data que seja hoje ou no futuro (mais provável ser o vencimento)
          // Se todas forem passadas, pega a mais recente.
          const diff = dateObj.getTime() - today.getTime();
          if (diff >= 0 && diff < minDiff) {
            minDiff = diff;
            bestDate = dateObj;
          } else if (!bestDate) {
            bestDate = dateObj;
          }
        }
      }

      if (bestDate) {
        extractedDate = bestDate.toISOString().split('T')[0];
      }
    }

    // Busca por padrões comuns de valor (R$ 0,00 ou apenas 0,00)
    // Procuramos o maior valor que pareça ser o total
    const amountRegex = /(?:R\$\s?|V[alor]{3}\s?|TOTAL\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
    let maxAmount = 0;
    let match;
    
    while ((match = amountRegex.exec(text)) !== null) {
      const value = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
      if (value > maxAmount) maxAmount = value;
    }

    // Busca por descrição (nome de empresa ou serviço)
    // Tenta pegar as primeiras palavras que não sejam números/datas
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    const description = lines[0]?.substring(0, 50) || 'Nova Despesa (PDF)';

    return {
      date: extractedDate,
      amount: maxAmount,
      description
    };
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsReadingPdf(true);
    let successCount = 0;
    let failCount = 0;
    let duplicateCount = 0;

    try {
      // Carrega as despesas atuais para checar duplicidade
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
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }

          const extractedData = parsePdfContent(fullText);
          
          // Checa se já existe uma despesa com o mesmo valor e data
          const isDuplicate = currentExpenses.some(exp => 
            exp.amount === extractedData.amount && 
            exp.date === extractedData.date
          );

          if (isDuplicate) {
            duplicateCount++;
            if (files.length === 1) {
              alert('Esta despesa (mesmo valor e data) já consta no sistema e foi ignorada para evitar duplicidade.');
            }
            continue;
          }

          // Se for apenas UM arquivo, abre o modal para revisão
          if (files.length === 1) {
            setFormData({
              ...formData,
              ...extractedData,
              description: `IMPORTADO: ${extractedData.description}`
            });
            setEditingExpense(null);
            setIsModalOpen(true);
            successCount++;
          } else {
            // Se forem vários, cria automaticamente para agilizar
            await api.createExpense({
              ...formData,
              ...extractedData,
              description: `IMPORTADO: ${extractedData.description}`,
              category: ExpenseCategory.OTHER // Padrão para importação em lote
            });
            successCount++;
          }
        } catch (error) {
          console.error(`Erro ao processar arquivo ${file.name}:`, error);
          failCount++;
        }
      }

      if (files.length > 1) {
        await loadExpenses();
        let message = `${successCount} despesas importadas com sucesso!`;
        if (duplicateCount > 0) message += `\n${duplicateCount} despesas foram ignoradas por já estarem cadastradas.`;
        if (failCount > 0) message += `\n${failCount} falhas no processamento.`;
        alert(message + '\nPor favor, revise os dados na tabela.');
      }
    } catch (error) {
      console.error('Erro geral na importação:', error);
      alert('Ocorreu um erro ao processar os arquivos.');
    } finally {
      setIsReadingPdf(false);
      e.target.value = '';
    }
  };

  const handleProcessRecurring = async () => {
    if (!confirm('Deseja processar as despesas recorrentes do mês anterior para o mês atual?')) return;
    
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

      // Despesas recorrentes do mês passado
      const lastMonthRecurring = allExpenses.filter(e => {
        const d = new Date(e.date + 'T12:00:00');
        return e.isRecurring && d.getMonth() === lastMonth && d.getFullYear() === lastYear;
      });

      // Despesas do mês atual (para evitar duplicidade)
      const currentMonthExpenses = allExpenses.filter(e => {
        const d = new Date(e.date + 'T12:00:00');
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      let count = 0;
      for (const recurring of lastMonthRecurring) {
        const alreadyExists = currentMonthExpenses.some(e => 
          e.description === recurring.description && 
          e.amount === recurring.amount &&
          e.category === recurring.category
        );

        if (!alreadyExists) {
          const newDate = new Date(recurring.date + 'T12:00:00');
          newDate.setMonth(newDate.getMonth() + 1);
          
          await api.createExpense({
            description: recurring.description,
            amount: recurring.amount,
            category: recurring.category,
            date: newDate.toISOString().split('T')[0],
            isRecurring: true
          });
          count++;
        }
      }

      await loadExpenses();
      alert(`${count} despesas recorrentes processadas com sucesso!`);
    } catch (error) {
      alert('Erro ao processar despesas recorrentes');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalExpenses = expenses.reduce((acc, exp) => acc + exp.amount, 0);

  return (
    <div className="space-y-6">
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
            <RefreshCw size={18} className={cn(isProcessing && "animate-spin")} />
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
          <Button onClick={() => {
            setEditingExpense(null);
            setFormData({
              description: '',
              amount: 0,
              category: ExpenseCategory.OTHER,
              date: new Date().toISOString().split('T')[0],
              isRecurring: false
            });
            setIsModalOpen(true);
          }} className="flex items-center gap-2 bg-priori-navy hover:bg-priori-navy/90">
            <Plus size={18} />
            Nova Despesa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 rounded-lg text-red-500">
              <TrendingDown size={20} />
            </div>
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Total de Despesas</p>
          </div>
          <p className="text-3xl font-bold text-priori-navy">R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Descrição</th>
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
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-400">
                    Nenhuma despesa cadastrada.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-zinc-50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-priori-navy">{expense.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-500 border border-zinc-200">
                        <Tag size={10} />
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-zinc-500">{new Date(expense.date).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-red-500">R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </td>
                    <td className="px-6 py-4">
                      {expense.isRecurring ? (
                        <span className="text-[10px] font-bold text-priori-navy uppercase tracking-wider">Sim</span>
                      ) : (
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Não</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleDuplicate(expense)}
                          className="p-2 text-zinc-400 hover:text-priori-gold transition-colors"
                          title="Duplicar Despesa"
                        >
                          <Copy size={16} />
                        </button>
                        <button 
                          onClick={() => handleEdit(expense)}
                          className="p-2 text-zinc-400 hover:text-priori-navy transition-colors"
                          title="Editar Despesa"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(expense.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                          title="Excluir Despesa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingExpense ? 'Editar Despesa' : 'Nova Despesa'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Descrição"
            placeholder="Ex: Aluguel, Salário, etc"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Categoria</label>
              <select
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as ExpenseCategory })}
                required
              >
                {Object.values(ExpenseCategory).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <Input
              label="Valor (R$)"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
            <div className="flex items-center gap-3 h-full pt-6">
              <input
                type="checkbox"
                id="isRecurring"
                className="w-4 h-4 rounded border-zinc-300 bg-white text-priori-navy focus:ring-priori-navy/20"
                checked={formData.isRecurring}
                onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
              />
              <label htmlFor="isRecurring" className="text-sm text-zinc-600 cursor-pointer">Despesa Recorrente</label>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-priori-navy text-priori-navy hover:bg-priori-navy/5"
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90"
              isLoading={isSaving}
            >
              {editingExpense ? 'Salvar Alterações' : 'Cadastrar Despesa'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
