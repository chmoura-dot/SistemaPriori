import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { api } from '../services/api'; // Importar API para interações com o Supabase

const NfsePage = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState({
    issueDate: '',
    payerName: '',
    payerCNPJ: '',
    totalAmount: 0,
    description: '',
  });

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.createInvoice({
        issueDate: invoiceData.issueDate,
        payer: invoiceData.payerName,
        payerCNPJ: invoiceData.payerCNPJ,
        totalAmount: invoiceData.totalAmount,
        description: invoiceData.description,
      });
      console.log('Nota fiscal criada:', response);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Erro ao criar nota fiscal:', error);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Emissão de Notas Fiscais</h1>
      <Button onClick={() => setIsModalOpen(true)}>Criar Nota Fiscal</Button>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Criar Nota Fiscal">
        <form onSubmit={handleCreateInvoice}>
          <Input
            label="Data de Emissão"
            type="date"
            value={invoiceData.issueDate}
            onChange={(e) => setInvoiceData({ ...invoiceData, issueDate: e.target.value })}
            required
          />
          <Input
            label="Nome do Tomador"
            value={invoiceData.payerName}
            onChange={(e) => setInvoiceData({ ...invoiceData, payerName: e.target.value })}
            required
          />
          <Input
            label="Tomador (CPF/CNPJ)"
            value={invoiceData.payerCNPJ}
            onChange={(e) => setInvoiceData({ ...invoiceData, payerCNPJ: e.target.value })}
            required
          />
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
          <Button type="submit">Emitir Nota Fiscal</Button>
        </form>
      </Modal>
    </div>
  );
};

export default NfsePage;