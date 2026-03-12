import React from 'react';
import { cn } from '../lib/utils';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const Input = ({ label, error, className, ...props }: InputProps) => {
  return (
    <div className="w-full space-y-1.5">
      {label && <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</label>}
      <input
        className={cn(
          'w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy transition-all',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
