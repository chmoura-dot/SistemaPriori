import React, { useEffect, useState, useRef } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { api } from '../services/api';
import { Upload, FileText, X, Check, AlertCircle, Loader2 } from 'lucide-react';

type NfseInvoice = {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  status: string;
  payer: { nome: string; cpf_cnpj: string };
  totalAmount: number;
  description?: string | null;
  createdAt?: string;
};

type PendingInvoice = {
  invoiceNumber: string;
  issueDate: string;
  payerName: string;
  payerCNPJ: string;
  totalAmount: number;
  description: string;
  fileName: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
};

const NfsePage = () => {
  const [invoices, setInvoices] = useState<NfseInvoice[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const data = await api.getInvoices({ limit: 50 });
      setInvoices(data);
    } catch (err: any) {
      setErrorMessage('Erro ao carregar notas fiscais.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
  };

  const processFiles = async (files: File[]) => {
    const newPending: PendingInvoice[] = [];
    setErrorMessage(null);

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.xml')) {
        continue;
      }

      try {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        // Helper para pegar valor de tag ignorando namespace se necessário
        const getTagValue = (tagName: string) => {
          const el = xmlDoc.getElementsByTagName(tagName)[0];
          return el?.textContent?.trim() || '';
        };

        // Padrão ABRASF (tags comuns)
        const invoiceNumber = getTagValue('Numero');
        const issueDateRaw = getTagValue('DataEmissao'); // Ex: 2024-03-22T10:00:00
        const issueDate = issueDateRaw ? issueDateRaw.split('T')[0] : '';
        
        // Dados do Tomador
        const payerName = getTagValue('RazaoSocial');
        const payerCNPJ = getTagValue('Cnpj') || getTagValue('Cpf');
        
        // Valores
        const totalAmount = parseFloat(getTagValue('ValorServicos') || '0');
        const description = getTagValue('Discriminacao');

        if (!invoiceNumber || !payerCNPJ) {
          throw new Error('Formato de XML não reconhecido ou campos obrigatórios ausentes.');
        }

        newPending.push({
          invoiceNumber,
          issueDate,
          payerName,
          payerCNPJ,
          totalAmount,
          description,
          fileName: file.name,
          status: 'pending'
        });
      } catch (err: any) {
        console.error(`Erro ao ler arquivo ${file.name}:`, err);
        newPending.push({
          invoiceNumber: '?',
          issueDate: '',
          payerName: '',
          payerCNPJ: '',
          totalAmount: 0,
          description: '',
          fileName: file.name,
          status: 'error',
          message: err.message || 'Erro ao processar XML'
        });
      }
    }

    setPendingInvoices(prev => [...prev, ...newPending]);
    if (newPending.length > 0) setIsModalOpen(true);
    
    // Limpa o input para permitir selecionar o mesmo arquivo novamente se necessário
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveImport = async () => {
    const toImport = pendingInvoices.filter(inv => inv.status === 'pending');
    if (toImport.length === 0) return;

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const result = await api.importInvoices(toImport.map(inv => ({
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        payerName: inv.payerName,
        payerCNPJ: inv.payerCNPJ,
        totalAmount: inv.totalAmount,
        description: inv.description
      })));

      if (result.success) {
        setSuccessMessage(`${result.importedCount} notas importadas com sucesso!`);
        setPendingInvoices([]);
        setIsModalOpen(false);
        fetchInvoices();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar notas fiscais. Verifique se há notas duplicadas.');
    } finally {
      setIsImporting(false);
    }
  };

  const removePending = (index: number) => {
    setPendingInvoices(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-priori-navy">Notas Fiscais (NFS-e)</h1>
          <p className="text-sm text-zinc-500">Importe seus arquivos XML da prefeitura para sincronizar o financeiro.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xml"
            multiple
            className="hidden"
          />
          <Button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-priori-gold hover:bg-priori-gold/90 text-priori-navy border-none"
          >
            <Upload size={18} />
            Importar XML
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
          <Check size={18} />
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className="ml-auto">
            <X size={16} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-800 border border-red-200">
          <AlertCircle size={18} />
          {errorMessage}
          <button onClick={() => setErrorMessage(null)} className="ml-auto">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabela de Notas */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Histórico de Notas Importadas</h2>
        </div>
        
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center text-zinc-400 gap-3">
              <Loader2 className="animate-spin" size={32} />
              <p>Carregando notas...</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-zinc-400 gap-4">
              <FileText size={48} strokeWidth={1} />
              <div className="text-center">
                <p className="font-medium text-zinc-600">Nenhuma nota encontrada</p>
                <p className="text-sm">Clique em "Importar XML" para começar.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-zinc-50/50">
                  <th className="px-6 py-3 font-semibold text-zinc-600 border-b border-zinc-200 text-xs uppercase tracking-wider">Nº Nota</th>
                  <th className="px-6 py-3 font-semibold text-zinc-600 border-b border-zinc-200 text-xs uppercase tracking-wider">Emissão</th>
                  <th className="px-6 py-3 font-semibold text-zinc-600 border-b border-zinc-200 text-xs uppercase tracking-wider">Tomador</th>
                  <th className="px-6 py-3 font-semibold text-zinc-600 border-b border-zinc-200 text-xs uppercase tracking-wider">Valor</th>
                  <th className="px-6 py-3 font-semibold text-zinc-600 border-b border-zinc-200 text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-zinc-700">{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 text-zinc-600">{inv.issueDate}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-800">{inv.payer?.nome}</div>
                      <div className="text-xs text-zinc-500 font-mono">{inv.payer?.cpf_cnpj}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-priori-navy">
                      R$ {Number(inv.totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de Pré-visualização */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isImporting && setIsModalOpen(false)} 
        title="Pré-visualização da Importação"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Confira as notas encontradas nos arquivos selecionados antes de confirmar a importação.
          </p>

          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-zinc-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr>
                  <th className="px-4 py-2 border-b font-semibold text-zinc-600 uppercase">Arquivo</th>
                  <th className="px-4 py-2 border-b font-semibold text-zinc-600 uppercase">Nº</th>
                  <th className="px-4 py-2 border-b font-semibold text-zinc-600 uppercase">Tomador</th>
                  <th className="px-4 py-2 border-b font-semibold text-zinc-600 uppercase text-right">Valor</th>
                  <th className="px-4 py-2 border-b w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pendingInvoices.map((inv, idx) => (
                  <tr key={idx} className={inv.status === 'error' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-zinc-500 italic max-w-[150px] truncate" title={inv.fileName}>
                      {inv.fileName}
                    </td>
                    <td className="px-4 py-3 font-mono">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      {inv.status === 'error' ? (
                        <span className="text-red-600 font-medium">{inv.message}</span>
                      ) : (
                        <div>
                          <div className="font-medium text-zinc-800">{inv.payerName}</div>
                          <div className="text-zinc-500">{inv.payerCNPJ}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {inv.status !== 'error' && `R$ ${inv.totalAmount.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isImporting && (
                        <button 
                          onClick={() => removePending(idx)}
                          className="text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
            <Button 
              variant="outline" 
              onClick={() => setIsModalOpen(false)}
              disabled={isImporting}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveImport}
              disabled={isImporting || pendingInvoices.filter(i => i.status === 'pending').length === 0}
              className="min-w-[140px]"
            >
              {isImporting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  Importando...
                </span>
              ) : (
                'Confirmar Importação'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NfsePage;
