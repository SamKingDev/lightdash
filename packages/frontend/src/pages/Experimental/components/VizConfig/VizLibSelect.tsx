import { Button, Group, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import { type VizConfigDto } from '../../Dto/VizConfigDto/VizConfigDto';
import VizLibDtoFactory from '../../Dto/VizLibDto';
import { type VizConfiguration } from '../../types';

type VizConfigArguments = {
    vizDto: VizConfigDto;
    onChange: (value: VizConfiguration) => void;
};
const VizLibSelect = ({ vizDto, onChange }: VizConfigArguments) => {
    const form = useForm({
        initialValues: vizDto.getVizConfig(),
    });
    useEffect(() => {
        form.setInitialValues(vizDto.getVizConfig());
        form.setValues(vizDto.getVizConfig());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vizDto]);
    return (
        <form
            onSubmit={form.onSubmit((values) =>
                onChange({ ...vizDto.getVizConfig(), libType: values.libType }),
            )}
        >
            <Group>
                <Select
                    label="Your favorite framework/library"
                    placeholder="Pick one"
                    data={VizLibDtoFactory.listVizLibs(
                        vizDto.getVizConfig().vizType,
                    )}
                    {...form.getInputProps('libType')}
                />
                <Button type="submit" sx={{ alignSelf: 'flex-end' }}>
                    Apply
                </Button>
            </Group>
        </form>
    );
};

export default VizLibSelect;
