import './ConnectionTable.scss';

import cx from 'clsx';
import { formatDistance, Locale } from 'date-fns';
import { enUS, zhCN, zhTW } from 'date-fns/locale';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Sliders, XCircle } from '~/components/shared/FeatherIcons';
import { useTranslation } from 'react-i18next';
import { useSortBy, useTable } from 'react-table';
import { List as VirtualList, RowComponentProps } from 'react-window';

import {
  CONNECTION_COLUMN_WIDTHS_DEFAULT,
  ConnectionColumn,
} from '~/modules/connections/utils';
import { FormattedConn } from '~/store/connections';

import * as connAPI from '../api/connections';
import prettyBytes from '../misc/pretty-bytes';

import ConnectionCard from './ConnectionCard';
import s from './ConnectionTable.module.scss';
import MOdalCloseConnection from './ModalCloseAllConnections';
import ModalConnectionDetails from './ModalConnectionDetails';

const sortById = { id: 'id', desc: true };

const MIN_COLUMN_WIDTH = 50;
const DEFAULT_COLUMN_WIDTH = 100;

const getColumnWidth = (column: { id?: string; accessor?: string; width?: number }) => {
  const columnId = column.id || column.accessor;
  return column.width || CONNECTION_COLUMN_WIDTHS_DEFAULT[columnId] || DEFAULT_COLUMN_WIDTH;
};

const getColumnStyle = (column: { id?: string; accessor?: string; width?: number }) => {
  const columnId = column.id || column.accessor;
  const width = getColumnWidth(column);
  const style: React.CSSProperties = {
    width,
    minWidth: width,
    flex: `0 0 ${width}px`,
    flexShrink: 0,
  };

  if (['download', 'upload', 'downloadSpeedCurr', 'uploadSpeedCurr', 'start'].includes(columnId)) {
    style.justifyContent = 'flex-end';
  }

  if (columnId === 'ctrl') {
    style.justifyContent = 'center';
  }

  return style;
};

function Table({ data, columns, hiddenColumns, setColumns, apiConfig, height }) {
  const { t, i18n } = useTranslation();
  const [operationId, setOperationId] = useState('');
  const [showModalDisconnect, setShowModalDisconnect] = useState(false);
  const [selectedConn, setSelectedConn] = useState<FormattedConn | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  const headerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    setIsMobile(mql.matches);
    const listener = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  // 从本地存储加载排序状态
  const tableState = useMemo(() => {
    const savedSortBy = JSON.parse(localStorage.getItem('tableSortBy')) || [sortById];
    return {
      sortBy: savedSortBy,
      hiddenColumns,
    };
  }, [hiddenColumns]);

  const table = useTable(
    {
      columns,
      data,
      initialState: tableState,
      autoResetSortBy: false,
    },
    useSortBy
  );

  const { setHiddenColumns, headerGroups, rows, prepareRow, toggleSortBy, visibleColumns } = table;
  const state = table.state;

  const tableWidth = useMemo(
    () => visibleColumns.reduce((total, column) => total + getColumnWidth(column), 0),
    [visibleColumns]
  );

  const sortOptions = useMemo(() => {
    return columns
      .filter((c) => c.accessor !== 'id' && c.accessor !== 'ctrl')
      .map((c) => ({
        label: t(c.Header),
        value: c.accessor,
      }));
  }, [columns, t]);

  const currentSort = state.sortBy[0] || sortById;

  useEffect(() => {
    setHiddenColumns(hiddenColumns);
  }, [setHiddenColumns, hiddenColumns]);

  let locale: Locale;

  if (i18n.language === 'zh-CN') {
    locale = zhCN;
  } else if (i18n.language === 'zh-TW') {
    locale = zhTW;
  } else {
    locale = enUS;
  }

  const disconnectOperation = useCallback(() => {
    connAPI.closeConnById(apiConfig, operationId);
    setShowModalDisconnect(false);
  }, [apiConfig, operationId]);

  const handlerDisconnect = useCallback((id, e) => {
    e.stopPropagation();
    setOperationId(id);
    setShowModalDisconnect(true);
  }, []);

  const handleColumnResizeStart = useCallback(
    (column: { id: string; width?: number }, event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = getColumnWidth(column);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);

        setColumns(
          columns.map((item: ConnectionColumn) =>
            item.accessor === column.id ? { ...item, width: nextWidth } : item
          )
        );
      };

      const handleMouseUp = () => {
        document.body.classList.remove('is-resizing-connection-column');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.body.classList.add('is-resizing-connection-column');
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [columns, setColumns]
  );

  const renderCell = useCallback(
    (cell, locale) => {
      switch (cell.column.id) {
        case 'ctrl':
          return (
            <XCircle
              style={{ cursor: 'pointer' }}
              onClick={(e) => handlerDisconnect(cell.row.original.id, e)}
            ></XCircle>
          );
        case 'start':
          return formatDistance(cell.value, 0, { locale: locale });
        case 'download':
        case 'upload':
          return prettyBytes(cell.value);
        case 'downloadSpeedCurr':
        case 'uploadSpeedCurr':
          return prettyBytes(cell.value) + '/s';
        default:
          return cell.value;
      }
    },
    [handlerDisconnect]
  );

  // 当排序状态改变时，将新状态保存到本地存储
  useEffect(() => {
    localStorage.setItem('tableSortBy', JSON.stringify(state.sortBy));
  }, [state.sortBy]);

  const MobileRow = useCallback(
    ({ index, style }: RowComponentProps) => {
      const row = rows[index];
      const conn = row.original as FormattedConn;
      return (
        <div style={style}>
          <ConnectionCard
            key={conn.id}
            conn={conn}
            onDisconnect={handlerDisconnect}
            onClick={() => setSelectedConn(conn)}
          />
        </div>
      );
    },
    [rows, handlerDisconnect]
  );

  const DesktopRow = useCallback(
    ({ index, style }: RowComponentProps) => {
      const row = rows[index];
      prepareRow(row);
      return (
        <div
          {...(row as any).getRowProps({
            style: {
              ...style,
              display: 'flex',
              width: tableWidth,
            },
          })}
          className={s.tr}
          onClick={() => setSelectedConn((row as any).original)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedConn((row as any).original);
            }
          }}
        >
          {row.cells.map((cell) => {
            const columnStyle = getColumnStyle(cell.column);
            return (
              <div
                {...cell.getCellProps()}
                className={cx(s.td, index % 2 === 0 ? s.odd : false, cell.column.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  ...columnStyle,
                }}
              >
                <span className={s.cellText}>{renderCell(cell, locale)}</span>
              </div>
            );
          })}
        </div>
      );
    },
    [prepareRow, rows, tableWidth, renderCell, locale]
  );

  const handleDesktopListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  return (
    <div className={s.tableWrapper} style={{ height, overflow: 'hidden' }}>
      {isMobile ? (
        <div className={s.cardsView}>
          <div className={s.mobileSortToolbar}>
            <div className={s.sortSelectWrapper}>
              <div className={s.selectedValue}>
                <Sliders size={14} />
                <span>
                  {t('Sort')}: {sortOptions.find((opt) => opt.value === currentSort.id)?.label}
                </span>
              </div>
              <select
                value={currentSort.id}
                onChange={(e) => toggleSortBy(e.target.value, currentSort.desc)}
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className={s.selectArrow} />
            </div>
            <button
              className={s.sortDirBtn}
              onClick={() => toggleSortBy(currentSort.id, !currentSort.desc)}
            >
              {currentSort.desc ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
          <VirtualList
            style={{ height: height - 50, width: '100%' }}
            rowCount={rows.length}
            rowHeight={120}
            rowComponent={MobileRow}
            rowProps={{}}
          />
        </div>
      ) : (
        <div
          className={cx(s.table, 'connections-table')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
          }}
        >
          <div
            className={s.theadWrapper}
            ref={headerRef}
            style={{ overflow: 'hidden', width: '100%' }}
          >
            <div className={s.thead} style={{ width: tableWidth }}>
              {headerGroups.map((headerGroup, trindex) => (
                <div
                  {...headerGroup.getHeaderGroupProps()}
                  className={s.tr}
                  key={trindex}
                  style={{ display: 'flex' }}
                >
                  {headerGroup.headers.map((column) => {
                    const columnStyle = getColumnStyle(column);
                    return (
                      <div
                        {...column.getHeaderProps(column.getSortByToggleProps())}
                        className={s.th}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          ...columnStyle,
                        }}
                      >
                        <span className={s.headerText}>{t(column.render('Header'))}</span>
                        {column.id !== 'ctrl' ? (
                          <span className={s.sortIconContainer}>
                            {column.isSorted ? (
                              <ChevronDown
                                size={14}
                                className={column.isSortedDesc ? '' : s.rotate180}
                              />
                            ) : null}
                          </span>
                        ) : null}
                        <div
                          className={s.resizeHandle}
                          onMouseDown={(event) => handleColumnResizeStart(column, event)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <VirtualList
            style={{ height: height - 50, width: '100%' }}
            onScroll={handleDesktopListScroll}
            rowCount={rows.length}
            rowHeight={44}
            rowComponent={DesktopRow}
            rowProps={{}}
          />
        </div>
      )}
      <MOdalCloseConnection
        confirm={'disconnect'}
        isOpen={showModalDisconnect}
        onRequestClose={() => setShowModalDisconnect(false)}
        primaryButtonOnTap={disconnectOperation}
      ></MOdalCloseConnection>
      <ModalConnectionDetails
        isOpen={!!selectedConn}
        onRequestClose={() => setSelectedConn(null)}
        connection={selectedConn}
      />
    </div>
  );
}

export default Table;
