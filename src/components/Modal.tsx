import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  persistent?: boolean;
}

export const Modal = ({ isOpen, onClose, title, children, footer, className, persistent }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        onClick={persistent ? undefined : onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <div
        className={cn(
          'relative w-full max-w-lg bg-white border border-zinc-100 shadow-2xl z-10 flex flex-col rounded-2xl overflow-hidden max-h-[90vh]',
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-priori-navy">{title}</h3>
          {!persistent && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-priori-navy transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>
        
        <div className="px-6 py-6 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
