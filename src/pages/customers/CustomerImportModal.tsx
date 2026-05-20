import React, { useState } from 'react';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { HealthPlan } from '../../services/types';

interface ImportPreviewRow {
  name: string;
  phone: string;
  healthPlan: HealthPlan;
  birthDate: string;
  error?: string;
}

interface CustomerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSaving: boolean;
  onImport: (rows: ImportPreviewRow[]) => void;
}

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
};

export const CustomerImportModal: React.FC<CustomerImportModalProps> = ({
  isOpen,
  onClose,
  isSaving,
  onImport,
}) => {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const handleClose = () => {
    setRawText('');
    setPreview([]);
    setStep('input');
    onClose();
  };

  const parsePlan = (raw: string): HealthPlan => {
    const u = raw.toUpperCase().trim();
    for (const plan of Object.values(HealthPlan)) {
      if (plan.toUpperCase().includes(u) || u.includes(plan.toUpperCase())) return plan;
    }
    return HealthPlan.PARTICULAR;
  };

  const handlePreview = () => {
    const lines = rawText.trim().split('\n').filter(l => l.trim());
    const rows: ImportPreviewRow[] = lines.map(line => {
      const cols = parseCSVLine(line);
      const name = cols[0]?.toUpperCase() || '';
      const phone = cols[1] || '';
      const healthPlan = parsePlan(cols[2] || 'PARTICULAR');
      const birthDate = cols[3] || '';
      const errors: string[] = [];
      if (!name) errors.push('Nome vazio');
      if (phone && phone.replace(/\D/g, '').length < 10) errors.push('Telefone inválido');
      return { name, phone, healthPlan, birthDate, error: errors.join('; ') || undefined };
    });
    setPreview(rows);
    setStep('preview');
  };

  const validRows = preview.filter(r => !r.error);
  const errorRows = preview.filter(r => r.error);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar Pacientes (CSV)">
      <div className="space-y-4">
        {step === 'input' ? (
          <>
            <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-xs text-zinc-600 space-y-1">
              <p className="font-bold text-zinc-700 uppercase tracking-widest">Formato esperado (CSV, uma linha por paciente):</p>
              <code className="block text-zinc-500">Nome,Telefone,Convênio,DataNasc</code>
              <code className="block text-zinc-500">JOAO DA SILVA,21999999999,PARTICULAR,1990-05-15</code>
              <p className="text-zinc-400 pt-1">Os campos Telefone, Convênio e DataNasc são opcionais.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                Cole o CSV aqui
              </label>
              <textarea
                className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 min-h-[200px] font-mono resize-none"
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder="NOME COMPLETO,TELEFONE,CONVENIO,DATA_NASC&#10;MARIA SILVA,21988887777,AMS PETROBRAS,1985-03-20"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handlePreview} disabled={!rawText.trim()} className="bg-priori-navy text-white">
                <Upload size={16} className="mr-2" /> Visualizar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4 p-3 bg-zinc-50 border border-zinc-100 rounded-xl">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 size={16} />
                <span className="text-sm font-bold">{validRows.length} válidos</span>
              </div>
              {errorRows.length > 0 && (
                <div className="flex items-center gap-2 text-red-500">
                  <AlertCircle size={16} />
                  <span className="text-sm font-bold">{errorRows.length} com erros</span>
                </div>
              )}
            </div>
            <div className="max-h-[280px] overflow-y-auto rounded-xl border border-zinc-100 divide-y divide-zinc-50">
              {preview.map((row, i) => (
                <div key={i} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${row.error ? 'bg-red-50' : 'bg-white'}`}>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-bold truncate ${row.error ? 'text-red-700' : 'text-priori-navy'}`}>{row.name || '(sem nome)'}</span>
                    <span className="text-[11px] text-zinc-400">{row.healthPlan} {row.phone && `· ${row.phone}`}</span>
                  </div>
                  {row.error && <span className="text-[10px] text-red-500 shrink-0">{row.error}</span>}
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep('input')}>← Voltar</Button>
              <Button
                onClick={() => onImport(validRows)}
                disabled={validRows.length === 0 || isSaving}
                className="bg-priori-navy text-white"
                isLoading={isSaving}
              >
                Importar {validRows.length} Paciente(s)
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
