import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

export const fmt      = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
export const fmtShort = (v: number) => v.toLocaleString('pt-BR');

export function getTrendIcon(current: number, previous: number) {
  if (previous === 0) return React.createElement(Minus, { size: 12, className: 'text-zinc-400' });
  const pct = ((current - previous) / previous) * 100;
  if (pct > 0) return React.createElement(ArrowUp,   { size: 12, className: 'text-emerald-500' });
  if (pct < 0) return React.createElement(ArrowDown, { size: 12, className: 'text-red-500' });
  return React.createElement(Minus, { size: 12, className: 'text-zinc-400' });
}

export function getTrendText(current: number, previous: number) {
  if (previous === 0) return null;
  const pct   = ((current - previous) / previous) * 100;
  const color = pct > 0 ? 'text-emerald-500' : pct < 0 ? 'text-red-500' : 'text-zinc-400';
  return React.createElement(
    'span',
    { className: cn('text-[10px] font-bold', color) },
    `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs mês ant.`
  );
}

export const MODALITY_COLORS = ['#1a365d', '#d4af37'];
export const CHART_COLORS    = ['#1a365d', '#d4af37', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];
