import React from 'react';
import { Modal } from '../../components/Modal';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Expense, ExpenseCategory } from '../../services/types';

export interface ExpenseFormData {
  description: string;
  beneficiary: string;
  razaoSocial: string;
  nomeFantasia: string;
  productDescription: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  isRecurring: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editingExpense: Expense | null;
  formData: ExpenseFormData;
  setFormData: React.Dispatch<React.SetStateAction<ExpenseFormData>>;
  amountInput: string;
  handleAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
}

export const ExpenseFormModal = ({
  isOpen,
  onClose,
  editingExpense,
  formData,
  setFormData,
  amountInput,
  handleAmountChange,
  handleSubmit,
  isSaving,
}: Props) => (
  <Modal isOpen={isOpen} onClose={onClose} title={editingExpense ? 'Editar Despesa' : 'Nova Despesa'}>
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Descrição / Emissor"
        placeholder="Ex: Nome da Empresa ou tipo de despesa"
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
            <optgroup label="Infraestrutura e Fixos">
              <option value={ExpenseCategory.RENT}>{ExpenseCategory.RENT}</option>
              <option value={ExpenseCategory.UTILITIES}>{ExpenseCategory.UTILITIES}</option>
              <option value={ExpenseCategory.MAINTENANCE}>{ExpenseCategory.MAINTENANCE}</option>
            </optgroup>
            <optgroup label="Despesas com Pessoal">
              <option value={ExpenseCategory.SALARY}>{ExpenseCategory.SALARY}</option>
              <option value={ExpenseCategory.PRO_LABORE}>{ExpenseCategory.PRO_LABORE}</option>
            </optgroup>
            <optgroup label="Operacional da Clínica">
              <option value={ExpenseCategory.PSYCH_MATERIALS}>{ExpenseCategory.PSYCH_MATERIALS}</option>
              <option value={ExpenseCategory.SUPPLIES}>{ExpenseCategory.SUPPLIES}</option>
            </optgroup>
            <optgroup label="Tecnologia e Vendas">
              <option value={ExpenseCategory.MARKETING}>{ExpenseCategory.MARKETING}</option>
              <option value={ExpenseCategory.SOFTWARE}>{ExpenseCategory.SOFTWARE}</option>
            </optgroup>
            <optgroup label="Financeiro e Administrativo">
              <option value={ExpenseCategory.TAX}>{ExpenseCategory.TAX}</option>
              <option value={ExpenseCategory.BANK_FEES}>{ExpenseCategory.BANK_FEES}</option>
              <option value={ExpenseCategory.LOAN}>{ExpenseCategory.LOAN}</option>
            </optgroup>
            <optgroup label="Gerais">
              <option value={ExpenseCategory.OTHER}>{ExpenseCategory.OTHER}</option>
            </optgroup>
          </select>
        </div>
        <Input
          label="Valor (R$)"
          type="text"
          inputMode="decimal"
          placeholder="Ex: 139,90"
          value={amountInput}
          onChange={handleAmountChange}
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
          <label htmlFor="isRecurring" className="text-sm text-zinc-600 cursor-pointer">
            Despesa Recorrente
          </label>
        </div>
      </div>

      <div className="pt-4 flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border-priori-navy text-priori-navy hover:bg-priori-navy/5"
          onClick={onClose}
        >
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 bg-priori-navy hover:bg-priori-navy/90" isLoading={isSaving}>
          {editingExpense ? 'Salvar Alterações' : 'Cadastrar Despesa'}
        </Button>
      </div>
    </form>
  </Modal>
);
