import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { api } from '../services/api'; // Importar API para interações com o Supabase

const NfsePage = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState({
    period: '',
    payer: '',
    totalAmount: 0,
    description: '',
  });

  const handleCreateInvoice = async () => {
    // Lógica para criar a nota fiscal
    try {
      const response = await api.createInvoice(invoiceData);
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
            label="Período"
            value={invoiceData.period}
            onChange={(e) => setInvoiceData({ ...invoiceData, period: e.target.value })}
            required
          />
          <Input
            label="Tomador (CPF/CNPJ)"
            value={invoiceData.payer}
            onChange={(e) => setInvoiceData({ ...invoiceData, payer: e.target.value })}
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