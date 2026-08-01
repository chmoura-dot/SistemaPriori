import * as XLSX from 'xlsx';

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

/**
 * Exports data to an Excel file (.xlsx)
 * @param data Array of objects to export
 * @param fileName Name of the file (without extension)
 * @param sheetName Name of the sheet
 */
export const exportToExcel = (data: Row[], fileName: string, sheetName: string = 'Sheet1') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Create a blob and download it
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

export interface ExcelSheet {
  /** Nome da aba (máx. 31 caracteres — limite do Excel) */
  sheetName: string;
  /** Linhas de dados. As chaves do primeiro objeto viram o cabeçalho. */
  data: Row[];
  /**
   * Linhas de texto livre inseridas ACIMA do cabeçalho (ex.: legenda
   * explicativa). Cada string vira uma linha na coluna A.
   */
  topNotes?: string[];
}

/**
 * Calcula a largura ideal de cada coluna com base no maior conteúdo
 * (cabeçalho x células), com um mínimo e um teto para não ficar gigante.
 */
const computeColumnWidths = (headers: string[], data: Row[]): { wch: number }[] =>
  headers.map(header => {
    let maxLen = header.length;
    for (const row of data) {
      const value = row[header];
      const len = value == null ? 0 : String(value).length;
      if (len > maxLen) maxLen = len;
    }
    // +2 de folga; mínimo 10, máximo 45 caracteres.
    return { wch: Math.min(Math.max(maxLen + 2, 10), 45) };
  });

/**
 * Exporta múltiplas abas em um único arquivo .xlsx.
 *
 * Recursos aplicados por aba para facilitar o uso de quem recebe o arquivo:
 *  - AutoFilter nativo do Excel na linha de cabeçalho (setas de filtro/ordenação).
 *  - Largura de coluna ajustada automaticamente ao conteúdo.
 *
 * Observação: a versão Community da lib `xlsx` não grava estilos (negrito/cor),
 * então destaques de subtotal são feitos via texto (ex.: "TOTAL ...").
 */
export const exportMultiSheetExcel = (sheets: ExcelSheet[], fileName: string) => {
  const workbook = XLSX.utils.book_new();

  for (const { sheetName, data, topNotes } of sheets) {
    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    // Monta a planilha, opcionalmente com linhas de nota livres acima do cabeçalho.
    const worksheet = XLSX.utils.aoa_to_sheet(
      (topNotes ?? []).map(note => [note])
    );
    const headerOffset = (topNotes?.length ?? 0);
    XLSX.utils.sheet_add_json(worksheet, data, {
      origin: headerOffset > 0 ? `A${headerOffset + 1}` : 'A1',
      skipHeader: false,
    });

    if (headers.length > 0) {
      const lastColIdx = headers.length - 1;
      const headerRowIdx = headerOffset; // 0-based linha do cabeçalho
      const lastRowIdx = headerOffset + data.length; // inclui as linhas de dados

      // AutoFilter cobrindo do cabeçalho até a última linha de dados.
      const start = XLSX.utils.encode_cell({ r: headerRowIdx, c: 0 });
      const end = XLSX.utils.encode_cell({ r: lastRowIdx, c: lastColIdx });
      worksheet['!autofilter'] = { ref: `${start}:${end}` };

      // Largura das colunas.
      worksheet['!cols'] = computeColumnWidths(headers, data);
    }

    // Nome da aba respeitando o limite de 31 caracteres do Excel.
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31));
  }

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
