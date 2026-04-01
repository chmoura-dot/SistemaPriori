import React, { useEffect, useState, useRef } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { api } from '../services/api';
import { Upload, FileText, X, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configura o worker do pdfjs via CDN para evitar problemas de bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

// Formata data ISO (YYYY-MM-DD) para dd/MM/yyyy
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Converte data dd/MM/yyyy para YYYY-MM-DD
const parseBrDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
};

// Extrai texto de todas as páginas de um PDF
const extractPdfText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }
  return fullText;
};

// Parseia o texto extraído do PDF no padrão DANFS-e (Prefeitura de Niterói / padrão nacional)
const parseDanfseText = (text: string, fileName: string): PendingInvoice => {
  // Remove espaços extras e normaliza o texto para facilitar os regex
  const t = text.replace(/\s+/g, ' ').trim();

  // ── Número da NFS-e ──────────────────────────────────────────────────────
  // Padrão: "Número da NFS-e 26" ou "NúmerodaNFS-e 26"
  const invoiceNumberMatch =
    t.match(/N[úu]mero\s*da\s*NFS-?e\s+(\d+)/i) ||
    t.match(/NFS-?e\s+N[ºo°]?\s*(\d+)/i);
  const invoiceNumber = invoiceNumberMatch ? invoiceNumberMatch[1] : '';

  // ── Data de Emissão ───────────────────────────────────────────────────────
  // Padrão: "Data e Hora da emissão da NFS-e 03/02/2026 17:34:51"
  const issueDateMatch =
    t.match(/Data\s*e\s*Hora\s*da\s*emiss[aã]o\s*da\s*NFS-?e\s+(\d{2}\/\d{2}\/\d{4})/i) ||
    t.match(/Compet[eê]ncia\s*da\s*NFS-?e\s+(\d{2}\/\d{2}\/\d{4})/i) ||
    t.match(/Data\s*de\s*Emiss[aã]o\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const issueDateBr = issueDateMatch ? issueDateMatch[1] : '';
  const issueDate = parseBrDate(issueDateBr);

  // ── CNPJ/CPF do Tomador ───────────────────────────────────────────────────
  // O tomador vem DEPOIS do emitente no documento. Estratégia: pegar todos os CNPJs/CPFs
  // e usar o segundo (o primeiro é do emitente, o segundo é do tomador)
  const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
  const cpfPattern = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;
  const allCnpjs = t.match(cnpjPattern) || [];
  const allCpfs = t.match(cpfPattern) || [];
  const allDocs = [...allCnpjs, ...allCpfs];
  // O tomador é o segundo documento encontrado (o primeiro é do prestador/emitente)
  const payerCNPJ = allDocs.length >= 2 ? allDocs[1] : (allDocs[0] || '');

  // ── Nome do Tomador ───────────────────────────────────────────────────────
  // Padrão: "TOMADOR DO SERVIÇO ... CNPJ/CPF/NIF 39.427.632/0001-71 ... Nome/NomeEmpresarial ASSOCIACAO PETROBRAS..."
  // Estratégia: pegar o texto após o CNPJ do tomador até a próxima seção
  let payerName = '';
  if (payerCNPJ) {
    const escapedCnpj = payerCNPJ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Tenta pegar o nome após o CNPJ do tomador
    const afterCnpj = t.split(escapedCnpj)[1] || '';
    // O nome vem após "Nome/ NomeEmpresarial" ou diretamente após o CNPJ
    const nameMatch =
      afterCnpj.match(/Nome\s*\/?\s*Nome\s*Empresarial\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s\-\.\/]+?)(?:\s+E-mail|\s+Endere[çc]o|\s+Munic[íi]pio|\s+CEP)/i) ||
      afterCnpj.match(/^[\s\-]*([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s\-\.\/]{5,80}?)(?:\s+E-mail|\s+Endere[çc]o|\s+Munic[íi]pio)/i);
    if (nameMatch) {
      payerName = nameMatch[1].trim();
    }
  }

  // Fallback: busca direta por "TOMADOR DO SERVIÇO" e pega o nome
  if (!payerName) {
    const tomadorMatch = t.match(/TOMADOR\s*DO\s*SERVI[ÇC]O[\s\S]{0,300}?Nome\s*\/?\s*Nome\s*Empresarial\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s\-\.\/]+?)(?:\s+E-mail|\s+Endere[çc]o|\s+Munic[íi]pio|\s+CEP)/i);
    if (tomadorMatch) payerName = tomadorMatch[1].trim();
  }

  // ── Valor do Serviço ──────────────────────────────────────────────────────
  // Padrão: "Valor do Serviço R$ 25.705,41" ou "Valor Líquido da NFS-e R$ 25.705,41"
  const valorMatch =
    t.match(/Valor\s*L[íi]quido\s*da\s*NFS-?e\s+R\$\s*([\d.,]+)/i) ||
    t.match(/VALOR\s*TOTAL\s*DA\s*NFS-?E[\s\S]{0,100}?Valor\s*do\s*Servi[çc]o\s+R\$\s*([\d.,]+)/i) ||
    t.match(/Valor\s*do\s*Servi[çc]o\s+R\$\s*([\d.,]+)/i);
  let totalAmount = 0;
  if (valorMatch) {
    // Converte "25.705,41" → 25705.41
    const raw = valorMatch[1].replace(/\./g, '').replace(',', '.');
    totalAmount = parseFloat(raw) || 0;
  }

  // ── Descrição do Serviço ──────────────────────────────────────────────────
  const descMatch = t.match(/Descri[çc][aã]o\s*do\s*Servi[çc]o\s+(.+?)(?:\s+TRIBUTA[ÇC][AÃ]O|\s+Valor\s*do\s*Servi[çc]o|\s+C[óo]digo\s*de\s*Tributa[çc][aã]o)/i);
  const description = descMatch ? descMatch[1].trim() : '';

  // ── Validação ─────────────────────────────────────────────────────────────
  if (!invoiceNumber || !payerCNPJ) {
    throw new Error('Não foi possível identificar o número da nota ou o CNPJ do tomador. Verifique se o PDF é uma NFS-e válida.');
  }

  return {
    invoiceNumber,
    issueDate,
    payerName,
    payerCNPJ,
    totalAmount,
    description,
    fileName,
    status: 'pending',
  };
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
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Auto-dismiss da mensagem de sucesso após 5 segundos
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
  };

  const processFiles = async (files: File[]) => {
    const newPending: PendingInvoice[] = [];
    setErrorMessage(null);

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        continue;
      }

      try {
        const text = await extractPdfText(file);
        const parsed = parseDanfseText(text, file.name);
        newPending.push(parsed);
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
          message: err.message || 'Erro ao processar PDF',
        });
      }
    }

    setPendingInvoices(prev => [...prev, ...newPending]);
    if (newPending.length > 0) setIsModalOpen(true);
    
    // Limpa o input para permitir selecionar o mesmo arquivo novamente
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
        description: inv.description,
      })));

      if (result.success) {
        showSuccess(`${result.importedCount} nota(s) importada(s) com sucesso!`);
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

  const handleDeleteInvoice = async (inv: NfseInvoice) => {
    if (!confirm(`Deseja excluir a nota Nº ${inv.invoiceNumber} (${inv.payer?.nome || '-'})? Esta ação não pode ser desfeita.`)) return;

    try {
      await api.deleteInvoice(inv.id);
      showSuccess(`Nota Nº ${inv.invoiceNumber} excluída com sucesso.`);
      fetchInvoices();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao excluir nota fiscal.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-priori-navy">Notas Fiscais (NFS-e)</h1>
          <p className="text-sm text-zinc-500">Importe seus arquivos PDF da NFS-e para sincronizar o financeiro.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf"
            multiple
            className="hidden"
          />
          <Button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-priori-gold hover:bg-priori-gold/90 text-priori-navy border-none"
          >
            <Upload size={18} />
            Importar PDF
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
                <p className="text-sm">Clique em "Importar PDF" para começar.</p>
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
                  <th className="px-6 py-3 border-b border-zinc-200 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-zinc-700">{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 text-zinc-600">{formatDate(inv.issueDate)}</td>
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
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteInvoice(inv)}
                        title="Excluir nota"
                        className="text-zinc-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </button>
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
            Confira os dados extraídos dos PDFs antes de confirmar a importação.
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
                          <div className="font-medium text-zinc-800">{inv.payerName || '—'}</div>
                          <div className="text-zinc-500">{inv.payerCNPJ}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {inv.status !== 'error' && `R$ ${inv.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
