import { ChartKind, isVizTableConfig } from '@lightdash/common';
import { Box, Tabs, useMantineTheme } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../components/common/MantineIcon';
import { useChartViz } from '../../../components/DataViz/hooks/useChartViz';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import { SemanticViewerResultsRunnerFrontend } from '../runners/SemanticViewerResultsRunner';
import { useAppSelector } from '../store/hooks';
import { selectSemanticLayerInfo, selectSemanticLayerQuery } from '../store/selectors';

enum TabPanel {
    VISUALIZATION_TABLE = 'VISUALIZATION_TABLE',
}

const ContentCharts: FC = () => {
    const mantineTheme = useMantineTheme();

    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);

    const { results, columnNames, activeChartKind, fields, sortBy, filters } =
        useAppSelector((state) => state.semanticViewer);

    const resultsRunner = useMemo(() => {
        return new SemanticViewerResultsRunnerFrontend({
            rows: results ?? [],
            columnNames: columnNames ?? [],
            fields,
            projectUuid,
        });
    }, [columnNames, fields, projectUuid, results]);

    const vizConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, state.semanticViewer.activeChartKind),
    );

    const semanticLayerQuery = useAppSelector((state) =>
        selectSemanticLayerQuery(state),
    );

    const [openPanel, setOpenPanel] = useState<TabPanel>();

    const handleOpenPanel = (panel: TabPanel) => {
        setOpenPanel(panel);
    };

    const handleClosePanel = () => {
        setOpenPanel(undefined);
    };

    const [chartVizQuery, chartSpec] = useChartViz({
        resultsRunner,
        config: vizConfig,
        projectUuid,
        semanticLayerQuery,
        additionalQueryKey: [filters, sortBy],
    });

    const pivotResultsRunner = useMemo(() => {
        return new SemanticViewerResultsRunnerFrontend({
            rows: chartVizQuery.data?.results ?? [],
            columnNames:
                chartVizQuery.data?.columns.map((c) => c.reference) ?? [],
            fields: fields,
            projectUuid,
        });
    }, [
        chartVizQuery.data?.columns,
        chartVizQuery.data?.results,
        projectUuid,
        fields,
    ]);

    return (
        <>
            <PanelGroup direction="vertical">
                <Panel
                    id="semantic-viewer-panel-charts"
                    order={1}
                    minSize={30}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                    }}
                >
                    {vizConfig && isVizTableConfig(vizConfig) ? (
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={vizConfig.columns}
                            flexProps={{
                                m: '-1px',
                                w: '100%',
                                sx: { flexGrow: 1 },
                            }}
                        />
                    ) : vizConfig && !isVizTableConfig(vizConfig) ? (
                        <ChartView
                            config={vizConfig}
                            spec={chartSpec}
                            isLoading={chartVizQuery.isFetching}
                            error={chartVizQuery.error}
                            style={{
                                flexGrow: 1,
                                width: '100%',
                                marginTop: mantineTheme.spacing.sm,
                            }}
                        />
                    ) : null}
                </Panel>

                {openPanel === TabPanel.VISUALIZATION_TABLE && (
                    <>
                        <Box
                            component={PanelResizeHandle}
                            bg="gray.2"
                            h="xs"
                            sx={(theme) => ({
                                transition: 'background-color 0.2s ease-in-out',
                                '&[data-resize-handle-state="hover"]': {
                                    backgroundColor: theme.colors.gray[3],
                                },
                                '&[data-resize-handle-state="drag"]': {
                                    backgroundColor: theme.colors.gray[4],
                                },
                            })}
                        />

                        <Panel
                            id={`semantic-viewer-panel-tab-${TabPanel.VISUALIZATION_TABLE}`}
                            collapsible
                            order={2}
                            defaultSize={25}
                            minSize={10}
                            onCollapse={() => setOpenPanel(undefined)}
                        >
                            <Table
                                resultsRunner={pivotResultsRunner}
                                columnsConfig={Object.fromEntries(
                                    chartVizQuery.data?.columns.map((field) => [
                                        field.reference,
                                        {
                                            visible: true,
                                            reference: field.reference,
                                            label: field.reference,
                                            frozen: false,
                                            // TODO: add aggregation
                                            // aggregation?: VizAggregationOptions;
                                        },
                                    ]) ?? [],
                                )}
                            />
                        </Panel>
                    </>
                )}
            </PanelGroup>

            {activeChartKind !== ChartKind.TABLE ? (
                <Tabs
                    color="gray"
                    inverted
                    allowTabDeactivation
                    value={openPanel ?? null}
                    onTabChange={(newTabValue: TabPanel | null) => {
                        if (newTabValue) {
                            handleOpenPanel(newTabValue);
                        } else {
                            handleClosePanel();
                        }
                    }}
                >
                    <Tabs.List style={{ alignItems: 'center' }} pb="two">
                        <Tabs.Tab
                            value={TabPanel.VISUALIZATION_TABLE}
                            h="xxl"
                            px="lg"
                            icon={<MantineIcon icon={IconTable} />}
                        >
                            Results
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>
            ) : null}
        </>
    );
};

export default ContentCharts;
