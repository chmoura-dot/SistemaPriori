import React, { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import { useDebouncedValue } from '../lib/useDebouncedValue';

type NfseInvoice = {
  id: string;
  createdAt?: string;
  issueDate: string;
  status: string;
  payer: { nome: string; cpf_cnpj: string };
  totalAmount: number;
  description?: string | null;
};

const NfsePage = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLookingUpCnpj, setIsLookingUpCnpj] = useState(false);
  const [payerNameLocked, setPayerNameLocked] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<NfseInvoice[]>([]);

  const [invoiceData, setInvoiceData] = useState({
    issueDate: '',
    payerName: '',
    payerCNPJ: '',
    totalAmount: 0,
    description: '',
  });

  const payerCnpjDigits = (invoiceData.payerCNPJ ?? '').replace(/\D/g, '');
  const debouncedCnpjDigits = useDebouncedValue(payerCnpjDigits, 500);

  const lookupCnpj = async (cnpjDigits: string) => {
    setIsLookingUpCnpj(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
        body: { cnpj: cnpjDigits },
      });

      if (error) {
        throw new Error(error.message);
      }

      const razaoSocial = data?.razaoSocial as string | null | undefined;
      if (!razaoSocial) {
        throw new Error('CNPJ encontrado, mas sem Razão Social retornada.');
      }

      setInvoiceData((prev) => ({
        ...prev,
        payerName: razaoSocial,
      }));
      setPayerNameLocked(true);
    } catch (err: any) {
      setPayerNameLocked(false);
      setErrorMessage(err?.message ?? 'Erro ao consultar CNPJ.');
    } finally {
      setIsLookingUpCnpj(false);
    }
  };

  useEffect(() => {
    // Só consulta quando tiver 14 dígitos
    if (debouncedCnpjDigits.length !== 14) return;
    lookupCnpj(debouncedCnpjDigits);
  }, [debouncedCnpjDigits]);

  const fetchInvoices = async () => {
    setErrorMessage(null);
    try {
      const data = await api.getInvoices({ limit: 20 });
      setInvoices(data);
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Erro ao buscar notas fiscais.');
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await api.createInvoice({
        issueDate: invoiceData.issueDate,
        payer: invoiceData.payerName,
        payerCNPJ: invoiceData.payerCNPJ,
        totalAmount: invoiceData.totalAmount,
        description: invoiceData.description,
      });

      setSuccessMessage('Nota fiscal criada com sucesso (rascunho).');
      setIsModalOpen(false);
      setInvoiceData({
        issueDate: '',
        payerName: '',
        payerCNPJ: '',
        totalAmount: 0,
        description: '',
      });
      setPayerNameLocked(false);
      await fetchInvoices();
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Erro ao criar nota fiscal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Emissão de Notas Fiscais</h1>
          <p className="text-sm text-zinc-500">Crie notas (rascunho) e acompanhe as últimas emissões.</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={fetchInvoices} disabled={isLoading}>
            Atualizar
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            Criar Nota Fiscal
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 p-4">
          <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Últimas notas</h2>
          <span className="text-xs text-zinc-500">Exibindo {invoices.length} registros</span>
        </div>
        <div className="p-4">
          {invoices.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma nota encontrada.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-priori-navy">
                      {inv.payer?.nome ?? 'Tomador não informado'}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Emissão: {inv.issueDate} • Status: {inv.status}
                    </div>
                  </div>
                  <div className="text-sm text-zinc-700">
                    CPF/CNPJ: {inv.payer?.cpf_cnpj ?? '-'} • Valor: R$ {Number(inv.totalAmount ?? 0).toFixed(2)}
                  </div>
                  {inv.description ? <div className="text-xs text-zinc-500">{inv.description}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Criar Nota Fiscal">
        <form onSubmit={handleCreateInvoice} className="space-y-3">
          <Input
            label="Data de Emissão"
            type="date"
            value={invoiceData.issueDate}
            onChange={(e) => setInvoiceData({ ...invoiceData, issueDate: e.target.value })}
            required
          />
          <Input
            label="Tomador (CPF/CNPJ)"
            value={invoiceData.payerCNPJ}
            onChange={(e) => {
              const next = e.target.value;
              const nextDigits = next.replace(/\D/g, '');
              // Se usuário está alterando o CNPJ, destrava o nome até nova consulta
              if (nextDigits !== payerCnpjDigits) {
                setPayerNameLocked(false);
              }
              setInvoiceData({ ...invoiceData, payerCNPJ: next });
            }}
            required
          />
          <Input
            label="Nome do Tomador"
            value={invoiceData.payerName}
            onChange={(e) => setInvoiceData({ ...invoiceData, payerName: e.target.value })}
            disabled={payerNameLocked}
            required
          />

          {isLookingUpCnpj && (
            <p className="text-xs text-zinc-500">Consultando CNPJ…</p>
          )}

          {payerNameLocked && (
            <button
              type="button"
              className="text-xs text-priori-navy underline"
              onClick={() => setPayerNameLocked(false)}
            >
              Desbloquear nome para edição manual
            </button>
          )}
          <Input
            label="Valor Total"
            type="number"
            value={invoiceData.totalAmount}
            onChange={(e) => setInvoiceData({ ...invoiceData, totalAmount: Number(e.target.value) })}
            required
          />
          <Input
            label="Descrição"
            value={invoiceData.description}
            onChange={(e) => setInvoiceData({ ...invoiceData, description: e.target.value })}
            required
          />

          <div className="pt-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Emitindo...' : 'Emitir Nota Fiscal'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default NfsePage;
