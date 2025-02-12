import { ChartKind } from '@lightdash/common';
import { Button, Input, useMantineTheme } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { selectChartConfigByKind } from '../../../../components/DataViz/store/selectors';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useSavedSemanticViewerChartUpdateMutation } from '../../api/hooks';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../../store/selectors';
import {
    updateName,
    updateSaveModalOpen,
} from '../../store/semanticViewerSlice';

const SemanticViewerSaveChartContent: FC = () => {
    const theme = useMantineTheme();
    const { showToastSuccess } = useToaster();

    const dispatch = useAppDispatch();

    const name = useAppSelector((state) => state.semanticViewer.name);
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);
    const semanticLayerView = useAppSelector(
        (state) => state.semanticViewer.semanticLayerView,
    );
    const savedSemanticViewerChartUuid = useAppSelector(
        (state) => state.semanticViewer.savedSemanticViewerChartUuid,
    );
    const selectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const activeChartKind = useAppSelector(
        (state) => state.semanticViewer.activeChartKind,
    );
    const selectedChartConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, activeChartKind ?? ChartKind.TABLE),
    );

    const handleOpenSaveModal = () => {
        dispatch(updateSaveModalOpen(true));
    };

    const chartUpdateMutation = useSavedSemanticViewerChartUpdateMutation({
        projectUuid,
    });

    const handleUpdate = useCallback(async () => {
        if (
            !savedSemanticViewerChartUuid ||
            !activeChartKind ||
            !selectedChartConfig
        )
            return;

        await chartUpdateMutation.mutateAsync({
            uuid: savedSemanticViewerChartUuid,
            payload: {
                versionedData: {
                    chartKind: activeChartKind,
                    config: selectedChartConfig,
                    semanticLayerQuery,
                    // TODO: view should never be ''. this is a temporary fix for semantic layers without views
                    semanticLayerView: semanticLayerView ?? '',
                },
            },
        });

        showToastSuccess({
            title: 'Chart saved successfully!',
        });
    }, [
        activeChartKind,
        chartUpdateMutation,
        savedSemanticViewerChartUuid,
        selectedChartConfig,
        semanticLayerQuery,
        semanticLayerView,
        showToastSuccess,
    ]);

    const canSave = selectedFieldNames.length > 0 && !!selectedChartConfig;

    return (
        <>
            <Input
                w="100%"
                placeholder="Untitled chart"
                value={name}
                onChange={(e) => {
                    dispatch(updateName(e.currentTarget.value));
                }}
                styles={{
                    input: {
                        background: 'transparent',
                        border: 0,

                        '&:hover': {
                            background: theme.colors.gray[2],
                        },
                        '&:focus': {
                            background: theme.colors.gray[3],
                        },
                    },
                }}
            />

            <Button
                compact
                leftIcon={<MantineIcon icon={IconDeviceFloppy} />}
                variant="link"
                disabled={!canSave}
                onClick={
                    savedSemanticViewerChartUuid
                        ? handleUpdate
                        : handleOpenSaveModal
                }
            >
                Save
            </Button>
        </>
    );
};

export default SemanticViewerSaveChartContent;
