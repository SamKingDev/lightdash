import {
    assertUnreachable,
    BinType,
    CompiledDimension,
    CompiledMetricQuery,
    convertBigqueryTimezone,
    CustomDimension,
    DbtModelJoinType,
    Explore,
    fieldId,
    FieldId,
    FieldReferenceError,
    FieldType,
    FilterGroup,
    FilterRule,
    ForbiddenError,
    getCustomDimensionId,
    getCustomMetricDimensionId,
    getDateDimension,
    getDimensions,
    getFieldQuoteChar,
    getFieldsFromMetricQuery,
    getFilterRulesFromGroup,
    getMetrics,
    getSqlForTruncatedDate,
    IntrinsicUserAttributes,
    isAndFilterGroup,
    isFilterGroup,
    ItemsMap,
    parseAllReferences,
    renderFilterRuleSql,
    renderTableCalculationFilterRuleSql,
    SortField,
    SupportedDbtAdapter,
    UserAttributeValueMap,
    WarehouseClient,
    WeekDay,
} from '@lightdash/common';
import { isArray } from 'lodash';
import { hasUserAttribute } from './services/UserAttributesService/UserAttributeUtils';

const getDimensionFromId = (
    dimId: FieldId,
    explore: Explore,
    adapterType: SupportedDbtAdapter,
    startOfWeek: WeekDay | null | undefined,
): CompiledDimension => {
    const dimensions = getDimensions(explore);
    const dimension = dimensions.find((d) => fieldId(d) === dimId);

    if (dimension === undefined) {
        const { baseDimensionId, newTimeFrame } = getDateDimension(dimId);

        if (baseDimensionId) {
            const baseField = getDimensionFromId(
                baseDimensionId,
                explore,
                adapterType,
                startOfWeek,
            );
            if (baseField && newTimeFrame)
                return {
                    ...baseField,
                    compiledSql: getSqlForTruncatedDate(
                        adapterType,
                        newTimeFrame,
                        baseField.compiledSql,
                        baseField.type,
                        startOfWeek,
                    ),
                    timeInterval: newTimeFrame,
                };
        }

        throw new FieldReferenceError(
            `Tried to reference dimension with unknown field id: ${dimId}`,
        );
    }
    return dimension;
};

const getMetricFromId = (
    metricId: FieldId,
    explore: Explore,
    compiledMetricQuery: CompiledMetricQuery,
) => {
    const metrics = [
        ...getMetrics(explore),
        ...(compiledMetricQuery.compiledAdditionalMetrics || []),
    ];
    const metric = metrics.find((m) => fieldId(m) === metricId);
    if (metric === undefined)
        throw new FieldReferenceError(
            `Tried to reference metric with unknown field id: ${metricId}`,
        );
    return metric;
};

const replaceAttributes = (
    regex: RegExp,
    sqlFilter: string,
    userAttributes: Record<string, string | string[]>,
    stringQuoteChar: string,
    filter: string,
): string => {
    const sqlAttributes = sqlFilter.match(regex);

    if (sqlAttributes === null || sqlAttributes.length === 0) {
        return sqlFilter;
    }

    const replacedUserAttributesSql = sqlAttributes.reduce<string>(
        (acc, sqlAttribute) => {
            const attribute = sqlAttribute.replace(regex, '$1');
            const attributeValues = userAttributes[attribute];

            if (attributeValues === undefined) {
                throw new ForbiddenError(
                    `Missing user attribute "${attribute}" on ${filter}: "${sqlFilter}"`,
                );
            }
            if (attributeValues.length === 0) {
                throw new ForbiddenError(
                    `Invalid or missing user attribute "${attribute}" on ${filter}: "${sqlFilter}"`,
                );
            }

            const valueString = isArray(attributeValues)
                ? attributeValues
                      .map(
                          (attributeValue) =>
                              `${stringQuoteChar}${attributeValue}${stringQuoteChar}`,
                      )
                      .join(', ')
                : `${stringQuoteChar}${attributeValues}${stringQuoteChar}`;

            return acc.replace(sqlAttribute, valueString);
        },
        sqlFilter,
    );

    // NOTE: Wrap the replaced user attributes in parentheses to avoid issues with AND/OR operators
    return `(${replacedUserAttributesSql})`;
};

export const replaceUserAttributes = (
    sqlFilter: string,
    intrinsicUserAttributes: IntrinsicUserAttributes,
    userAttributes: UserAttributeValueMap,
    stringQuoteChar: string = "'",
    filter: string = 'sql_filter',
): string => {
    const userAttributeRegex =
        /\$\{(?:lightdash|ld)\.(?:attribute|attributes|attr)\.(\w+)\}/g;
    const intrinsicUserAttributeRegex =
        /\$\{(?:lightdash|ld)\.(?:user)\.(\w+)\}/g;

    // Replace user attributes in the SQL filter
    const replacedSqlFilter = replaceAttributes(
        userAttributeRegex,
        sqlFilter,
        userAttributes,
        stringQuoteChar,
        filter,
    );

    // Replace intrinsic user attributes in the SQL filter
    return replaceAttributes(
        intrinsicUserAttributeRegex,
        replacedSqlFilter,
        intrinsicUserAttributes,
        stringQuoteChar,
        filter,
    );
};

export const assertValidDimensionRequiredAttribute = (
    dimension: CompiledDimension,
    userAttributes: UserAttributeValueMap,
    field: string,
) => {
    // Throw error if user does not have the right requiredAttribute for this dimension
    if (dimension.requiredAttributes)
        Object.entries(dimension.requiredAttributes).map((attribute) => {
            const [attributeName, value] = attribute;
            let hasUserAttributeVal = false;

            if (typeof value === 'string') {
                hasUserAttributeVal = hasUserAttribute(
                    userAttributes,
                    attributeName,
                    value,
                );
            } else {
                hasUserAttributeVal = value.some((v) =>
                    hasUserAttribute(userAttributes, attributeName, v),
                );
            }

            if (!hasUserAttributeVal) {
                throw new ForbiddenError(
                    `Invalid or missing user attribute "${attribute}" on ${field}`,
                );
            }
            return undefined;
        });
};

export type BuildQueryProps = {
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
    warehouseClient: WarehouseClient;
    userAttributes?: UserAttributeValueMap;
    intrinsicUserAttributes: IntrinsicUserAttributes;
};

const getJoinType = (type: DbtModelJoinType = 'left') => {
    switch (type) {
        case 'inner':
            return 'INNER JOIN';
        case 'full':
            return 'FULL OUTER JOIN';
        case 'left':
            return 'LEFT OUTER JOIN';
        case 'right':
            return 'RIGHT OUTER JOIN';
        default:
            return assertUnreachable(type, `Unknown join type: ${type}`);
    }
};

export const getCustomDimensionSql = ({
    warehouseClient,
    explore,
    compiledMetricQuery,
    userAttributes = {},
    sorts = [],
}: {
    warehouseClient: WarehouseClient;
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
    userAttributes: UserAttributeValueMap | undefined;
    sorts: SortField[] | undefined;
}):
    | { ctes: string[]; joins: string[]; tables: string[]; selects: string[] }
    | undefined => {
    const { customDimensions } = compiledMetricQuery;
    const startOfWeek = warehouseClient.getStartOfWeek();

    const fieldQuoteChar = getFieldQuoteChar(warehouseClient.credentials.type);
    if (customDimensions === undefined || customDimensions.length === 0)
        return undefined;

    const getCteReference = (customDimension: CustomDimension) =>
        `${getCustomDimensionId(customDimension)}_cte`;

    const adapterType: SupportedDbtAdapter = warehouseClient.getAdapterType();
    const ctes = customDimensions.reduce<string[]>((acc, customDimension) => {
        switch (customDimension.binType) {
            case BinType.FIXED_WIDTH:
            case BinType.CUSTOM_RANGE:
                // No need for cte
                return acc;
            case BinType.FIXED_NUMBER:
                const dimension = getDimensionFromId(
                    customDimension.dimensionId,
                    explore,
                    adapterType,
                    startOfWeek,
                );
                const baseTable =
                    explore.tables[customDimension.table].sqlTable;
                const cte = ` ${getCteReference(customDimension)} AS (
                    SELECT
                        FLOOR(MIN(${dimension.compiledSql})) AS min_id,
                        CEIL(MAX(${dimension.compiledSql})) AS max_id,
                        FLOOR((MAX(${dimension.compiledSql}) - MIN(${
                    dimension.compiledSql
                })) / ${customDimension.binNumber}) AS bin_width
                    FROM ${baseTable} AS ${fieldQuoteChar}${
                    customDimension.table
                }${fieldQuoteChar}
                )`;

                return [...acc, cte];
            default:
                assertUnreachable(
                    customDimension.binType,
                    `Unknown bin type on cte: ${customDimension.binType}`,
                );
        }
        return acc;
    }, []);

    const joins = customDimensions.reduce<string[]>((acc, customDimension) => {
        switch (customDimension.binType) {
            case BinType.CUSTOM_RANGE:
            case BinType.FIXED_WIDTH:
                // No need for cte
                return acc;
            case BinType.FIXED_NUMBER:
                return [...acc, getCteReference(customDimension)];
            default:
                assertUnreachable(
                    customDimension.binType,
                    `Unknown bin type on join: ${customDimension.binType}`,
                );
        }
        return acc;
    }, []);

    const tables = customDimensions.map(
        (customDimension) => customDimension.table,
    );

    const selects = customDimensions.reduce<string[]>(
        (acc, customDimension) => {
            const dimension = getDimensionFromId(
                customDimension.dimensionId,
                explore,
                adapterType,
                startOfWeek,
            );
            // Check required attribute permission for parent dimension
            assertValidDimensionRequiredAttribute(
                dimension,
                userAttributes,
                `custom dimension: "${customDimension.name}"`,
            );

            const customDimensionName = `${fieldQuoteChar}${getCustomDimensionId(
                customDimension,
            )}${fieldQuoteChar}`;
            const customDimensionOrder = `${fieldQuoteChar}${getCustomDimensionId(
                customDimension,
            )}_order${fieldQuoteChar}`;
            const cte = `${getCteReference(customDimension)}`;

            // If a custom dimension is sorted, we need to generate a special SQL select that returns a number
            // and not the range as a string
            const isSorted =
                sorts.length > 0 &&
                sorts.find(
                    (sortField) =>
                        getCustomDimensionId(customDimension) ===
                        sortField.fieldId,
                );
            const quoteChar = warehouseClient.getStringQuoteChar();
            const dash = `${quoteChar} - ${quoteChar}`;
            switch (customDimension.binType) {
                case BinType.FIXED_WIDTH:
                    if (!customDimension.binWidth) {
                        throw new Error(
                            `Undefined binWidth for custom dimension ${BinType.FIXED_WIDTH} `,
                        );
                    }

                    const width = customDimension.binWidth;
                    const widthSql = `${warehouseClient.concatString(
                        `FLOOR(${dimension.compiledSql} / ${width}) * ${width}`,
                        dash,
                        `(FLOOR(${dimension.compiledSql} / ${width}) + 1) * ${width} - 1`,
                    )} AS ${customDimensionName}`;

                    if (isSorted) {
                        return [
                            ...acc,
                            widthSql,
                            `FLOOR(${dimension.compiledSql} / ${width}) * ${width} AS ${customDimensionOrder}`,
                        ];
                    }
                    return [...acc, widthSql];
                case BinType.FIXED_NUMBER:
                    if (!customDimension.binNumber) {
                        throw new Error(
                            `Undefined binNumber for custom dimension ${BinType.FIXED_NUMBER} `,
                        );
                    }

                    if (customDimension.binNumber <= 1) {
                        // Edge case, bin number with only one bucket does not need a CASE statement
                        return [
                            ...acc,
                            `${warehouseClient.concatString(
                                `${cte}.min_id`,
                                dash,
                                `${cte}.max_id`,
                            )} AS ${customDimensionName}`,
                        ];
                    }

                    const binWidth = `${cte}.bin_width`;

                    const from = (i: number) =>
                        `${cte}.min_id + ${binWidth} * ${i}`;
                    const to = (i: number) =>
                        `${cte}.min_id + ${binWidth} * ${i + 1}`;

                    const whens = Array.from(
                        Array(customDimension.binNumber).keys(),
                    ).map((i) => {
                        if (i !== customDimension.binNumber! - 1) {
                            return `WHEN ${dimension.compiledSql} >= ${from(
                                i,
                            )} AND ${dimension.compiledSql} < ${to(
                                i,
                            )} THEN ${warehouseClient.concatString(
                                from(i),
                                dash,
                                to(i),
                            )}`;
                        }
                        return `ELSE ${warehouseClient.concatString(
                            from(i),
                            dash,
                            `${cte}.max_id`,
                        )}`;
                    });

                    if (isSorted) {
                        const sortWhens = Array.from(
                            Array(customDimension.binNumber).keys(),
                        ).map((i) => {
                            if (i !== customDimension.binNumber! - 1) {
                                return `WHEN ${dimension.compiledSql} >= ${from(
                                    i,
                                )} AND ${dimension.compiledSql} < ${to(
                                    i,
                                )} THEN ${i}`;
                            }
                            return `ELSE ${i}`;
                        });

                        return [
                            ...acc,
                            `CASE
                            ${whens.join('\n')}
                            END
                            AS ${customDimensionName}`,
                            `CASE
                            ${sortWhens.join('\n')}
                            END
                            AS ${customDimensionOrder}`,
                        ];
                    }

                    return [
                        ...acc,
                        `CASE
                        ${whens.join('\n')}
                        END
                        AS ${customDimensionName}
                    `,
                    ];
                case BinType.CUSTOM_RANGE:
                    if (!customDimension.customRange) {
                        throw new Error(
                            `Undefined customRange for custom dimension ${BinType.CUSTOM_RANGE} `,
                        );
                    }

                    const rangeWhens = customDimension.customRange.map(
                        (range) => {
                            if (range.from === undefined) {
                                // First range
                                return `WHEN ${dimension.compiledSql} < ${
                                    range.to
                                } THEN ${warehouseClient.concatString(
                                    `${quoteChar}<${quoteChar}`,
                                    `${range.to}`,
                                )}`;
                            }
                            if (range.to === undefined) {
                                // Last range
                                return `ELSE ${warehouseClient.concatString(
                                    `${quoteChar}≥${quoteChar}`,
                                    `${range.from}`,
                                )}`;
                            }

                            return `WHEN ${dimension.compiledSql} >= ${
                                range.from
                            } AND ${dimension.compiledSql} < ${
                                range.to
                            } THEN ${warehouseClient.concatString(
                                `${range.from}`,
                                "'-'",
                                `${range.to}`,
                            )}`;
                        },
                    );

                    const customRangeSql = `CASE
                        ${rangeWhens.join('\n')}
                        END
                        AS ${customDimensionName}`;

                    if (isSorted) {
                        const sortedWhens = customDimension.customRange.map(
                            (range, i) => {
                                if (range.from === undefined) {
                                    return `WHEN ${dimension.compiledSql} < ${range.to} THEN ${i}`;
                                }
                                if (range.to === undefined) {
                                    return `ELSE ${i}`;
                                }

                                return `WHEN ${dimension.compiledSql} >= ${range.from} AND ${dimension.compiledSql} < ${range.to} THEN ${i}`;
                            },
                        );

                        return [
                            ...acc,
                            customRangeSql,
                            `CASE
                        ${sortedWhens.join('\n')}
                        END
                        AS ${customDimensionOrder}`,
                        ];
                    }

                    return [...acc, customRangeSql];

                default:
                    assertUnreachable(
                        customDimension.binType,
                        `Unknown bin type on sql: ${customDimension.binType}`,
                    );
            }
            return acc;
        },
        [],
    );

    return { ctes, joins, tables: [...new Set(tables)], selects };
};

export type CompiledQuery = {
    query: string;
    hasExampleMetric: boolean;
    fields: ItemsMap;
};

export const buildQuery = ({
    explore,
    compiledMetricQuery,
    warehouseClient,
    intrinsicUserAttributes,
    userAttributes = {},
}: BuildQueryProps): CompiledQuery => {
    let hasExampleMetric: boolean = false;
    const fields = getFieldsFromMetricQuery(compiledMetricQuery, explore);
    const adapterType: SupportedDbtAdapter = warehouseClient.getAdapterType();
    const {
        dimensions,
        metrics,
        filters,
        sorts,
        limit,
        additionalMetrics,
        customDimensions,
        timezone,
    } = compiledMetricQuery;

    const baseTable = explore.tables[explore.baseTable].sqlTable;
    const fieldQuoteChar = getFieldQuoteChar(warehouseClient.credentials.type);
    const stringQuoteChar = warehouseClient.getStringQuoteChar();
    const escapeStringQuoteChar = warehouseClient.getEscapeStringQuoteChar();
    const startOfWeek = warehouseClient.getStartOfWeek();

    const dimensionSelects = dimensions.map((field) => {
        const alias = field;
        const dimension = getDimensionFromId(
            field,
            explore,
            adapterType,
            startOfWeek,
        );

        assertValidDimensionRequiredAttribute(
            dimension,
            userAttributes,
            `dimension: "${field}"`,
        );
        const convertedDimension = convertBigqueryTimezone(
            dimension,
            adapterType,
            dimension.compiledSql,
            timezone,
        );
        return `  ${dimension.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
    });

    const customDimensionSql = getCustomDimensionSql({
        warehouseClient,
        explore,
        compiledMetricQuery,
        userAttributes,
        sorts,
    });

    const sqlFrom = `FROM ${baseTable} AS ${fieldQuoteChar}${explore.baseTable}${fieldQuoteChar}`;

    const metricSelects = metrics.map((field) => {
        const alias = field;
        const metric = getMetricFromId(field, explore, compiledMetricQuery);
        if (metric.isAutoGenerated) {
            hasExampleMetric = true;
        }
        return `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
    });

    if (additionalMetrics)
        additionalMetrics.forEach((metric) => {
            if (
                metric.baseDimensionName === undefined ||
                !metrics.includes(`${metric.table}_${metric.name}`)
            )
                return;

            const dimensionId = getCustomMetricDimensionId(metric);
            const dimension = getDimensionFromId(
                dimensionId,
                explore,
                adapterType,
                startOfWeek,
            );

            assertValidDimensionRequiredAttribute(
                dimension,
                userAttributes,
                `custom metric: "${metric.name}"`,
            );
        });
    const selectedTables = new Set<string>([
        ...metrics.reduce<string[]>((acc, field) => {
            const metric = getMetricFromId(field, explore, compiledMetricQuery);
            return [...acc, ...(metric.tablesReferences || [metric.table])];
        }, []),
        ...dimensions.reduce<string[]>((acc, field) => {
            const dim = getDimensionFromId(
                field,
                explore,
                adapterType,
                startOfWeek,
            );
            return [...acc, ...(dim.tablesReferences || [dim.table])];
        }, []),
        ...(customDimensionSql?.tables || []),
        ...getFilterRulesFromGroup(filters.dimensions).reduce<string[]>(
            (acc, filterRule) => {
                const dim = getDimensionFromId(
                    filterRule.target.fieldId,
                    explore,
                    adapterType,
                    startOfWeek,
                );
                return [...acc, ...(dim.tablesReferences || [dim.table])];
            },
            [],
        ),
        ...getFilterRulesFromGroup(filters.metrics).reduce<string[]>(
            (acc, filterRule) => {
                const metric = getMetricFromId(
                    filterRule.target.fieldId,
                    explore,
                    compiledMetricQuery,
                );
                return [...acc, ...(metric.tablesReferences || [metric.table])];
            },
            [],
        ),
    ]);

    const getJoinedTables = (tableNames: string[]): string[] => {
        if (tableNames.length === 0) {
            return [];
        }
        const allNewReferences = explore.joinedTables.reduce<string[]>(
            (sum, joinedTable) => {
                if (tableNames.includes(joinedTable.table)) {
                    const newReferencesInJoin = parseAllReferences(
                        joinedTable.sqlOn,
                        joinedTable.table,
                    ).reduce<string[]>(
                        (acc, { refTable }) =>
                            !tableNames.includes(refTable)
                                ? [...acc, refTable]
                                : acc,
                        [],
                    );
                    return [...sum, ...newReferencesInJoin];
                }
                return sum;
            },
            [],
        );
        return [...allNewReferences, ...getJoinedTables(allNewReferences)];
    };
    const joinedTables = new Set([
        ...selectedTables,
        ...getJoinedTables([...selectedTables]),
    ]);

    const sqlJoins = explore.joinedTables
        .filter((join) => joinedTables.has(join.table) || join.always)
        .map((join) => {
            const joinTable = explore.tables[join.table].sqlTable;
            const joinType = getJoinType(join.type);

            const alias = join.table;
            const parsedSqlOn = replaceUserAttributes(
                join.compiledSqlOn,
                intrinsicUserAttributes,
                userAttributes,
                stringQuoteChar,
                'sql_on',
            );
            return `${joinType} ${joinTable} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}\n  ON ${parsedSqlOn}`;
        })
        .join('\n');

    const filteredMetricSelects = getFilterRulesFromGroup(
        filters.metrics,
    ).reduce<string[]>((acc, filter) => {
        const metricInSelect = metrics.find(
            (metric) => metric === filter.target.fieldId,
        );
        if (metricInSelect !== undefined) {
            return acc;
        }
        const alias = filter.target.fieldId;
        const metric = getMetricFromId(
            filter.target.fieldId,
            explore,
            compiledMetricQuery,
        );
        const renderedSql = `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
        return acc.includes(renderedSql) ? acc : [...acc, renderedSql];
    }, []);

    const sqlSelect = `SELECT\n${[
        ...dimensionSelects,
        ...(customDimensionSql?.selects || []),
        ...metricSelects,
        ...filteredMetricSelects,
    ].join(',\n')}`;

    const groups = [
        ...(dimensionSelects.length > 0 ? dimensionSelects : []),
        ...(customDimensionSql?.selects || []),
    ];
    const sqlGroupBy =
        groups.length > 0
            ? `GROUP BY ${groups.map((val, i) => i + 1).join(',')}`
            : '';
    const fieldOrders = sorts.map((sort) => {
        if (
            customDimensions &&
            customDimensions.find(
                (customDimension) =>
                    getCustomDimensionId(customDimension) === sort.fieldId,
            )
        ) {
            // Custom dimensions will have a separate `select` for ordering,
            // that returns the min value (int) of the bin, rather than a string,
            // so we can use it for sorting
            return `${fieldQuoteChar}${sort.fieldId}_order${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }`;
        }
        return `${fieldQuoteChar}${sort.fieldId}${fieldQuoteChar}${
            sort.descending ? ' DESC' : ''
        }`;
    });
    const sqlOrderBy =
        fieldOrders.length > 0 ? `ORDER BY ${fieldOrders.join(', ')}` : '';
    const sqlFilterRule = (filter: FilterRule, fieldType: FieldType) => {
        if (fieldType === FieldType.TABLE_CALCULATION) {
            const field = compiledMetricQuery.compiledTableCalculations?.find(
                (tc) =>
                    `table_calculation_${tc.name}` === filter.target.fieldId,
            );
            return renderTableCalculationFilterRuleSql(
                filter,
                field,
                fieldQuoteChar,
                stringQuoteChar,
                escapeStringQuoteChar,
            );
        }

        const field =
            fieldType === FieldType.DIMENSION
                ? getDimensions(explore).find(
                      (d) => fieldId(d) === filter.target.fieldId,
                  )
                : getMetricFromId(
                      filter.target.fieldId,
                      explore,
                      compiledMetricQuery,
                  );
        if (!field) {
            throw new FieldReferenceError(
                `Filter has a reference to an unknown ${fieldType}: ${filter.target.fieldId}`,
            );
        }

        return renderFilterRuleSql(
            filter,
            field,
            fieldQuoteChar,
            stringQuoteChar,
            escapeStringQuoteChar,
            startOfWeek,
            adapterType,
            timezone,
        );
    };

    const getNestedFilterSQLFromGroup = (
        filterGroup: FilterGroup | undefined,
        fieldType: FieldType,
    ): string | undefined => {
        if (filterGroup) {
            const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
            const items = isAndFilterGroup(filterGroup)
                ? filterGroup.and
                : filterGroup.or;
            if (items.length === 0) return undefined;
            const filterRules: string[] = items.reduce<string[]>(
                (sum, item) => {
                    const filterSql: string | undefined = isFilterGroup(item)
                        ? getNestedFilterSQLFromGroup(item, fieldType)
                        : `(\n  ${sqlFilterRule(item, fieldType)}\n)`;
                    return filterSql ? [...sum, filterSql] : sum;
                },
                [],
            );
            return filterRules.length > 0
                ? `(${filterRules.join(` ${operator} `)})`
                : undefined;
        }
        return undefined;
    };

    const baseTableSqlWhere = explore.tables[explore.baseTable].sqlWhere;

    const tableSqlWhere = baseTableSqlWhere
        ? [
              replaceUserAttributes(
                  baseTableSqlWhere,
                  intrinsicUserAttributes,
                  userAttributes,
                  stringQuoteChar,
              ),
          ]
        : [];

    const nestedFilterSql = getNestedFilterSQLFromGroup(
        filters.dimensions,
        FieldType.DIMENSION,
    );
    const nestedFilterWhere = nestedFilterSql ? [nestedFilterSql] : [];
    const allSqlFilters = [...tableSqlWhere, ...nestedFilterWhere];

    const sqlWhere =
        allSqlFilters.length > 0 ? `WHERE ${allSqlFilters.join(' AND ')}` : '';

    const whereMetricFilters = getNestedFilterSQLFromGroup(
        filters.metrics,
        FieldType.METRIC,
    );

    const tableCalculationFilters = getNestedFilterSQLFromGroup(
        filters.tableCalculations,
        FieldType.TABLE_CALCULATION,
    );

    const sqlLimit = `LIMIT ${limit}`;

    if (
        compiledMetricQuery.compiledTableCalculations.length > 0 ||
        whereMetricFilters
    ) {
        const cteSql = [
            sqlSelect,
            sqlFrom,
            sqlJoins,
            customDimensionSql && customDimensionSql.joins.length > 0
                ? `CROSS JOIN ${customDimensionSql.joins.join(',\n')}`
                : undefined,
            sqlWhere,
            sqlGroupBy,
        ]
            .filter((l) => l !== undefined)
            .join('\n');
        const cteName = 'metrics';
        const ctes = [
            ...(customDimensionSql?.ctes || []),
            `${cteName} AS (\n${cteSql}\n)`,
        ];
        const tableCalculationSelects =
            compiledMetricQuery.compiledTableCalculations.map(
                (tableCalculation) => {
                    const alias = tableCalculation.name;
                    return `  ${tableCalculation.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
                },
            );
        const finalSelect = `SELECT\n${['  *', ...tableCalculationSelects].join(
            ',\n',
        )}`;
        const finalFrom = `FROM ${cteName}`;
        const finalSqlWhere = whereMetricFilters
            ? `WHERE ${whereMetricFilters}`
            : '';
        const secondQuery = [finalSelect, finalFrom, finalSqlWhere].join('\n');

        let finalQuery = secondQuery;
        if (tableCalculationFilters) {
            const queryResultCteName = 'table_calculations';
            ctes.push(`${queryResultCteName} AS (\n${secondQuery}\n)`);

            finalQuery = `SELECT * FROM ${queryResultCteName}`;

            if (tableCalculationFilters)
                finalQuery += ` WHERE ${tableCalculationFilters}`;
        }
        const cte = `WITH ${ctes.join(',\n')}`;

        return {
            query: [cte, finalQuery, sqlOrderBy, sqlLimit].join('\n'),
            hasExampleMetric,
            fields,
        };
    }

    const metricQuerySql = [
        customDimensionSql && customDimensionSql.ctes.length > 0
            ? `WITH ${customDimensionSql.ctes.join(',\n')}`
            : undefined,
        sqlSelect,
        sqlFrom,
        sqlJoins,
        customDimensionSql && customDimensionSql.joins.length > 0
            ? `CROSS JOIN ${customDimensionSql.joins.join(',\n')}`
            : undefined,
        sqlWhere,
        sqlGroupBy,
        sqlOrderBy,
        sqlLimit,
    ]
        .filter((l) => l !== undefined)
        .join('\n');

    return {
        query: metricQuerySql,
        hasExampleMetric,
        fields,
    };
};
