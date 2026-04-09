import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback/EmptyState';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface DataTableProps<TData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No data found',
  pageSize = 10,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                {columns.map((_, i) => (
                  <th key={i} className="px-4 py-3">
                    <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-tertiary)]" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b border-[var(--border-default)]">
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} className="px-4 py-3">
                      <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-tertiary)]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  const totalRows = table.getFilteredRowModel().rows.length;
  const currentPageSize = table.getState().pagination.pageSize;
  const pageIndex = table.getState().pagination.pageIndex;
  const startRow = pageIndex * currentPageSize + 1;
  const endRow = Math.min((pageIndex + 1) * currentPageSize, totalRows);

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-[var(--border-default)]">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-[var(--text-secondary)]',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border-default)] transition-colors hover:bg-[var(--surface-tertiary)]"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm text-[var(--text-primary)]">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer with Rows per page + Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--border-default)] px-4 py-3">
        {/* Left: Rows per page */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)]">Rows per page</span>
          <Select
            value={String(currentPageSize)}
            onValueChange={(val) => table.setPageSize(Number(val))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-[var(--text-tertiary)]">
            {startRow}–{endRow} of {totalRows}
          </span>
        </div>

        {/* Right: Page navigation */}
        {table.getPageCount() > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">
              Page {pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
