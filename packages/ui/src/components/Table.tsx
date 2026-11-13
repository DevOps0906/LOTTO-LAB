import type { Key, ReactNode } from "react";

export type TableColumn<Row> = {
  key: string;
  header: ReactNode;
  /** 셀 내용. 없으면 row[key] */
  render?: (row: Row) => ReactNode;
  /** 숫자 열: 오른쪽 정렬·고정폭 숫자 */
  numeric?: boolean;
};

export type TableProps<Row> = {
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => Key;
  /** 표 설명(접근성 caption, 화면에도 표시) */
  caption: string;
};

function cell<Row>(col: TableColumn<Row>, row: Row): ReactNode {
  if (col.render) return col.render(row);
  const value = (row as Record<string, unknown>)[col.key];
  return value == null ? "" : String(value);
}

/** ~767은 행마다 카드(라벨:값), 768~은 표. 숨긴 쪽은 display:none이라 보조기기에도 한 벌만 읽힌다. */
export function Table<Row>({ columns, rows, rowKey, caption }: TableProps<Row>) {
  return (
    <div className="ll-table">
      <div className="ll-table__scroll">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" data-numeric={col.numeric ?? false}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key} data-numeric={col.numeric ?? false}>
                    {cell(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="ll-table__cards" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <dl className="ll-table__card">
              {columns.map((col) => (
                <div key={col.key}>
                  <dt>{col.header}</dt>
                  <dd data-numeric={col.numeric ?? false}>{cell(col, row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
