import * as XLSX from 'xlsx';

export interface ParsedPosition {
  ticker: string;
  quantity: number;
  avgPrice: number;
}

function parseRussianNumber(str: string | number): number {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return parseFloat(str.toString().replace(/\s/g, '').replace(',', '.')) || 0;
}

export function parseBrokerReport(file: File): Promise<ParsedPosition[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const positions: ParsedPosition[] = [];
        
        const sheet = workbook.Sheets['Sheet5'];
        if (!sheet) {
          resolve(positions);
          return;
        }
        
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        for (let i = 2; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 10) continue;
          
          const ticker = row[1]?.toString().trim();
          const endingQty = parseRussianNumber(row[8]) || 0;
          const endingValue = parseRussianNumber(row[9]) || 0;
          
          if (ticker && endingQty > 0) {
            const avgPrice = endingValue > 0 && endingQty > 0 ? endingValue / endingQty : 0;
            
            positions.push({
              ticker: ticker,
              quantity: Math.round(endingQty),
              avgPrice: Math.round(avgPrice * 100) / 100
            });
          }
        }
        
        resolve(positions);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}