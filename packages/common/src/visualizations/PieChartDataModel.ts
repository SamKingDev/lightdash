import { DimensionType } from '../types/field';
import { type ChartKind } from '../types/savedCharts';
import { type SemanticLayerQuery } from '../types/semanticLayer';
import {
    type PivotChartData,
    type VizConfigErrors,
    type VizPieChartConfig,
    type VizPieChartDisplay,
} from './types';
import {
    type IResultsRunner,
    type PivotChartLayout,
} from './types/IResultsRunner';

export class PieChartDataModel {
    private readonly resultsRunner: IResultsRunner;

    constructor(args: { resultsRunner: IResultsRunner }) {
        this.resultsRunner = args.resultsRunner;
    }

    getDefaultLayout(): PivotChartLayout | undefined {
        const {
            groupFieldOptions,
            metricFieldOptions,
            customMetricFieldOptions,
        } = this.getResultOptions();

        const categoricalFields = groupFieldOptions.filter(
            (field) => field.dimensionType === DimensionType.STRING,
        );
        const booleanFields = groupFieldOptions.filter(
            (field) => field.dimensionType === DimensionType.BOOLEAN,
        );
        const dateFields = groupFieldOptions.filter(
            (field) =>
                field.dimensionType &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    field.dimensionType,
                ),
        );
        const numericFields = groupFieldOptions.filter(
            (field) => field.dimensionType === DimensionType.NUMBER,
        );

        const groupField =
            categoricalFields[0] ||
            booleanFields[0] ||
            dateFields[0] ||
            numericFields[0];
        if (groupField === undefined) {
            return undefined;
        }

        const group = {
            reference: groupField.reference,
            dimensionType: groupField.dimensionType,
            axisType: groupField.axisType,
        };

        const metricFields = [
            ...metricFieldOptions,
            ...customMetricFieldOptions,
        ];

        const metricField = metricFields.filter(
            (field) => field.reference !== group.reference,
        )[0];

        if (metricField === undefined) {
            return undefined;
        }

        // TODO: this should have its own type so it doesnt reference x and y
        return {
            x: group,
            y: [
                {
                    reference: metricField.reference,
                    aggregation: metricField.aggregation,
                },
            ],
            groupBy: [],
        };
    }

    mergeConfig(
        chartKind: ChartKind.PIE,
        fieldConfig: PivotChartLayout | undefined,
        display: VizPieChartDisplay | undefined,
    ): VizPieChartConfig {
        const newDefaultLayout = this.getDefaultLayout();

        const mergedLayout =
            newDefaultLayout?.x?.reference === fieldConfig?.x?.reference
                ? fieldConfig
                : newDefaultLayout;

        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: mergedLayout,
            display,
        };
    }

    getResultOptions() {
        return {
            groupFieldOptions: this.resultsRunner.getPivotQueryDimensions(),
            metricFieldOptions: this.resultsRunner.getPivotQueryMetrics(),
            customMetricFieldOptions:
                this.resultsRunner.getPivotQueryCustomMetrics(),
        };
    }

    getConfigErrors(config: PivotChartLayout) {
        const {
            groupFieldOptions,
            metricFieldOptions,
            customMetricFieldOptions,
        } = this.getResultOptions();

        const indexFieldError = Boolean(
            config?.x?.reference &&
                groupFieldOptions.find(
                    (x) => x.reference === config?.x?.reference,
                ) === undefined,
        );

        const metricFieldError = Boolean(
            config?.y?.some(
                (yField) =>
                    yField.reference &&
                    metricFieldOptions.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );

        const customMetricFieldError = Boolean(
            config?.y?.some(
                (yField) =>
                    yField.reference &&
                    customMetricFieldOptions.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );

        if (!indexFieldError && !metricFieldError && !customMetricFieldError) {
            return undefined;
        }

        return {
            ...(indexFieldError &&
                config?.x?.reference && {
                    indexFieldError: {
                        reference: config.x.reference,
                    },
                }),
            // TODO: can we combine metricFieldError and customMetricFieldError?
            // And maybe take out some noise
            ...(metricFieldError &&
                config?.y?.map((y) => y.reference) && {
                    metricFieldError: {
                        references: config?.y.reduce<
                            NonNullable<
                                VizConfigErrors['metricFieldError']
                            >['references']
                        >((acc, y) => {
                            const valuesLayoutOption = metricFieldOptions.find(
                                (v) => v.reference === y.reference,
                            );
                            if (!valuesLayoutOption) {
                                acc.push(y.reference);
                            }
                            return acc;
                        }, []),
                    },
                }),
            ...(customMetricFieldError &&
                config?.y?.map((y) => y.reference) && {
                    customMetricFieldError: {
                        references: config?.y.reduce<
                            NonNullable<
                                VizConfigErrors['customMetricFieldError']
                            >['references']
                        >((acc, y) => {
                            const valuesLayoutOption =
                                customMetricFieldOptions.find(
                                    (v) => v.reference === y.reference,
                                );
                            if (!valuesLayoutOption) {
                                acc.push(y.reference);
                            }
                            return acc;
                        }, []),
                    },
                }),
        };
    }

    async getTransformedData(
        query?: SemanticLayerQuery,
    ): Promise<PivotChartData | undefined> {
        if (!query) {
            return undefined;
        }
        return this.resultsRunner.getPivotedVisualizationData(query);
    }

    getEchartsSpec(
        transformedData: Awaited<ReturnType<typeof this.getTransformedData>>,
        display: VizPieChartDisplay | undefined,
    ) {
        if (!transformedData) {
            return {};
        }

        return {
            legend: {
                show: true,
                orient: 'horizontal',
                type: 'scroll',
                left: 'center',
                top: 'top',
                align: 'auto',
            },
            tooltip: {
                trigger: 'item',
            },
            series: [
                {
                    type: 'pie',
                    radius: display?.isDonut ? ['30%', '70%'] : '50%',
                    center: ['50%', '50%'],
                    data: transformedData.results.map((result) => ({
                        name: transformedData.indexColumn?.reference
                            ? result[transformedData.indexColumn.reference]
                            : '-',
                        groupId: transformedData.indexColumn?.reference,
                        value: result[transformedData.valuesColumns[0]],
                    })),
                },
            ],
        };
    }
}
