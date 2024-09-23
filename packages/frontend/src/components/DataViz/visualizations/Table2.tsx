import {
    SortByDirection,
    type RawResultRow,
    type TableDataModel,
    type VizTableHeaderSortConfig,
} from '@lightdash/common';
import { Badge, Flex, Group, type FlexProps } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { flexRender } from '@tanstack/react-table';
import { useMemo } from 'react';
import { SMALL_TEXT_LENGTH } from '../../common/LightTable';
import MantineIcon from '../../common/MantineIcon';
import BodyCell from '../../common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../common/Table/ScrollableTable/TableBody';
import {
    Table as TableStyled,
    TABLE_HEADER_BG,
    Tr,
} from '../../common/Table/Table.styles';
import { useVirtualTable } from '../hooks/useVirtualTable';

type TableProps = {
    dataModel: TableDataModel;
    flexProps?: FlexProps;
    thSortConfig?: VizTableHeaderSortConfig;
    onTHClick?: (fieldName: string) => void;
};

// TODO: TEMPORARY. Replace table with this when it works
export const Table2 = ({
    dataModel,
    flexProps,
    thSortConfig,
    onTHClick,
}: TableProps) => {
    const { tableWrapperRef, getTableData, paddingTop, paddingBottom } =
        useVirtualTable({ tableDataModel: dataModel });

    const columnsCount = useMemo(
        () => dataModel.getColumnsCount(),
        [dataModel],
    );
    const { headerGroups, virtualRows, rowModelRows } = getTableData();
    const columnsConfig = useMemo(
        () => dataModel.getConfig()?.columns,
        [dataModel],
    );

    console.log('columnsConfig', { columnsConfig, thSortConfig });

    return (
        <Flex
            ref={tableWrapperRef}
            direction="column"
            miw="100%"
            {...flexProps}
            sx={{
                overflow: 'auto',
                fontFamily: "'Inter', sans-serif",
                fontFeatureSettings: "'tnum'",
                flexGrow: 1,
                ...flexProps?.sx,
            }}
        >
            <TableStyled>
                <thead>
                    <tr>
                        {headerGroups.map((headerGroup) =>
                            headerGroup.headers.map((header) => {
                                const sortConfig = thSortConfig?.[header.id];
                                const onClick =
                                    sortConfig && onTHClick
                                        ? () => onTHClick(header.id)
                                        : undefined;

                                return (
                                    <th
                                        key={header.id}
                                        onClick={onClick}
                                        style={
                                            onClick
                                                ? {
                                                      cursor: 'pointer',
                                                      backgroundColor:
                                                          TABLE_HEADER_BG,
                                                  }
                                                : {
                                                      backgroundColor:
                                                          TABLE_HEADER_BG,
                                                  }
                                        }
                                    >
                                        <Group spacing="two" fz={13}>
                                            {columnsConfig[header.id]
                                                ?.aggregation && (
                                                <Badge
                                                    size="sm"
                                                    color="indigo"
                                                    radius="xs"
                                                >
                                                    {
                                                        columnsConfig[header.id]
                                                            ?.aggregation
                                                    }
                                                </Badge>
                                            )}
                                            {/* TODO: do we need to check if it's a
                                      placeholder? */}
                                            {flexRender(
                                                header.column.columnDef.header,
                                                header.getContext(),
                                            )}

                                            {onClick &&
                                                sortConfig?.direction && (
                                                    <MantineIcon
                                                        icon={
                                                            sortConfig.direction ===
                                                            SortByDirection.ASC
                                                                ? IconArrowUp
                                                                : IconArrowDown
                                                        }
                                                    ></MantineIcon>
                                                )}
                                        </Group>
                                    </th>
                                );
                            }),
                        )}
                    </tr>
                </thead>
                <tbody>
                    {paddingTop > 0 && (
                        <VirtualizedArea
                            cellCount={columnsCount}
                            padding={paddingTop}
                        />
                    )}
                    {virtualRows.map(({ index }) => {
                        return (
                            <Tr key={index} $index={index}>
                                {rowModelRows[index]
                                    .getVisibleCells()
                                    .map((cell) => {
                                        const cellValue = cell.getValue() as
                                            | RawResultRow[0]
                                            | undefined;

                                        return (
                                            <BodyCell
                                                key={cell.id}
                                                index={index}
                                                cell={cell}
                                                isNumericItem={false}
                                                hasData={!!cellValue}
                                                isLargeText={
                                                    (
                                                        cellValue?.toString() ||
                                                        ''
                                                    ).length > SMALL_TEXT_LENGTH
                                                }
                                            >
                                                {cell.getIsPlaceholder()
                                                    ? null
                                                    : flexRender(
                                                          cell.column.columnDef
                                                              .cell,
                                                          cell.getContext(),
                                                      )}
                                            </BodyCell>
                                        );
                                    })}
                            </Tr>
                        );
                    })}
                    {paddingBottom > 0 && (
                        <VirtualizedArea
                            cellCount={columnsCount}
                            padding={paddingBottom}
                        />
                    )}
                </tbody>
            </TableStyled>
        </Flex>
    );
};
