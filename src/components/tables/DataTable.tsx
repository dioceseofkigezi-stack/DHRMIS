import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface DataTableColumn<Row> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: Row) => ReactNode;
}

interface Props<Row extends Record<string, unknown> & { id: string }> {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  sortKey: string;
  sortAscending: boolean;
  onSort: (column: string) => void;
  actions?: (row: Row) => ReactNode;
}

export default function DataTable<Row extends Record<string, unknown> & { id: string }>({ rows, columns, sortKey, sortAscending, onSort, actions }: Props<Row>) {
  return <div className={styles.scroller}>
    <table className={styles.table}>
      <thead><tr>{columns.map((column) => <th scope="col" key={column.key}>
        {column.sortable === false ? column.label : <button type="button" className={styles.sortButton} onClick={() => onSort(column.key)} aria-label={`Sort by ${column.label}`} aria-sort={sortKey === column.key ? sortAscending ? "ascending" : "descending" : "none"}>{column.label}{sortKey === column.key && (sortAscending ? "↑" : "↓")}</button>}
      </th>)}{actions && <th scope="col" className={styles.actionsHeading}>Actions</th>}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.key} title={column.render ? undefined : String(row[column.key] ?? "")}>{column.render ? column.render(row) : String(row[column.key] ?? "—")}</td>)}{actions && <td className={styles.actions}>{actions(row)}</td>}</tr>)}</tbody>
    </table>
  </div>;
}
