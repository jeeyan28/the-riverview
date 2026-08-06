import { useEffect, useState } from 'react';
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import Pagination from './Pagination';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50];

function DataTable({
  columns,
  rows,
  loading,
  emptyMessage = 'No data yet.',
  getRowKey,
  getRowClassName,
  tableClassName = 'tbl',
  paginate = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  defaultPageSize = pageSizeOptions[0],
  itemLabel = 'items',
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sorting, setSorting] = useState([]);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const tableColumns = columns.map((col) => ({
    id: col.key,
    accessorFn: col.sortValue || ((row) => row[col.key]),
    header: col.label,
    enableSorting: !!col.sortable,
    cell: (info) => (col.render ? col.render(info.row.original) : info.getValue()),
  }));

  const table = useReactTable({
    data: rows || [],
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getSortedRowModel().rows;
  const totalRows = sortedRows.length;
  const totalPages = paginate ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const visibleRows = paginate ? sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize) : sortedRows;

  return (
    <>
      <table className={tableClassName}>
        <thead>
          <tr>
            {table.getHeaderGroups()[0].headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sortDir = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  className={canSort ? 'tbl-th-sortable' : undefined}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                >
                  <span className="tbl-th-inner">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort && (
                      <i
                        className={`ti tbl-sort-icon ${
                          sortDir === 'asc' ? 'ti-sort-ascending-2 is-active' : sortDir === 'desc' ? 'ti-sort-descending-2 is-active' : 'ti-arrows-sort'
                        }`}
                      ></i>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0' }}>
                Loading…
              </td>
            </tr>
          ) : totalRows === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => (
              <tr key={getRowKey ? getRowKey(row.original) : row.id} className={getRowClassName ? getRowClassName(row.original) : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {paginate && !loading && totalRows > 0 && (
        <Pagination
          page={safePage}
          pageSize={pageSize}
          totalItems={totalRows}
          pageSizeOptions={pageSizeOptions}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          itemLabel={itemLabel}
        />
      )}
    </>
  );
}

export default DataTable;