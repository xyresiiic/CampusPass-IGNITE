import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from "react";
import "./ui.css";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function Table({ children, className = "", ...rest }: TableProps) {
  return (
    <div className="ui-table-container">
      <table className={`ui-table ${className}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...rest}>{children}</thead>;
}

export function TableBody({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...rest}>{children}</tbody>;
}

export function TableRow({ children, className = "", ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={className} {...rest}>
      {children}
    </tr>
  );
}

export function TableHead({ children, className = "", ...rest }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={className} {...rest}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", ...rest }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={className} {...rest}>
      {children}
    </td>
  );
}
