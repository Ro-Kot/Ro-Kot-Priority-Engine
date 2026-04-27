import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCcw, Trash2, Edit2, Check, DownloadCloud, Briefcase, Info, Eye, EyeOff } from 'lucide-react';
import { PortfolioItem, CalculatedPortfolioItem } from './types';

function App() {
  const [items, setItems] = useState<PortfolioItem[]>(() => {
    const saved = localStorage.getItem('rokot_portfolio') || localStorage.getItem('snowball_portfolio');
    if (saved) return JSON.parse(saved);
      return [
        { id: '1', ticker: 'SBER', quantity: 100, avgPrice: 200 },
        { id: '2', ticker: 'GAZP', quantity: 50, avgPrice: 150 },
        { id: '3', ticker: 'LKOH', quantity: 10, avgPrice: 5000 },
      ];
  });

  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [syncingFinam, setSyncingFinam] = useState(false);

  // Finam API settings
  const [showFinamModal, setShowFinamModal] = useState(false);
  const [finamApiKey, setFinamApiKey] = useState(() => localStorage.getItem('finam_api_key') || '');
  
  // Global Filters
  const [includeStocks, setIncludeStocks] = useState(true);
  const [includeBonds, setIncludeBonds] = useState(true);
  const [includeCash, setIncludeCash] = useState(true);
  
  // Form states
  const [newTicker, setNewTicker] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newAvgPrice, setNewAvgPrice] = useState('');
  const [newTargetShare, setNewTargetShare] = useState('');
  
  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editAvgPrice, setEditAvgPrice] = useState('');
  const [editTargetShare, setEditTargetShare] = useState('');

  // Persist items
  useEffect(() => {
    localStorage.setItem('rokot_portfolio', JSON.stringify(items));
  }, [items]);

  const fetchPrices = async () => {
    if (items.length === 0) return;
    setLoadingPrices(true);
    try {
      const uniqueTickers = Array.from(new Set(items.map(i => i.ticker))).join(',');
      const res = await fetch(`/api/prices?tickers=${uniqueTickers}`);
      const data = await res.json();
      
      setPrices(prev => ({
        ...prev,
        ...data
      }));
    } catch (e) {
      console.error('Error fetching prices', e);
    } finally {
      setLoadingPrices(false);
    }
  };

  const saveFinamApiKey = (key: string) => {
    localStorage.setItem('finam_api_key', key);
    setFinamApiKey(key);
    setShowFinamModal(false);
  };

  const syncFinam = async () => {
    if (!finamApiKey) {
      setShowFinamModal(true);
      return;
    }

    setSyncingFinam(true);
    try {
      const res = await fetch('/api/finam/portfolio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKey: finamApiKey })
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 401) {
            // Invalid key perhaps
            setShowFinamModal(true);
        }
        throw new Error(await res.text());
      }
      const data = await res.json();
      
      if (data && data.positions) {
        const newItems: PortfolioItem[] = [];
        const newPrices: Record<string, number> = {};
        
        data.positions.forEach((pos: any, idx: number) => {
          let ticker = pos.symbol || pos.securityCode || pos.ticker || '';
          if (ticker.includes('@')) {
            ticker = ticker.split('@')[0];
          }
          
          const qty = parseFloat(pos.quantity?.value || pos.balance || pos.quantity || "0");
          let avgPrice = parseFloat(pos.average_price?.value || pos.averagePrice || pos.average_price || "0");
          let curPrice = parseFloat(pos.current_price?.value || pos.currentPrice || pos.current_price || pos.average_price?.value || pos.averagePrice || "0");
          
          // Корректировка цен для облигаций (в процентах от номинала 1000 руб)
          if (ticker.startsWith('RU000') || ticker.startsWith('SU')) {
             avgPrice = avgPrice * 10;
             curPrice = curPrice * 10;
          }
          
          if (qty > 0 && ticker) {
            newItems.push({
              id: 'finam_' + idx + '_' + ticker,
              ticker: ticker,
              quantity: qty,
              avgPrice: avgPrice
            });
            newPrices[ticker] = curPrice;
          }
        });
        
        const currencies = data.currencies || data.money || [];
        currencies.forEach((cur: any, idx: number) => {
          const currencyName = cur.name || cur.currency || 'Кэш';
          
          const balanceStr = cur.balance || cur.value || cur.amount;
          const balance = parseFloat(typeof balanceStr === 'object' && balanceStr !== null ? balanceStr.value || "0" : balanceStr || "0");
          
          let crossRate = 1;
          if (cur.crossRate !== undefined) crossRate = parseFloat(cur.crossRate);
          else if (cur.cross_rate !== undefined) crossRate = parseFloat(cur.cross_rate);

          if (balance > 0) {
            newItems.push({
              id: 'finam_cur_' + idx + '_' + currencyName,
              ticker: currencyName,
              quantity: balance,
              avgPrice: crossRate > 0 ? crossRate : 1
            });
            newPrices[currencyName] = crossRate > 0 ? crossRate : 1;
          }
        });
        
        if (newItems.length > 0) {
          setItems(prevItems => {
             const manualItems = prevItems.filter(i => !i.id.startsWith('finam_'));
             return [...manualItems, ...newItems];
          });
          setPrices(prev => ({
            ...prev,
             ...newPrices
          }));
        } else {
          alert('Портфель в Финам пуст.');
        }
      }
    } catch (e) {
      console.error('Error syncing Finam:', e);
      alert('Ошибка при сихронизации с Финам. Проверьте ваш FINAM_API_KEY и настройки.');
    } finally {
      setSyncingFinam(false);
    }
  };

  // Fetch prices on initial load and when tickers are added/removed
  useEffect(() => {
    fetchPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker || !newQty || !newAvgPrice) return;

    const qty = parseFloat(newQty);
    const avgPResult = parseFloat(newAvgPrice);

    if (isNaN(qty) || isNaN(avgPResult) || qty <= 0 || avgPResult <= 0) {
      alert('Пожалуйста, введите корректные числовые значения для количества и цены.');
      return;
    }

    const newItem: PortfolioItem = {
      id: crypto.randomUUID(),
      ticker: newTicker.toUpperCase().trim(),
      quantity: qty,
      avgPrice: avgPResult,
      targetShare: newTargetShare ? parseFloat(newTargetShare) : undefined,
    };

    setItems([...items, newItem]);
    setNewTicker('');
    setNewQty('');
    setNewAvgPrice('');
    setNewTargetShare('');
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleToggleExclude = (id: string) => {
    setItems(items.map(i => i.id === id ? { ...i, isExcluded: !i.isExcluded } : i));
  };
  
  const handleEditClick = (item: PortfolioItem) => {
    setEditingId(item.id);
    setEditQty(item.quantity.toString());
    setEditAvgPrice(item.avgPrice.toString());
    setEditTargetShare(item.targetShare?.toString() || '');
  };
  
  const handleSaveEdit = (id: string) => {
    const qty = parseFloat(editQty);
    const avgPResult = parseFloat(editAvgPrice);
    const targetShareResult = editTargetShare ? parseFloat(editTargetShare) : undefined;

    if (isNaN(qty) || isNaN(avgPResult) || qty <= 0 || avgPResult <= 0 || (targetShareResult !== undefined && isNaN(targetShareResult))) {
      alert('Пожалуйста, введите корректные числовые значения.');
      return;
    }
    
    setItems(items.map(item => item.id === id ? { ...item, quantity: qty, avgPrice: avgPResult, targetShare: targetShareResult } : item));
    setEditingId(null);
  };

  // Logic calculation based on Priority Engine principles
  const calculatedItems = useMemo(() => {
    if (items.length === 0) return [];

    const isItemBond = (ticker: string) => ticker.startsWith('RU000') || ticker.startsWith('SU');
    const isItemCash = (ticker: string) => ['RUB', 'USD', 'EUR', 'CNY', 'HKD', 'Кэш', 'КЕШ', 'CASH'].includes(ticker.toUpperCase());

    const activeItems = items.filter(i => {
      if (i.isExcluded) return false;
      const isBond = isItemBond(i.ticker);
      const isCash = isItemCash(i.ticker);
      const isStock = !isBond && !isCash;
      
      if (isBond && !includeBonds) return false;
      if (isCash && !includeCash) return false;
      if (isStock && !includeStocks) return false;
      return true;
    });
    
    let totalValue = 0;
    
    // Calculate current values for active items
    const activeItemsWithCurrent = activeItems.map(item => {
      const cp = prices[item.ticker] || item.avgPrice;
      const cValue = item.quantity * cp;
      totalValue += cValue;
      return {
         ...item,
         currentPrice: cp,
         currentValue: cValue,
         priceRatio: cp / item.avgPrice
      };
    });

    const activeItemsWithShares = activeItemsWithCurrent.map(i => {
      const share = totalValue > 0 ? i.currentValue / totalValue : 0;
      const idealShare = i.targetShare != null && i.targetShare > 0 ? i.targetShare / 100 : (activeItemsWithCurrent.length > 0 ? 1 / activeItemsWithCurrent.length : 0);
      const fulfillmentRatio = idealShare > 0 ? share / idealShare : 1;
      
      const targetValue = totalValue * idealShare;
      const gap = targetValue - i.currentValue;
      const toBuyQty = gap > 0 && i.currentPrice > 0 ? Math.ceil(gap / i.currentPrice) : 0;
      
      return {
        ...i,
        share,
        idealShare,
        fulfillmentRatio,
        toBuyQty
      };
    });

    // Sort by Fulfillment Ratio DESC (higher means lower buy priority)
    const sortedByFulfillment = [...activeItemsWithShares].sort((a, b) => b.fulfillmentRatio - a.fulfillmentRatio);
    const rankShareMap = new Map<string, number>();
    sortedByFulfillment.forEach((item, index) => {
      rankShareMap.set(item.id, index + 1);
    });

    // Sort by Price Ratio DESC (highest relative price given rank 1, meaning worst to buy now)
    const sortedByPriceRatio = [...activeItemsWithShares].sort((a, b) => b.priceRatio - a.priceRatio);
    const rankPriceMap = new Map<string, number>();
    sortedByPriceRatio.forEach((item, index) => {
      rankPriceMap.set(item.id, index + 1);
    });

    const finalItems: CalculatedPortfolioItem[] = items.map(item => {
        const isBond = isItemBond(item.ticker);
        const isCash = isItemCash(item.ticker);
        const isStock = !isBond && !isCash;
        
        const isGloballyExcluded = (isBond && !includeBonds) || (isCash && !includeCash) || (isStock && !includeStocks);
        const effectivelyExcluded = item.isExcluded || isGloballyExcluded;

        if (effectivelyExcluded) {
          const cp = prices[item.ticker] || item.avgPrice;
          return {
             ...item,
             isExcluded: effectivelyExcluded, // Pass it to UI
             currentPrice: cp,
             currentValue: item.quantity * cp,
             priceRatio: cp / item.avgPrice,
             share: 0,
             idealShare: 0,
             fulfillmentRatio: 0,
             toBuyQty: 0,
             rankShare: 0,
             rankPrice: 0,
             totalRank: 0
          };
        }

        const calculated = activeItemsWithShares.find(a => a.id === item.id);
        if (!calculated) return {} as CalculatedPortfolioItem; // fallback
        
        const rs = rankShareMap.get(item.id) || 0;
        const rp = rankPriceMap.get(item.id) || 0;
        return {
          ...calculated,
          rankShare: rs,
          rankPrice: rp,
          totalRank: rs + rp
        };
    });

    return finalItems.sort((a, b) => {
       if (a.isExcluded && !b.isExcluded) return 1;
       if (!a.isExcluded && b.isExcluded) return -1;
       if (a.isExcluded && b.isExcluded) return 0;
       return b.totalRank - a.totalRank;
    });
  }, [items, prices]);

  const totalPortfolioValue = useMemo(() => {
    return calculatedItems.filter(i => !i.isExcluded).reduce((acc, item) => acc + item.currentValue, 0);
  }, [calculatedItems]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(val);
  };
  const formatPercentage = (val: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 2 }).format(val);
  };

  const topCandidates = calculatedItems.filter(i => !i.isExcluded).slice(0, 3);
  const idealShareActive = calculatedItems.filter(i => !i.isExcluded).length > 0 ? 1 / calculatedItems.filter(i => !i.isExcluded).length : 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans selection:bg-indigo-100 p-6 md:p-8">
      <div className="max-w-[1280px] mx-auto space-y-6">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Ro-Kot Priority Engine</h1>
            <p className="text-sm text-slate-500">Система ребалансировки и усреднения позиций</p>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <button
               onClick={syncFinam}
               disabled={syncingFinam}
               className="flex items-center space-x-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
            >
               <DownloadCloud size={16} className={syncingFinam ? "animate-bounce" : ""} />
               <span>{syncingFinam ? 'Синхронизация...' : 'Синхронизировать Финам'}</span>
            </button>
            <button
               onClick={fetchPrices}
               disabled={loadingPrices}
               className="flex items-center space-x-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
            >
               <RefreshCcw size={16} className={loadingPrices ? "animate-spin" : ""} />
               <span>{loadingPrices ? 'Обновление...' : 'Обновить цены'}</span>
            </button>
            <div className="bg-white px-5 py-2.5 rounded-xl shadow-sm border border-slate-200">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Стоимость портфеля</span>
              <div className="text-lg font-bold text-slate-900">{formatCurrency(totalPortfolioValue)}</div>
            </div>
            <div className="bg-indigo-600 px-5 py-2.5 rounded-xl shadow-sm text-white">
              <span className="text-xs font-semibold opacity-80 uppercase tracking-widest">Активов</span>
              <div className="text-lg font-bold">{items.length} шт.</div>
            </div>
          </div>
        </header>

        {/* Filters / Toggles */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 flex flex-wrap items-center gap-6">
          <div className="font-semibold text-slate-700 uppercase tracking-widest text-xs mr-2">Учитывать в ребалансировке:</div>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={includeStocks} onChange={(e) => setIncludeStocks(e.target.checked)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${includeStocks ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${includeStocks ? 'translate-x-4' : ''}`}></div>
            </div>
            <span className="text-sm font-medium text-slate-800">Акции</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={includeBonds} onChange={(e) => setIncludeBonds(e.target.checked)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${includeBonds ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${includeBonds ? 'translate-x-4' : ''}`}></div>
            </div>
            <span className="text-sm font-medium text-slate-800">Облигации</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={includeCash} onChange={(e) => setIncludeCash(e.target.checked)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${includeCash ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${includeCash ? 'translate-x-4' : ''}`}></div>
            </div>
            <span className="text-sm font-medium text-slate-800">Валюта (Кэш)</span>
          </label>
        </section>

        {/* Add New Position Form - Full Width Content Block */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
           <h2 className="font-bold text-lg mb-4 text-slate-800">Добавить актив</h2>
           <form onSubmit={handleAddItem} className="flex flex-col md:flex-row gap-4 items-end">
             <div className="flex-1 w-full">
               <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Тикер (напр. SBER.ME)</label>
               <input
                 type="text"
                 required
                 value={newTicker}
                 onChange={e => setNewTicker(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 px-4 py-3 outline-none transition-all placeholder:text-slate-400 font-medium"
                 placeholder="TICKER"
               />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Кол-во шт.</label>
               <input
                 type="number"
                 step="any"
                 required
                 value={newQty}
                 onChange={e => setNewQty(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 px-4 py-3 outline-none transition-all placeholder:text-slate-400 font-medium"
                 placeholder="10"
               />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Средняя цена</label>
               <input
                 type="number"
                 step="any"
                 required
                 value={newAvgPrice}
                 onChange={e => setNewAvgPrice(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 px-4 py-3 outline-none transition-all placeholder:text-slate-400 font-medium"
                 placeholder="150"
               />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Цель % (необяз.)</label>
               <input
                 type="number"
                 step="any"
                 value={newTargetShare}
                 onChange={e => setNewTargetShare(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 px-4 py-3 outline-none transition-all placeholder:text-slate-400 font-medium"
                 placeholder="10"
               />
             </div>
             <button type="submit" className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-8 rounded-xl transition-colors flex justify-center items-center gap-2">
               <Plus size={18} />
               <span>Добавить</span>
             </button>
           </form>
        </section>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Top Priority & System Health */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            
            {/* Top Priority (High Priority) */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold text-lg text-slate-800">Top Priority</h2>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Кандидаты</span>
              </div>
              
              <div className="space-y-4">
                {topCandidates.length === 0 ? (
                   <p className="text-sm text-slate-500 text-center py-4">Нет данных для анализа</p>
                ) : (
                  topCandidates.map((cand, idx) => {
                    const priceDropPct = (((cand.currentPrice || cand.avgPrice) - cand.avgPrice) / cand.avgPrice) * 100;
                    const borderColors = ['border-emerald-500', 'border-emerald-400', 'border-emerald-300'];
                    return (
                      <div key={cand.id} className={`p-4 bg-slate-50 rounded-2xl border-l-4 ${borderColors[idx % 3]} flex justify-between items-center`}>
                        <div>
                          <div className="font-bold text-slate-800">{cand.ticker}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Rank: {cand.totalRank} {idx === 0 && '(Max)'}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${priceDropPct < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                            {priceDropPct > 0 ? '+' : ''}{priceDropPct.toFixed(1)}% от Ср.
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            Доля: {(cand.share * 100).toFixed(1)}% → {(cand.idealShare * 100).toFixed(1)}%
                          </div>
                          {cand.toBuyQty > 0 && (
                            <div className="text-[11px] text-indigo-500 font-bold mt-1 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">
                              Купить: {cand.toBuyQty} шт.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* System Health / Rebalancing Logic */}
            <div className="bg-indigo-50 rounded-3xl p-6 border border-indigo-100 flex flex-col justify-between">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse"></div>
                <h3 className="font-bold text-indigo-900">Логика ребалансировки</h3>
              </div>
              <p className="text-sm text-indigo-700 leading-relaxed mb-6">
                Целевая доля каждого актива либо задается индивидуально, либо распределяется поровну (по <b>{items.length > 0 ? (100 / items.length).toFixed(1) : 0}%</b>). 
                Итоговый ранг формируется из суммы рангов: (низкое выполнение целевой доли) + (просадка цены).
              </p>
              <div className="flex justify-between text-[10px] uppercase tracking-widest text-indigo-400 font-bold border-t border-indigo-100/50 pt-4">
                <span>Алгоритм активен</span>
                <span>Ro-Kot Priority Engine</span>
              </div>
            </div>
          </div>

          {/* Right Column: Full Assets Table Matrix */}
          <div className="xl:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 overflow-hidden">
            <h2 className="font-bold text-lg mb-6 text-slate-800">Матрица портфеля</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="pb-3 font-semibold px-2">Тикер</th>
                    <th className="pb-3 font-semibold px-2">Кол-во</th>
                    <th className="pb-3 font-semibold px-2">Ср. / Тек. Цена</th>
                    <th className="pb-3 font-semibold px-2">Доля (Ф/П)</th>
                    <th className="pb-3 font-semibold px-2 text-center">Купить</th>
                    <th className="pb-3 font-semibold text-center px-2">R. Доля</th>
                    <th className="pb-3 font-semibold text-center px-2">R. Цена</th>
                    <th className="pb-3 font-semibold text-right px-2">Total Rank</th>
                    <th className="pb-3 px-2"></th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {calculatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                        Портфель пуст. Добавьте активы для расчета рангов.
                      </td>
                    </tr>
                  ) : (
                    calculatedItems.map((item, idx) => {
                      const isTopPriority = idx === 0;
                      const priceDrop = item.currentPrice! < item.avgPrice;
                      const isGrayedOut = item.totalRank < calculatedItems.length; // just a visual heuristic for lower ranks

                      return (
                        <tr key={item.id} className={`border-b border-slate-50 transition-colors ${item.isExcluded ? 'opacity-40 grayscale bg-slate-50/50' : 'hover:bg-slate-50/50'}`}>
                          <td className={`py-3 px-2 font-bold ${isTopPriority && !item.isExcluded ? 'text-slate-900' : isGrayedOut ? 'text-slate-500' : 'text-slate-800'}`}>
                            {item.ticker}
                          </td>
                          <td className="py-3 px-2 font-mono text-slate-600">
                            {editingId === item.id ? (
                              <input 
                                type="number" 
                                value={editQty} 
                                onChange={e => setEditQty(e.target.value)} 
                                className="w-20 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                              />
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td className="py-3 px-2 font-mono">
                            {editingId === item.id ? (
                              <input 
                                type="number" 
                                value={editAvgPrice} 
                                onChange={e => setEditAvgPrice(e.target.value)} 
                                className="w-20 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                              />
                            ) : (
                              item.avgPrice.toFixed(2)
                            )}
                            <span className={`mx-2 ${priceDrop ? 'text-emerald-500' : 'text-rose-500'}`}>→</span> 
                            {item.currentPrice?.toFixed(2) || '—'}
                          </td>
                          <td className="py-3 px-2 text-xs text-slate-600 font-mono">
                            {editingId === item.id ? (
                              <input 
                                type="number" 
                                value={editTargetShare} 
                                onChange={e => setEditTargetShare(e.target.value)} 
                                placeholder={(item.idealShare * 100).toFixed(1)}
                                className="w-16 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                              />
                            ) : (
                              <>
                                {(item.share * 100).toFixed(1)}% / <span className="font-bold text-slate-800">{(item.idealShare * 100).toFixed(1)}%</span>
                              </>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {item.toBuyQty > 0 ? (
                               <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                 {item.toBuyQty} шт.
                               </span>
                            ) : (
                               <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center text-slate-600 font-medium">
                            {item.isExcluded ? '—' : item.rankShare}
                          </td>
                          <td className="py-3 px-2 text-center text-slate-600 font-medium">
                            {item.isExcluded ? '—' : item.rankPrice}
                          </td>
                          <td className={`py-3 px-2 text-right font-black ${isTopPriority && !item.isExcluded ? 'text-indigo-600 text-lg' : 'text-slate-700'}`}>
                            {item.isExcluded ? '—' : item.totalRank}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex justify-end items-center gap-1">
                              <button
                                onClick={() => handleToggleExclude(item.id)}
                                className={`p-1.5 rounded-lg transition-colors ${item.isExcluded ? 'text-indigo-500 hover:bg-indigo-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                                title={item.isExcluded ? "Включить в учет" : "Исключить из учета"}
                              >
                                {item.isExcluded ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                              {editingId === item.id ? (
                                <button
                                  onClick={() => handleSaveEdit(item.id)}
                                  className="p-1.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Сохранить"
                                >
                                  <Check size={16} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleEditClick(item)}
                                  className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Редактировать актив"
                                >
                                  <Edit2 size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Удалить актив"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>

      {/* Finam API Key Modal */}
      {showFinamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Настройки Finam API</h3>
            <p className="text-sm text-slate-500 mb-6">
              Для синхронизации портфеля требуется токен доступа Finam (API Key). 
              Он будет сохранен локально в вашем браузере.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                api key (token)
              </label>
              <input
                type="text"
                autoFocus
                value={finamApiKey}
                onChange={e => setFinamApiKey(e.target.value)}
                placeholder="tapi_sk_..."
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 px-4 py-3 outline-none transition-all font-mono text-sm"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowFinamModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
              <button 
                onClick={() => saveFinamApiKey(finamApiKey)}
                className="px-5 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
