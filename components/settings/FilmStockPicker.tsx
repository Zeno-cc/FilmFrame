import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { FilmType } from '../../types';
import { supportsSpectralStock } from '../../services/spectral/stockRegistry';
import { positiveProfileForFilm } from '../../services/spectral/positive';
import { isMonochromeFilm } from '../../services/spectral/monochrome';
import { isCineStillFilm } from '../../services/spectral/cineStill';
import { CheckIcon, ChevronDownIcon, CloseIcon, InfoIcon } from '../icons/FilmFrameIcons';

interface FilmStockPickerProps {
  id?: string;
  value: FilmType;
  onChange: (value: FilmType) => void;
  disabled?: boolean;
}

const stocks = Object.values(FilmType).sort((left, right) => (
  Number(supportsSpectralStock(right)) - Number(supportsSpectralStock(left))
));
const spectralStockCount = stocks.filter(supportsSpectralStock).length;

function SpectralMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-[var(--ff-amber)] ${compact ? '' : 'ml-3'}`} aria-hidden="true">
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
        <path d="M1 11.5H15M2.5 8V11M6 4V11M9.5 6.5V11M13 2V11" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span>λ</span>
      {!compact && <span className="tracking-normal">光谱</span>}
    </span>
  );
}

export function FilmStockPicker({ id, value, onChange, disabled = false }: FilmStockPickerProps) {
  const instanceId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<FilmType, HTMLButtonElement>());
  const typeaheadRef = useRef('');
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const [infoOpen, setInfoOpen] = useState(false);
  const listboxId = `${id ?? instanceId}-stock-listbox`;
  const triggerId = `${id ?? instanceId}-stock-trigger`;
  const infoId = `${id ?? instanceId}-spectral-info`;
  const supported = supportsSpectralStock(value);
  const positive = positiveProfileForFilm(value) !== undefined;
  const monochrome = isMonochromeFilm(value);
  const cineStill = isCineStillFilm(value);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setInfoOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      optionRefs.current.get(activeValue)?.focus({ preventScroll: true });
      optionRefs.current.get(activeValue)?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, activeValue]);

  useEffect(() => {
    if (!open && !infoOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, infoOpen]);

  useEffect(() => () => {
    if (typeaheadTimerRef.current !== undefined) clearTimeout(typeaheadTimerRef.current);
  }, []);

  useEffect(() => {
    if (disabled) close();
  }, [disabled]);

  const openMenu = (nextValue = value) => {
    if (disabled) return;
    typeaheadRef.current = '';
    if (typeaheadTimerRef.current !== undefined) clearTimeout(typeaheadTimerRef.current);
    setInfoOpen(false);
    setActiveValue(nextValue);
    setOpen(true);
  };

  const select = (stock: FilmType) => {
    onChange(stock);
    close(true);
  };

  const closeInfo = (restoreFocus = false) => {
    setInfoOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => infoButtonRef.current?.focus({ preventScroll: true }));
  };

  const search = (key: string) => {
    typeaheadRef.current += key.toUpperCase();
    if (typeaheadTimerRef.current !== undefined) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => { typeaheadRef.current = ''; }, 700);
    const query = typeaheadRef.current;
    const match = stocks.find(item => item.startsWith(query) && /^\d/.test(item.slice(query.length)))
      ?? stocks.find(item => item.startsWith(`${query} `))
      ?? stocks.find(item => item.startsWith(query) && !stocks.some(other => other !== item && other.startsWith(item)))
      ?? stocks.find(item => item.startsWith(query));
    if (match) move(match);
  };

  const move = (stock: FilmType) => {
    if (!open) {
      openMenu(stock);
      return;
    }
    setActiveValue(stock);
    optionRefs.current.get(stock)?.focus({ preventScroll: true });
    optionRefs.current.get(stock)?.scrollIntoView({ block: 'nearest' });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab' && open) {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const index = (stocks.indexOf(value) + direction + stocks.length) % stocks.length;
      openMenu(stocks[index]);
    } else if (open && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      search(event.key);
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, stock: FilmType) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' || (event.key === ' ' && typeaheadRef.current === '')) {
      event.preventDefault();
      select(stock);
      return;
    }
    const index = stocks.indexOf(stock);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(stocks[(index + 1) % stocks.length]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(stocks[(index - 1 + stocks.length) % stocks.length]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(stocks[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(stocks[stocks.length - 1]);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      search(event.key);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
        <span id={`${id ?? instanceId}-stock-label`} className="block text-xs font-medium text-[var(--ff-paper-muted)]">胶片型号</span>
        {supported && (
          <button
            ref={infoButtonRef}
            type="button"
            aria-label="了解光谱负片"
            title="了解光谱负片"
            aria-expanded={infoOpen}
            aria-controls={infoOpen ? infoId : undefined}
            disabled={disabled}
            onClick={() => { setOpen(false); setInfoOpen(current => !current); }}
            onKeyDown={event => {
              if (event.key === 'Escape' && infoOpen) {
                event.preventDefault();
                event.stopPropagation();
                closeInfo(true);
              }
            }}
            className="-my-2.5 inline-flex min-h-11 items-center gap-1 rounded-[3px] px-1.5 text-[var(--ff-paper-dim)] transition-colors hover:bg-[var(--ff-amber-soft)] hover:text-[var(--ff-amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:opacity-40"
          >
            <SpectralMark compact />
            <InfoIcon size={13} />
          </button>
        )}
      </div>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-labelledby={`${id ?? instanceId}-stock-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => open ? close() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-panel-soft)] px-3 text-left text-sm text-[var(--ff-paper)] transition-colors hover:border-[var(--ff-line-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span className="sr-only" id={`${triggerId}-value`}>{value}</span>
        <span className="min-w-0 leading-4" aria-hidden="true">{value}</span>
        <span className="flex shrink-0 items-center gap-2 text-[var(--ff-paper-dim)]">
          {supported && <SpectralMark compact />}
          <ChevronDownIcon size={15} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={`${id ?? instanceId}-stock-label ${triggerId}-value`}
          aria-activedescendant={`${listboxId}-${activeValue.replaceAll(' ', '-')}`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[min(360px,55dvh)] overflow-y-auto overscroll-contain rounded-[5px] border border-[var(--ff-line)] bg-[var(--ff-panel-raised)] p-1.5 shadow-[var(--ff-shadow-lift)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--ff-line-soft)] px-2.5 pb-2 pt-1 font-mono text-[9px] tracking-[0.13em] text-[var(--ff-paper-dim)]" aria-hidden="true">
            <span>FILM STOCK</span><span>λ = 光谱支持</span>
          </div>
          {stocks.map((stock, index) => {
            const stockSupported = supportsSpectralStock(stock);
            const selected = stock === value;
            const previousSupported = index > 0 && supportsSpectralStock(stocks[index - 1]);
            return (
              <div key={stock}>
                {index === 0 && (
                  <div className="px-2.5 pb-1 pt-2 font-mono text-[9px] tracking-[0.12em] text-[var(--ff-amber)]" aria-hidden="true">光谱支持 · {spectralStockCount}</div>
                )}
                {index > 0 && previousSupported && !stockSupported && (
                  <div className="mx-1.5 mb-1 mt-2 border-t border-[var(--ff-line-soft)] px-2.5 pb-1 pt-2 font-mono text-[9px] tracking-[0.12em] text-[var(--ff-paper-dim)]" aria-hidden="true">经典色彩 · {stocks.length - spectralStockCount}</div>
                )}
              <button
                key={stock}
                id={`${listboxId}-${stock.replaceAll(' ', '-')}`}
                ref={element => {
                  if (element) optionRefs.current.set(stock, element);
                  else optionRefs.current.delete(stock);
                }}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={stockSupported ? `${stock} · 光谱` : stock}
                tabIndex={stock === activeValue ? 0 : -1}
                onClick={() => select(stock)}
                onKeyDown={event => handleOptionKeyDown(event, stock)}
                className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-[3px] px-2.5 text-left text-[13px] outline-none transition-colors focus-visible:bg-[var(--ff-amber-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ff-focus)] ${selected ? 'bg-[var(--ff-amber-soft)] text-[var(--ff-paper)]' : 'text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)]'}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`inline-flex w-3 shrink-0 justify-center text-[var(--ff-amber)] ${selected ? '' : 'invisible'}`} aria-hidden="true"><CheckIcon size={13} /></span>
                  <span className="min-w-0 whitespace-normal leading-4">{stock}</span>
                </span>
                {stockSupported && <SpectralMark />}
              </button>
              </div>
            );
          })}
        </div>
      )}

      {infoOpen && supported && (
        <section id={infoId} aria-label="光谱负片说明" className="relative mt-2 overflow-hidden rounded-[5px] border border-[var(--ff-amber-line)] bg-[var(--ff-panel-raised)] p-4 shadow-[var(--ff-shadow-short)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9px] tracking-[0.18em] text-[var(--ff-amber)]">{monochrome ? 'SPECTRAL SILVER' : positive ? 'SPECTRAL POSITIVE' : cineStill ? 'NO-REM-JET' : 'SPECTRAL NEGATIVE'}</div>
              <h3 className="mt-2 text-sm font-medium text-[var(--ff-paper)]">这款胶片支持光谱模拟</h3>
            </div>
            <button
              type="button"
              aria-label="关闭光谱说明"
              title="关闭光谱说明"
              autoFocus
              onClick={() => closeInfo(true)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  closeInfo(true);
                }
              }}
              className="-m-1.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[3px] text-[var(--ff-paper-dim)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
            >
              <CloseIcon size={15} />
            </button>
          </div>
          <div className="my-3 flex items-end gap-1.5 border-y border-[var(--ff-line-soft)] py-2 text-[var(--ff-amber)]" aria-hidden="true">
            {[6, 13, 9, 20, 12, 25, 17, 29, 14, 22, 10, 17, 7, 12].map((height, index) => (
              <span key={index} className="w-px bg-current opacity-70" style={{ height }} />
            ))}
            <span className="ml-auto font-mono text-[10px] tracking-wider opacity-80">380—780 nm</span>
          </div>
          <p className="text-xs leading-5 text-[var(--ff-paper-muted)]">{monochrome
            ? '以 81 个波长采样，使用产品银盐曲线与 Multigrade grade 2 拟合相纸；不包含完整原生颗粒或锐度校准。'
            : positive
              ? '以 81 个波长采样，经过正片显影与直接胶片扫描；不包含相纸或未经验证的物理齿孔显影。'
              : cineStill
                ? 'Vision3 500T 乳剂配合 no-rem-jet 背反射：整帧高光恢复与四高斯有界卷积；不包含完整原生空间效果或物理齿孔显影。'
                : '以 81 个波长采样，模拟普通照片经过胶片曝光、显影与相纸输出的色彩响应。'}</p>
          <div className="mt-3 flex items-center justify-between gap-3 font-mono text-[9px] tracking-wide text-[var(--ff-paper-dim)]">
            <span>{monochrome ? '照片 → 银盐负片 → Multigrade' : positive ? '照片 → 正片 → 直接扫描' : cineStill ? '照片 → 背反射负片 → 相纸' : '照片 → 负片 → 相纸 → 成片'}</span><span>实验 · 本地处理</span>
          </div>
        </section>
      )}
    </div>
  );
}
