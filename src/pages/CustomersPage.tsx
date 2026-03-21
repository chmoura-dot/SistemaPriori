import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, MoreVertical, Edit2, Trash2, Mail, Phone, User, UserX, UserCheck, TrendingUp, Check, AlertCircle, FileUp, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import { Customer, CustomerStatus, HealthPlan, Psychologist, UserRole, InactivationReason, ParticularBillingType } from '../services/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';
import { calcRepass } from '../lib/repassRules';

export const CustomersPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const user = api.getCurrentUser();
  const [bulkData, setBulkData] = useState({
    amount: 0,
    adjustPrice: true,
    adjustRepass: true,
    selectedCustomerIds: [] as string[]
  });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null);
  const [isInactivationModalOpen, setIsInactivationModalOpen] = useState(false);
  const [customerToInactivate, setCustomerToInactivate] = useState<Customer | null>(null);
  const [selectedInactivationReason, setSelectedInactivationReason] = useState<InactivationReason | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    healthPlan: HealthPlan.PARTICULAR,
    psychologistId: psychologists[0]?.id || '',
    status: CustomerStatus.ACTIVE,
    notes: '',
    customPrice: undefined as number | undefined,
    customRepassAmount: undefined as number | undefined,
    particularBillingType: ParticularBillingType.SESSION,
    birthDate: '',
    amsPassword: '',
    amsPasswordExpiry: ''
  });

  // Autocomplete/Duplicate check state
  const similarCustomers = useMemo(() => {
    if (editingCustomer || !formData.name || formData.name.length < 3) return [];
    
    const search = formData.name.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(search) || 
      search.includes(c.name.toLowerCase())
    );
  }, [formData.name, customers, editingCustomer]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [c, p] = await Promise.all([
        api.getCustomers(),
        api.getPsychologists()
      ]);
      setCustomers(c || []);
      setPsychologists(p || []);
      
      // Verificar se há uma conversão pendente da Fila de Espera
      const pendingConversion = localStorage.getItem('pending_conversion');
      if (pendingConversion) {
        try {
          const data = JSON.parse(pendingConversion);
          setFormData(prev => ({
            ...prev,
            name: data.name || '',
            phone: data.phone || '',
            psychologistId: data.psychologistId || p[0]?.id || ''
          }));
          setIsModalOpen(true);
          localStorage.removeItem('pending_conversion');
        } catch (e) {}
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar a página de pacientes: ' + (error.message || 'Erro desconhecido. Tente recarregar a página.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calcular repasse automaticamente
  useEffect(() => {
    if (formData.healthPlan === HealthPlan.PARTICULAR && formData.customPrice) {
      const psychologist = psychologists.find(p => p.id === formData.psychologistId);
      const calculatedRepass = calcRepass(formData.customPrice, psychologist);
      
      if (calculatedRepass !== formData.customRepassAmount) {
        setFormData(prev => ({ ...prev, customRepassAmount: calculatedRepass }));
      }
    }
  }, [formData.customPrice, formData.psychologistId, formData.healthPlan, psychologists]);

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name || '',
        phone: customer.phone || '',
        healthPlan: customer.healthPlan || HealthPlan.PARTICULAR,
        psychologistId: customer.psychologistId || '',
        status: customer.status,
        notes: customer.notes || '',
        customPrice: customer.customPrice,
        customRepassAmount: customer.customRepassAmount,
        particularBillingType: customer.particularBillingType || ParticularBillingType.SESSION,
        birthDate: customer.birthDate || '',
        amsPassword: customer.amsPassword || '',
        amsPasswordExpiry: customer.amsPasswordExpiry || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        healthPlan: HealthPlan.PARTICULAR,
        psychologistId: psychologists[0]?.id || '',
        status: CustomerStatus.ACTIVE,
        notes: '',
        customPrice: undefined,
        customRepassAmount: undefined,
        particularBillingType: ParticularBillingType.SESSION,
        birthDate: '',
        amsPassword: '',
        amsPasswordExpiry: ''
      });
    }
    setIsModalOpen(true);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Nome': 'Nome do Paciente',
        'Telefone': '(11) 99999-9999',
        'Plano': 'Particular',
        'Psicólogo': psychologists[0]?.name || 'Psicólogo Principal',
        'Nascimento': '15-05-1990'
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
    XLSX.writeFile(wb, 'modelo_importacao_pacientes.xlsx');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        let successCount = 0;
        const errorList: string[] = [];

        for (const row of data) {
          try {
            const nome = row['Nome'] || row['nome'];
            const telefone = row['Telefone'] || row['telefone'] || '';
            const planoStr = row['Plano'] || row['plano'] || 'Particular';
            const psiNome = row['Psicólogo'] || row['psicólogo'] || row['Psicologo'] || row['psicologo'];
            const nascimento = row['Nascimento'] || row['nascimento'] || row['Data de Nascimento'] || row['data_nascimento'];

            if (!nome) {
              errorList.push(`Linha ignorada: Nome não encontrado.`);
              continue;
            }

            // Find psychologist by name or use the first one
            const psychologist = psychologists.find(p => 
              p.name.toLowerCase().includes(psiNome?.toLowerCase() || '')
            ) || psychologists[0];

            // Normalize HealthPlan
            let healthPlan = HealthPlan.PARTICULAR;
            const pLower = (planoStr || '').toString().toLowerCase();
            if (pLower.includes('petrobras')) healthPlan = HealthPlan.AMS_PETROBRAS;
            else if (pLower.includes('medsenior')) healthPlan = HealthPlan.MEDSENIOR;
            else if (pLower.includes('porto') || pLower.includes('porto saude')) healthPlan = HealthPlan.PORTO_SAUDE;
            else if (pLower.includes('gama')) healthPlan = HealthPlan.GAMA;
            else if (pLower.includes('caixa')) healthPlan = HealthPlan.SAUDE_CAIXA;
            else if (pLower.includes('ita') || pLower.includes('funda')) healthPlan = HealthPlan.FUNDACAO_SAUDE;

            const parseExcelDate = (val: any): string | undefined => {
              if (!val) return undefined;
              if (typeof val === 'number') {
                return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString().split('T')[0];
              }
              const s = val.toString().trim();
              const brMatch = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
              if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
              if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.split(' ')[0];
              return undefined;
            };

            await api.createCustomer({
              name: nome,
              email: `${nome.toLowerCase().replace(/\s+/g, '.')}@exemplo.com`, // Required field
              phone: telefone.toString(),
              healthPlan,
              psychologistId: psychologist?.id || '',
              status: CustomerStatus.ACTIVE,
              birthDate: parseExcelDate(nascimento),
              notes: 'Importado via Excel'
            });
            successCount++;
          } catch (err: any) {
            errorList.push(`Erro ao importar ${row['Nome'] || 'Registro'}: ${err.message}`);
          }
        }

        setImportResults({ success: successCount, errors: errorList });
        await loadData();
      } catch (err: any) {
        alert('Erro ao processar arquivo: ' + err.message);
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleOpenBulkModal = () => {
    const particularWithCustom = customers.filter(c => 
      c.healthPlan === HealthPlan.PARTICULAR && 
      (c.customPrice !== undefined || c.customRepassAmount !== undefined)
    );
    setBulkData({
      amount: 0,
      adjustPrice: true,
      adjustRepass: true,
      selectedCustomerIds: particularWithCustom.map(c => c.id)
    });
    setIsBulkModalOpen(true);
  };

  const handleBulkAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const customersToUpdate = customers.filter(c => bulkData.selectedCustomerIds.includes(c.id));
      
      await Promise.all(customersToUpdate.map(customer => {
        const updates: Partial<Customer> = {};
        if (bulkData.adjustPrice && customer.customPrice !== undefined) {
          updates.customPrice = customer.customPrice + bulkData.amount;
        }
        if (bulkData.adjustRepass && customer.customRepassAmount !== undefined) {
          updates.customRepassAmount = customer.customRepassAmount + bulkData.amount;
        }
        return api.updateCustomer(customer.id, updates);
      }));

      await loadData();
      setIsBulkModalOpen(false);
    } catch (error) {
      alert('Erro ao aplicar reajuste');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const submissionData = {
      ...formData,
      name: (formData.name || '').toUpperCase(),
      birthDate: formData.birthDate || null,
      amsPassword: formData.amsPassword || null,
      amsPasswordExpiry: formData.amsPasswordExpiry || null,
      customPrice: formData.customPrice !== undefined ? Number(formData.customPrice) : null,
      customRepassAmount: formData.customRepassAmount !== undefined ? Number(formData.customRepassAmount) : null
    };

    try {
      console.log('Dados sendo enviados:', submissionData);
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, submissionData);
      } else {
        await api.createCustomer(submissionData);
      }
      await loadData();
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Erro detalhado ao salvar paciente:', error);
      alert('Erro ao salvar paciente: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
      if (confirm('Tem certeza que deseja excluir este paciente?')) {
        await api.deleteCustomer(id);
        await loadData();
      }
  };

  const handleToggleStatus = async (customer: Customer) => {
    if (customer.status === CustomerStatus.ACTIVE) {
      setCustomerToInactivate(customer);
      setSelectedInactivationReason(null);
      setIsInactivationModalOpen(true);
    } else {
      try {
        await api.updateCustomer(customer.id, { status: CustomerStatus.ACTIVE, inactivationReason: undefined });
        await loadData();
      } catch (error) {
        alert('Erro ao ativar paciente');
      }
    }
  };

  const confirmInactivation = async () => {
    if (!customerToInactivate || !selectedInactivationReason) return;
    
    setIsSaving(true);
    try {
      await api.updateCustomer(customerToInactivate.id, { 
        status: CustomerStatus.INACTIVE, 
        inactivationReason: selectedInactivationReason 
      });
      await loadData();
      setIsInactivationModalOpen(false);
      setCustomerToInactivate(null);
    } catch (error) {
      alert('Erro ao desativar paciente');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const searchLower = String(searchTerm || '').toLowerCase();
    const nameMatch = String(c.name || '').toLowerCase().includes(searchLower);
    const phoneMatch = String(c.phone || '').toLowerCase().includes(searchLower);
    const planMatch = String(c.healthPlan || '').toLowerCase().includes(searchLower);
    const matchesSearch = nameMatch || phoneMatch || planMatch;
    
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && c.status === CustomerStatus.ACTIVE) ||
                         (statusFilter === 'inactive' && c.status === CustomerStatus.INACTIVE);
    
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return dateStr.split('-').reverse().join('/');
  };

  const calculateClincTime = (firstDate?: string, createdAt?: string) => {
    const start = firstDate ? new Date(firstDate) : (createdAt ? new Date(createdAt) : new Date());
    const now = new Date();
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    
    if (months < 0) {
      years--;
      months += 12;
    }
    
    if (years > 0) {
      return `${years} ${years === 1 ? 'ano' : 'anos'}${months > 0 ? ` e ${months} ${months === 1 ? 'mês' : 'meses'}` : ''}`;
    }
    return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Pacientes</h2>
          <p className="text-zinc-500">Gerencie os pacientes da clínica.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)} className="flex-1 sm:flex-none border-zinc-100 text-priori-navy hover:bg-zinc-50">
            <FileUp size={20} className="mr-2 text-priori-navy" />
            Importar Excel
          </Button>
          <Button variant="outline" onClick={handleOpenBulkModal} className="flex-1 sm:flex-none border-zinc-100 text-priori-navy hover:bg-zinc-50">
            <TrendingUp size={20} className="mr-2 text-priori-gold" />
            Reajuste Particular
          </Button>
          <Button onClick={() => handleOpenModal()} className="flex-1 sm:flex-none bg-priori-navy hover:bg-priori-navy/90 text-white">
            <Plus size={20} className="mr-2" />
            Novo Paciente
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou plano..."
            className="w-full bg-white border border-zinc-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex bg-zinc-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('active')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              statusFilter === 'active' ? "bg-white text-priori-navy shadow-sm" : "text-zinc-500 hover:text-priori-navy"
            )}
          >
            Ativos
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              statusFilter === 'inactive' ? "bg-white text-priori-navy shadow-sm" : "text-zinc-500 hover:text-priori-navy"
            )}
          >
            Inativos
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              statusFilter === 'all' ? "bg-white text-priori-navy shadow-sm" : "text-zinc-500 hover:text-priori-navy"
            )}
          >
            Todos
          </button>
        </div>
      </div>

      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Paciente / Tempo</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Última / Próxima</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Sessões</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Plano / Profissional</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-priori-navy border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : filteredCustomers.map((customer) => {
                const psy = psychologists.find(p => p.id === customer.psychologistId);
                return (
                  <tr key={customer.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 border border-zinc-100 shrink-0">
                          <User size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-priori-navy truncate">{customer.name}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                              <Phone size={10} />
                              {customer.phone}
                            </span>
                            <span className="text-[10px] text-priori-gold font-bold uppercase tracking-wider">
                              {calculateClincTime(customer.firstAppointmentDate, customer.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 uppercase font-bold w-12">L: {formatDate(customer.lastAppointmentDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-priori-navy uppercase font-bold w-12">P: {formatDate(customer.nextAppointmentDate)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="px-2 py-0.5 bg-priori-navy/5 border border-priori-navy/10 rounded text-xs font-bold text-priori-navy">
                          {customer.totalAppointmentsPerformed || 0}
                        </div>
                        <span className="text-[10px] text-zinc-400 uppercase font-medium">Sessões</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="min-w-30">
                        <p className="text-[11px] font-bold text-priori-navy truncate uppercase tracking-tight">{customer.healthPlan || 'Não informado'}</p>
                        <p className="text-[10px] text-priori-gold font-bold truncate uppercase">{psy?.name || 'Não atribuído'}</p>
                        <span className={cn(
                          "inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          customer.status === CustomerStatus.ACTIVE 
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                            : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                        )}>
                          {customer.status === CustomerStatus.ACTIVE ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleToggleStatus(customer)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            customer.status === CustomerStatus.ACTIVE 
                              ? "text-zinc-400 hover:text-amber-500 hover:bg-amber-500/5" 
                              : "text-zinc-400 hover:text-priori-gold hover:bg-priori-gold/5"
                          )}
                          title={customer.status === CustomerStatus.ACTIVE ? "Desativar Paciente" : "Ativar Paciente"}
                        >
                          {customer.status === CustomerStatus.ACTIVE ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                        <button 
                          onClick={() => handleOpenModal(customer)}
                          className="p-2 text-zinc-400 hover:text-priori-navy hover:bg-priori-navy/5 rounded-lg transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(customer.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Editar Paciente' : 'Novo Paciente'}
        footer={
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              form="customer-form"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
            >
              {editingCustomer ? 'Salvar Alterações' : 'Criar Paciente'}
            </Button>
          </div>
        }
      >
        <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2 relative">
              <Input
                label="Nome Completo"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                required
              />
              
              {similarCustomers.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-2 animate-in fade-in zoom-in duration-200">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertCircle size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Atenção: Possível Paciente Duplicado</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {similarCustomers.slice(0, 3).map(c => (
                      <div key={c.id} className="flex items-center justify-between bg-white/50 p-2 rounded-lg border border-amber-200/50">
                        <span className="text-xs font-bold text-priori-navy">{c.name}</span>
                        <span className={cn(
                          "text-[8px] font-black uppercase px-1.5 py-0.5 rounded border",
                          c.status === CustomerStatus.ACTIVE 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                            : "bg-zinc-100 text-zinc-500 border-zinc-200"
                        )}>
                          {c.status === CustomerStatus.ACTIVE ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    ))}
                    {similarCustomers.length > 3 && (
                      <p className="text-[9px] text-amber-600 text-center font-medium italic">+ {similarCustomers.length - 3} outros nomes similares</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <Input
              label="Telefone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="(00) 00000-0000"
            />
            <Input
              label="Data de Nascimento"
              type="date"
              value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
            />
          </div>
          
          {(formData.healthPlan === HealthPlan.AMS_PETROBRAS || (formData.healthPlan && formData.healthPlan.toString().toUpperCase().includes('PETROBRAS'))) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#004b32]/5 border border-[#004b32]/10 rounded-xl">
              <div className="col-span-full mb-1">
                <h4 className="text-[10px] font-bold text-[#004b32] uppercase tracking-widest">Informações AMS Petrobras</h4>
              </div>
              <Input
                label="Senha do Portal"
                value={formData.amsPassword}
                onChange={(e) => setFormData({ ...formData, amsPassword: e.target.value })}
                placeholder="Digite a senha do portal"
              />
              <Input
                label="Vencimento da Senha"
                type="date"
                value={formData.amsPasswordExpiry}
                onChange={(e) => setFormData({ ...formData, amsPasswordExpiry: e.target.value })}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Plano de Saúde</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-100 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
                value={formData.healthPlan}
                onChange={(e) => setFormData({ ...formData, healthPlan: e.target.value as HealthPlan })}
              >
                {Object.values(HealthPlan).map(plan => (
                  <option key={plan} value={plan}>{plan}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Psicólogo Responsável</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-100 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all"
                value={formData.psychologistId}
                onChange={(e) => setFormData({ ...formData, psychologistId: e.target.value })}
              >
                {psychologists.map(psy => (
                  <option key={psy.id} value={psy.id}>{psy.name}</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const isAdmin = user?.role === UserRole.ADMIN;
            const canSeeValues = formData.healthPlan === HealthPlan.PARTICULAR && isAdmin;
            if (canSeeValues) {
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-priori-gold/5 border border-priori-gold/10 rounded-xl">
                  <div className="col-span-full space-y-1.5 mb-2">
                    <label className="text-xs font-medium text-priori-gold uppercase tracking-wider">Tipo de Cobrança</label>
                    <div className="flex gap-4">
                      {Object.values(ParticularBillingType).map((type) => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="radio"
                            name="billingType"
                            className="w-4 h-4 text-priori-gold focus:ring-priori-gold border-zinc-300"
                            checked={formData.particularBillingType === type}
                            onChange={() => setFormData({ ...formData, particularBillingType: type })}
                          />
                          <span className="text-sm text-priori-navy font-medium group-hover:text-priori-gold transition-colors">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Input
                    label={formData.particularBillingType === ParticularBillingType.PACKAGE ? "Valor do Pacote (R$)" : "Valor da Consulta (R$)"}
                    type="number"
                    step="0.01"
                    value={formData.customPrice || ''}
                    onChange={(e) => setFormData({ ...formData, customPrice: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Ex: 150"
                  />
                  <Input
                    label="Valor do Repasse (R$)"
                    type="number"
                    step="0.01"
                    value={formData.customRepassAmount || ''}
                    readOnly
                    placeholder="Calculado automaticamente..."
                    className="bg-zinc-50 cursor-not-allowed opacity-80"
                  />
                  <p className="col-span-full text-[10px] text-priori-gold font-medium uppercase tracking-wider">
                    * {formData.healthPlan === HealthPlan.PARTICULAR ? 'Valores específicos para este paciente particular' : 'Sobrescrita de valor do plano (Admin)'}
                  </p>
                </div>
              );
            }
            return null;
          })()}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Notas</label>
            <textarea
              className="w-full rounded-lg bg-white border border-zinc-100 px-4 py-2.5 text-sm text-priori-navy placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all min-h-[80px]"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Observações sobre o paciente..."
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Reajuste de Taxas Particulares"
        footer={
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => setIsBulkModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              form="bulk-adjustment-form"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
              disabled={bulkData.selectedCustomerIds.length === 0 || bulkData.amount === 0}
            >
              Aplicar Reajuste
            </Button>
          </div>
        }
      >
        <form id="bulk-adjustment-form" onSubmit={handleBulkAdjustment} className="space-y-6">
          <div className="bg-priori-gold/5 border border-priori-gold/10 p-4 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-priori-gold rounded-lg text-white">
                <TrendingUp size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-priori-navy">Ajuste de Valor Fixo</h4>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Adicione um valor fixo aos valores negociados</p>
              </div>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg flex items-start gap-3">
              <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                <span className="font-bold text-amber-600 uppercase">Atenção:</span> Este reajuste será aplicado apenas em **novos agendamentos** realizados a partir de agora. Agendamentos já existentes (passados ou futuros) manterão os valores originais de quando foram marcados.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  label="Valor do Aumento (R$)"
                  type="number"
                  step="0.01"
                  value={bulkData.amount}
                  onChange={(e) => setBulkData({ ...bulkData, amount: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="flex flex-col gap-2 pt-5">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-all",
                    bulkData.adjustPrice ? "bg-priori-navy border-priori-navy" : "border-zinc-200 bg-white"
                  )} onClick={() => setBulkData({ ...bulkData, adjustPrice: !bulkData.adjustPrice })}>
                    {bulkData.adjustPrice && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Preço</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-all",
                    bulkData.adjustRepass ? "bg-priori-navy border-priori-navy" : "border-zinc-200 bg-white"
                  )} onClick={() => setBulkData({ ...bulkData, adjustRepass: !bulkData.adjustRepass })}>
                    {bulkData.adjustRepass && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Repasse</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pacientes a Reajustar</label>
            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {customers.filter(c => c.healthPlan === HealthPlan.PARTICULAR && (c.customPrice !== undefined || c.customRepassAmount !== undefined)).map(customer => (
                <div 
                  key={customer.id}
                  onClick={() => {
                    const newIds = bulkData.selectedCustomerIds.includes(customer.id)
                      ? bulkData.selectedCustomerIds.filter(id => id !== customer.id)
                      : [...bulkData.selectedCustomerIds, customer.id];
                    setBulkData({ ...bulkData, selectedCustomerIds: newIds });
                  }}
                  className={cn(
                    "p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                    bulkData.selectedCustomerIds.includes(customer.id)
                      ? "bg-priori-navy/5 border-priori-navy/30 text-priori-navy"
                      : "bg-white border-zinc-100 text-zinc-500 hover:border-priori-gold/30"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">{customer.name}</span>
                    <span className="text-[10px] opacity-70">
                      Atual: R$ {(customer.customPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {(customer.customRepassAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {bulkData.selectedCustomerIds.includes(customer.id) && <Check size={14} className="text-priori-gold" />}
                </div>
              ))}
              {customers.filter(c => c.healthPlan === HealthPlan.PARTICULAR && (c.customPrice !== undefined || c.customRepassAmount !== undefined)).length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">Nenhum paciente particular com valor customizado encontrado.</p>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportResults(null);
        }}
        title="Importar Pacientes via Excel"
        footer={
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => {
                setIsImportModalOpen(false);
                setImportResults(null);
              }}
            >
              Fechar
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {!importResults ? (
            <>
              <div className="bg-priori-navy/5 border border-priori-navy/10 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-priori-navy rounded-lg text-white">
                    <FileUp size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-priori-navy">Instruções de Importação</h4>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Siga o modelo para evitar erros</p>
                  </div>
                </div>
                <ul className="text-xs text-zinc-600 space-y-1 ml-1">
                  <li className="flex items-center gap-2">• As colunas obrigatórias são: <span className="font-bold text-priori-navy">Nome, Telefone, Plano, Psicólogo</span>.</li>
                  <li className="flex items-center gap-2">• <span className="font-bold">Planos aceitos:</span> Particular, AMS Petrobras, Medsenior, Porto Seguro, Gama Saúde, Saúde Caixa, Fundação Saúde Itaú.</li>
                  <li className="flex items-center gap-2">• O nome do psicólogo deve ser igual ao cadastrado no sistema.</li>
                </ul>
                <button 
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-priori-gold hover:text-priori-gold/80 text-xs font-bold transition-colors"
                >
                  <Download size={14} />
                  Baixar Planilha Modelo
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="sr-only">Escolha o arquivo Excel</span>
                  <input 
                    type="file" 
                    accept=".xlsx, .xls"
                    onChange={handleImportExcel}
                    className="block w-full text-sm text-zinc-500
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-xl file:border-0
                      file:text-sm file:font-semibold
                      file:bg-priori-navy file:text-white
                      hover:file:bg-priori-navy/90
                      transition-all"
                  />
                </label>
                {isSaving && (
                  <div className="flex items-center justify-center gap-3 p-4 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-priori-navy border-t-transparent" />
                    <span className="text-xs font-medium text-priori-navy">Processando planilha e cadastrando pacientes...</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className={cn(
                "p-4 rounded-xl border flex flex-col items-center gap-2 text-center",
                importResults.errors.length === 0 ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
              )}>
                <div className={cn(
                  "p-3 rounded-full mb-2",
                  importResults.errors.length === 0 ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                )}>
                  {importResults.errors.length === 0 ? <Check size={24} /> : <AlertCircle size={24} />}
                </div>
                <h4 className="font-bold text-priori-navy">Importação Finalizada</h4>
                <p className="text-sm text-zinc-600">
                  <span className="font-bold text-emerald-600">{importResults.success}</span> pacientes cadastrados com sucesso.
                </p>
              </div>

              {importResults.errors.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle size={12} />
                    Erros Identificados ({importResults.errors.length})
                  </h5>
                  <div className="max-h-[150px] overflow-y-auto bg-red-50 border border-red-100 rounded-xl p-3 space-y-1 custom-scrollbar">
                    {importResults.errors.map((error, idx) => (
                      <p key={idx} className="text-[10px] text-red-700 leading-tight">• {error}</p>
                    ))}
                  </div>
                </div>
              )}
              
              <Button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportResults(null);
                }}
                className="w-full bg-priori-navy hover:bg-priori-navy/90 text-white mt-2"
              >
                Concluir
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isInactivationModalOpen}
        onClose={() => setIsInactivationModalOpen(false)}
        title="Motivo da Desativação"
        footer={
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => setIsInactivationModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={confirmInactivation}
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
              disabled={!selectedInactivationReason}
            >
              Confirmar Desativação
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Para desativar o paciente <span className="font-bold text-priori-navy">{customerToInactivate?.name}</span>, por favor selecione um motivo:
          </p>
          
          <div className="grid grid-cols-1 gap-2">
            {Object.values(InactivationReason).map((reason) => (
              <button
                key={reason}
                onClick={() => setSelectedInactivationReason(reason)}
                className={cn(
                  "p-4 rounded-xl border text-left transition-all",
                  selectedInactivationReason === reason
                    ? "bg-priori-navy/5 border-priori-navy/30 text-priori-navy font-bold"
                    : "bg-white border-zinc-100 text-zinc-500 hover:border-priori-gold/30"
                )}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
