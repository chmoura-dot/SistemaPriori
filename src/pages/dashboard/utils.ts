import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

export const fmt      = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
export const fmtShort = (v: number) => v.toLocaleString('pt-BR');

/**
 * Ícone de tendência (seta para cima, para baixo ou neutro).
 * @param invertColors — para métricas negativas (ex: cancelamentos, despesas), inverte vermelho↔verde.
 */
export function getTrendIcon(
  current: number,
  previous: number,
  invertColors?: boolean,
) {
  if (previous === 0) return React.createElement(Minus, { size: 12, className: 'text-zinc-400' });
  const pct = ((current - previous) / previous) * 100;
  const invert = invertColors ?? false;
  if (pct > 0) return React.createElement(ArrowUp,   { size: 12, className: invert ? 'text-red-500' : 'text-emerald-500' });
  if (pct < 0) return React.createElement(ArrowDown, { size: 12, className: invert ? 'text-emerald-500' : 'text-red-500' });
  return React.createElement(Minus, { size: 12, className: 'text-zinc-400' });
}

/**
 * Texto de tendência percentual ("+ X% vs período ant.").
 * @param options.invertColors — inverte cores para métricas negativas.
 * @param options.filterMode   — ajusta o rótulo ("vs mês ant." / "vs ano ant.").
 */
export function getTrendText(
  current: number,
  previous: number,
  options?: { invertColors?: boolean; filterMode?: 'month' | 'year' | 'all' },
) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const invert = options?.invertColors ?? false;
  const color = pct > 0
    ? (invert ? 'text-red-500' : 'text-emerald-500')
    : pct < 0
    ? (invert ? 'text-emerald-500' : 'text-red-500')
    : 'text-zinc-400';
  const suffix = options?.filterMode === 'year' ? 'vs ano ant.' : 'vs período ant.';
  return React.createElement(
    'span',
    { className: cn('text-[10px] font-bold', color) },
    `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% ${suffix}`,
  );
}

export const MODALITY_COLORS = ['#1a365d', '#d4af37'];
export const CHART_COLORS    = ['#1a365d', '#d4af37', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];
