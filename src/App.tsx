import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Edit2, Check, Briefcase, Eye, EyeOff, Upload } from 'lucide-react';
import { PortfolioItem, CalculatedPortfolioItem } from './types';
import { parseBrokerReport } from './utils/parseXLS';

function App() {
  const [items, setItems] = useState<PortfolioItem[]>(() => {
    const saved = localStorage.getItem('rokot_portfolio');
    if (saved) return JSON.parse(saved);
    return [
      { id: '1', ticker: 'SBER', quantity: 100, avgPrice: 200 },
      { id: '2', ticker: 'GAZP', quantity: 50, avgPrice: 150 },
      { id: '3', ticker: 'LKOH', quantity: 10, avgPrice: 5000 },
    ];
  });

  const [includeStocks, setIncludeStocks] = useState(true);
  const [includeBonds, setIncludeBonds] = useState(true);
  const [includeCash, setIncludeCash] = useState(true);
  
  const [newTicker, setNewTicker] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newAvgPrice, setNewAvgPrice] = useState('');
  const [newTargetShare, setNewTargetShare] = useState('');
  
  const [additionalInvestment, setAdditionalInvestment] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editAvgPrice, setEditAvgPrice] = useState('');
  const [editTargetShare, setEditTargetShare] = useState('');

  useEffect(() => {
    localStorage.setItem('rokot_portfolio', JSON.stringify(items));
  }, [items]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker || !newQty || !newAvgPrice) return;

    const qty = parseFloat(newQty);
    const avgPResult = parseFloat(newAvgPrice);

    if (isNaN(qty) || isNaN(avgPResult) || qty <= 0 || avgPResult <= 0) {
      alert('Введите корректные значения.');
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

    if (isNaN(qty) || isNaN(avgPResult) || qty <= 0 || avgPResult <= 0) {
      alert('Введите корректные значения.');
      return;
    }
    
    setItems(items.map(item => item.id === id ? { ...item, quantity: qty, avgPrice: avgPResult, targetShare: targetShareResult } : item));
    setEditingId(null);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportXLS = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const positions = await parseBrokerReport(file);
      
      if (positions.length === 0) {
        alert('Не удалось найти позиции в файле');
        return;
      }
      
      const newItems: PortfolioItem[] = positions.map((pos, idx) => ({
        id: `imported_${idx}_${Date.now()}`,
        ticker: pos.ticker,
        quantity: pos.quantity,
        avgPrice: pos.avgPrice
      }));
      
      setItems(prev => {
        const manualItems = prev.filter(i => !i.id.startsWith('imported_'));
        return [...manualItems, ...newItems];
      });
      
      alert(`Импортировано ${positions.length} позиций`);
    } catch (err) {
      console.error('Import error:', err);
      alert('Ошибка при импорте файла');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
    const addInvestment = additionalInvestment ? parseFloat(additionalInvestment) : 0;
    
    const activeItemsWithCurrent = activeItems.map(item => {
      const cValue = item.quantity * item.avgPrice;
      totalValue += cValue;
      return { ...item, currentValue: cValue };
    });

    const newTotalValue = totalValue + addInvestment;
    
    const activeItemsWithShares = activeItemsWithCurrent.map(i => {
      const share = totalValue > 0 ? i.currentValue / totalValue : 0;
      const idealShare = i.targetShare != null && i.targetShare > 0 ? i.targetShare / 100 : (activeItemsWithCurrent.length > 0 ? 1 / activeItemsWithCurrent.length : 0);
      const fulfillmentRatio = idealShare > 0 ? share / idealShare : 1;
      
      const targetValue = newTotalValue * idealShare;
      const gap = targetValue - i.currentValue;
      
      return { ...i, share, idealShare, fulfillmentRatio, gap };
    });

    const sortedByFulfillment = [...activeItemsWithShares].sort((a, b) => a.gap - b.gap);
    const rankShareMap = new Map<string, number>();
    sortedByFulfillment.forEach((item, index) => {
      rankShareMap.set(item.id, index + 1);
    });

    const finalItems: CalculatedPortfolioItem[] = items.map(item => {
      const isBond = isItemBond(item.ticker);
      const isCash = isItemCash(item.ticker);
      const isStock = !isBond && !isCash;
      
      const isGloballyExcluded = (isBond && !includeBonds) || (isCash && !includeCash) || (isStock && !includeStocks);
      const effectivelyExcluded = item.isExcluded || isGloballyExcluded;

      if (effectivelyExcluded) {
        return {
          ...item,
          isExcluded: effectivelyExcluded,
          currentValue: item.quantity * item.avgPrice,
          priceRatio: 1,
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
      if (!calculated) return {} as CalculatedPortfolioItem;
      
      const rs = rankShareMap.get(item.id) || 0;
      return {
        ...calculated,
        priceRatio: 1,
        rankShare: rs,
        rankPrice: 0,
        totalRank: rs
      };
    });

    return finalItems.sort((a, b) => {
      if (a.isExcluded && !b.isExcluded) return 1;
      if (!a.isExcluded && b.isExcluded) return -1;
      if (a.isExcluded && b.isExcluded) return 0;
      return b.totalRank - a.totalRank;
    });
  }, [items, includeStocks, includeBonds, includeCash, additionalInvestment]);

  const totalPortfolioValue = useMemo(() => {
    return calculatedItems.filter(i => !i.isExcluded).reduce((acc, item) => acc + item.currentValue, 0);
  }, [calculatedItems]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(val);
  };

  const topCandidates = calculatedItems.filter(i => !i.isExcluded).slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans selection:bg-indigo-100 p-6 md:p-8">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Ro-Kot Priority Engine</h1>
            <p className="text-sm text-slate-500">Система ребалансировки и усреднения позиций</p>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <button
               onClick={() => fileInputRef.current?.click()}
               className="flex items-center space-x-2 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
               <Upload size={16} />
               <span>Импорт XLS</span>
            </button>
            <input
               ref={fileInputRef}
               type="file"
               accept=".xls,.xlsx"
               onChange={handleImportXLS}
               className="hidden"
             />
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

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Докупить на:</span>
            <input
              type="number"
              step="any"
              value={additionalInvestment}
              onChange={e => setAdditionalInvestment(e.target.value)}
              className="w-28 bg-indigo-50 border border-indigo-200 text-slate-900 rounded-lg focus:ring-2 focus:ring-indigo-500 px-3 py-1.5 outline-none font-mono text-sm"
              placeholder="0"
            />
          </div>
        </section>

        <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
           <h2 className="font-bold text-lg mb-4 text-slate-800">Добавить актив</h2>
           <form onSubmit={handleAddItem} className="flex flex-col md:flex-row gap-4 items-end">
             <div className="flex-1 w-full">
               <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Тикер</label>
               <input
                 type="text"
                 required
                 value={newTicker}
                 onChange={e => setNewTicker(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 px-4 py-3 outline-none"
                 placeholder="SBER"
               />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Кол-во</label>
               <input
                 type="number"
                 step="any"
                 required
                 value={newQty}
                 onChange={e => setNewQty(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 px-4 py-3 outline-none"
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
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 px-4 py-3 outline-none"
                 placeholder="150"
               />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Цель %</label>
               <input
                 type="number"
                 step="any"
                 value={newTargetShare}
                 onChange={e => setNewTargetShare(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 px-4 py-3 outline-none"
                 placeholder="10"
               />
             </div>
             <button type="submit" className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-8 rounded-xl transition-colors flex justify-center items-center gap-2">
               <Plus size={18} />
               <span>Добавить</span>
             </button>
           </form>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-4 flex flex-col gap-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold text-lg text-slate-800">Top Priority</h2>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase">Кандидаты</span>
              </div>
              
              <div className="space-y-4">
                {topCandidates.length === 0 ? (
                   <p className="text-sm text-slate-500 text-center py-4">Нет данных</p>
                ) : (
                  topCandidates.map((cand, idx) => {
                    const borderColors = ['border-emerald-500', 'border-emerald-400', 'border-emerald-300'];
                    return (
                      <div key={cand.id} className={`p-4 bg-slate-50 rounded-2xl border-l-4 ${borderColors[idx % 3]} flex justify-between items-center`}>
                        <div>
                          <div className="font-bold text-slate-800">{cand.ticker}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Rank: {cand.totalRank} {idx === 0 && '(Max)'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-600">
                            Доля: {(cand.share * 100).toFixed(1)}% → {(cand.idealShare * 100).toFixed(1)}%
                          </div>
                          {cand.gap > 0 && (
                            <div className="text-xs text-indigo-500 font-bold mt-1">
                              Докупить: {Math.ceil(cand.gap / cand.avgPrice)} шт.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="xl:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 overflow-hidden">
            <h2 className="font-bold text-lg mb-6 text-slate-800">Матрица портфеля</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="pb-3 font-semibold px-2">Тикер</th>
                    <th className="pb-3 font-semibold px-2">Кол-во</th>
                    <th className="pb-3 font-semibold px-2">Цена</th>
                    <th className="pb-3 font-semibold px-2">Доля (Ф/П)</th>
                    <th className="pb-3 font-semibold px-2 text-center">Купить</th>
                    <th className="pb-3 font-semibold px-2 text-center">Rank</th>
                    <th className="pb-3 px-2"></th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {calculatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 italic">Портфель пуст</td>
                    </tr>
                  ) : (
                    calculatedItems.map((item, idx) => (
                      <tr key={item.id} className={`border-b border-slate-50 ${item.isExcluded ? 'opacity-40 grayscale' : ''}`}>
                        <td className="py-3 px-2 font-bold">{item.ticker}</td>
                        <td className="py-3 px-2 font-mono text-slate-600">
                          {editingId === item.id ? (
                            <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)} className="w-20 px-2 py-1 text-xs border rounded" />
                          ) : item.quantity}
                        </td>
                        <td className="py-3 px-2 font-mono">
                          {editingId === item.id ? (
                            <input type="number" value={editAvgPrice} onChange={e => setEditAvgPrice(e.target.value)} className="w-20 px-2 py-1 text-xs border rounded" />
                          ) : item.avgPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-xs text-slate-600 font-mono">
                          {(item.share * 100).toFixed(1)}% / <span className="font-bold">{(item.idealShare * 100).toFixed(1)}%</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {item.gap > 0 ? (
                             <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{Math.ceil(item.gap / item.avgPrice)} шт.</span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-2 text-center font-medium">{item.totalRank}</td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => handleToggleExclude(item.id)} className="p-1.5 text-slate-300 hover:text-slate-500" title={item.isExcluded ? "Включить" : "Исключить"}>
                              {item.isExcluded ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            {editingId === item.id ? (
                              <button onClick={() => handleSaveEdit(item.id)} className="p-1.5 text-emerald-500" title="Сохранить"><Check size={16} /></button>
                            ) : (
                              <button onClick={() => handleEditClick(item)} className="p-1.5 text-slate-300 hover:text-indigo-500" title="Редактировать"><Edit2 size={16} /></button>
                            )}
                            <button onClick={() => handleRemoveItem(item.id)} className="p-1.5 text-slate-300 hover:text-red-500" title="Удалить"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;