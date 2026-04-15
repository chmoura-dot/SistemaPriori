import React, { useState, useEffect } from 'react';
import { KeyRound, Search, Clock, AlertTriangle, CheckCircle2, Edit2, Loader2, Calendar, User } from 'lucide-react';
import { api } from '../services/api';
import { Customer, HealthPlan, CustomerStatus } from '../services/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';

export const AmsPasswordsPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    amsPassword: '',
    amsPasswordExpiry: ''
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCustomers();
      // Filtrar apenas pacientes ativos dos planos AMS Petrobras e PAE
      const amsCustomers = data.filter(c => 
        (c.healthPlan === HealthPlan.AMS_PETROBRAS || 
         c.healthPlan === HealthPlan.PAE ||
         c.healthPlan.toString().toUpperCase().includes('PETROBRAS')) &&
        c.status === CustomerStatus.ACTIVE
      );
      
      // Ordenar por data de vencimento (mais próximas primeiro)
      const sorted = amsCustomers.sort((a, b) => {
        if (!a.amsPasswordExpiry) return 1;
        if (!b.amsPasswordExpiry) return -1;
        return a.amsPasswordExpiry.localeCompare(b.amsPasswordExpiry);
      });
      
      setCustomers(sorted);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      amsPassword: customer.amsPassword || '',
      amsPasswordExpiry: customer.amsPasswordExpiry || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    
    setIsSaving(true);
    try {
      await api.updateCustomer(editingCustomer.id, {
        amsPassword: formData.amsPassword,
        amsPasswordExpiry: formData.amsPasswordExpiry
      });
      await loadData();
      setIsModalOpen(false);
    } catch (error) {
      alert('Erro ao atualizar senha.');
    } finally {
      setIsSaving(false);
    }
  };

  const calculateCountdown = (expiryDate?: string) => {
    if (!expiryDate) return { text: 'Não definida', color: 'text-zinc-400', bg: 'bg-zinc-50', icon: Clock };
    
    const expiry = new Date(expiryDate + 'T12:00:00');
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'Expirada', color: 'text-red-600', bg: 'bg-red-50', icon: AlertTriangle, days: diffDays };
    if (diffDays === 0) return { text: 'Vence hoje!', color: 'text-red-600', bg: 'bg-red-50', icon: AlertTriangle, days: diffDays };
    if (diffDays <= 7) return { text: `Faltam ${diffDays} dias`, color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle, days: diffDays };
    
    return { text: `Faltam ${diffDays} dias`, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2, days: diffDays };
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Controle de Senhas AMS / PAE</h2>
          <p className="text-zinc-500">Gestão de vencimentos e renovação do portal AMS Petrobras e PAE.</p>
        </div>
        <div className="flex bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm items-center gap-6">
          <div className="flex flex-col items-center border-r border-zinc-100 pr-6">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total AMS/PAE</span>
            <span className="text-xl font-bold text-priori-navy">{customers.length}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Vencendo / Expiradas</span>
            <span className="text-xl font-bold text-red-600">
              {customers.filter(c => {
                const status = calculateCountdown(c.amsPasswordExpiry);
                return status.days !== undefined && status.days <= 7;
              }).length}
            </span>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
        <input
          type="text"
          placeholder="Buscar paciente pelo nome..."
          className="w-full bg-white border border-zinc-100 rounded-2xl pl-12 pr-4 py-3.5 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 transition-all shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
            <Loader2 size={32} className="animate-spin text-priori-navy" />
            <p className="text-sm font-medium">Carregando senhas...</p>
          </div>
        ) : filteredCustomers.map(customer => {
          const status = calculateCountdown(customer.amsPasswordExpiry);
          return (
            <div key={customer.id} className="bg-white rounded-[2rem] border border-zinc-100 p-6 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className={cn("p-3 rounded-2xl", status.bg)}>
                    <status.icon className={status.color} size={24} />
                  </div>
                  <button 
                    onClick={() => handleEdit(customer)}
                    className="p-2 text-zinc-300 hover:text-priori-navy hover:bg-zinc-50 rounded-xl transition-all"
                  >
                    <Edit2 size={18} />
                  </button>
                </div>
                
                <h3 className="text-base font-bold text-priori-navy uppercase tracking-tight line-clamp-1 mb-1">{customer.name}</h3>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-4">{customer.healthPlan}</p>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100/50">
                    <div className="flex items-center gap-2">
                      <KeyRound size={14} className="text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Senha:</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-priori-navy">{customer.amsPassword || 'Não informada'}</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100/50">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Vencimento:</span>
                    </div>
                    <span className="text-sm font-bold text-priori-navy">
                      {customer.amsPasswordExpiry ? new Date(customer.amsPasswordExpiry + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                    </span>
                  </div>
                </div>
              </div>

              <div className={cn("mt-6 p-3 rounded-2xl text-center border", status.bg, "border-black/5")}>
                <span className={cn("text-xs font-black uppercase tracking-widest", status.color)}>
                  {status.text}
                </span>
              </div>
            </div>
          );
        })}
        
        {!isLoading && filteredCustomers.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-400 text-center gap-3">
            <User size={48} className="opacity-20" />
            <div>
              <p className="text-lg font-bold">Nenhum paciente AMS ou PAE encontrado</p>
              <p className="text-sm opacity-60">Cadastre um paciente com o plano AMS ou PAE para vê-lo aqui.</p>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Atualizar Senha AMS / PAE"
        className="max-w-md"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button 
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90" 
              onClick={handleSubmit}
              isLoading={isSaving}
            >
              Salvar Nova Senha
            </Button>
          </div>
        }
      >
        <div className="space-y-6 py-2">
          <div className="flex items-center gap-4 p-4 bg-priori-navy/5 rounded-2xl border border-priori-navy/10">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-priori-navy border border-priori-navy/10 font-bold uppercase">
              {editingCustomer?.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-priori-navy uppercase">{editingCustomer?.name}</p>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Atualização de Acesso</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="Senha do Portal"
              value={formData.amsPassword}
              onChange={(e) => setFormData({ ...formData, amsPassword: e.target.value })}
              placeholder="Digite a nova senha"
            />
            <Input
              label="Data de Vencimento"
              type="date"
              value={formData.amsPasswordExpiry}
              onChange={(e) => setFormData({ ...formData, amsPasswordExpiry: e.target.value })}
            />
          </div>

          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
            <p className="text-[10px] text-amber-800 leading-relaxed font-medium uppercase tracking-tight">
              A atualização refletirá imediatamente no Dashboard e no controle diário de vencimentos da clínica.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
