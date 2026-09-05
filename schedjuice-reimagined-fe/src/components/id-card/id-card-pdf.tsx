import { Document, Image as PdfImage, Page, View, StyleSheet } from "@react-pdf/renderer";
import { CARD_MM } from "@/lib/id-card/dimensions";

const MM_TO_PT = 2.834645669;
const CARD_PT = {
  width: CARD_MM.width * MM_TO_PT,
  height: CARD_MM.height * MM_TO_PT,
};

const A4_PT = { width: 595.28, height: 841.89 };
const GRID = { cols: 2, rows: 4, gap: 18, margin: 28 };

const styles = StyleSheet.create({
  cardPage: { padding: 0 },
  fill: { width: "100%", height: "100%" },
  sheetPage: { padding: GRID.margin },
  row: { flexDirection: "row" },
  cell: { margin: GRID.gap / 2 },
});

export function IdCardSinglePdf({ pngDataUrl }: { pngDataUrl: string }) {
  return (
    <Document>
      <Page size={[CARD_PT.width, CARD_PT.height]} style={styles.cardPage}>
        <PdfImage src={pngDataUrl} style={styles.fill} />
      </Page>
    </Document>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function IdCardBulkPdf({ pngDataUrls }: { pngDataUrls: string[] }) {
  const perPage = GRID.cols * GRID.rows;
  const cellWidth =
    (A4_PT.width - GRID.margin * 2 - GRID.gap * GRID.cols) / GRID.cols;
  const cellHeight = (cellWidth * CARD_PT.height) / CARD_PT.width;
  const pages = chunk(pngDataUrls, perPage);

  return (
    <Document>
      {pages.map((pageItems, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.sheetPage}>
          {chunk(pageItems, GRID.cols).map((rowItems, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {rowItems.map((src, i) => (
                <View
                  key={i}
                  style={[styles.cell, { width: cellWidth, height: cellHeight }]}
                >
                  <PdfImage src={src} style={styles.fill} />
                </View>
              ))}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
