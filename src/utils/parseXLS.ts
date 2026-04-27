import * as XLSX from 'xlsx';

export interface ParsedPosition {
  ticker: string;
  quantity: number;
  avgPrice: number;
}

export function parseBrokerReport(file: File): Promise<ParsedPosition[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const positions: ParsedPosition[] = [];
        
        // Sheet5 has the position data (current balances)
        const sheet5 = workbook.Sheets['Sheet5'];
        if (!sheet5) {
          resolve(positions);
          return;
        }
        
        const jsonData = XLSX.utils.sheet_to_json(sheet5, { header: 1 }) as any[][];
        
        // Skip header row (first row), start from row 1
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 12) continue;
          
          // Row format:
          // 0: Instrument name
          // 1: Short name  
          // 2: ISIN
          // 3: Beginning qty
          // 4: Beginning value
          // 5: Beginning currency
          // 6: Beginning RUB value
          // 7: Ending qty
          // 8: Ending value
          // 9: Ending currency
          // 10: Ending RUB value
          
          const ticker = row[1]?.toString().trim();
          const endingQty = parseFloat(row[7]) || parseFloat(row[3]) || 0;
          const endingValueRUB = parseFloat(row[10]) || parseFloat(row[6]) || 0;
          
          if (ticker && endingQty > 0) {
            // Calculate average price
            const avgPrice = endingValueRUB / endingQty;
            
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