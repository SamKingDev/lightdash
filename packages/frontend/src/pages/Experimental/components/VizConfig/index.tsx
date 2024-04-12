import { Button, Group, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import VizConfigDtoFactory from '../../Dto/VizConfigDto';
import { type VizConfigDto } from '../../Dto/VizConfigDto/VizConfigDto';
import { type VizConfiguration } from '../../types';

type VizConfigArguments = {
    vizDto: VizConfigDto;
    onChange: (value: VizConfiguration) => void;
};
const VizConfig = ({ vizDto, onChange }: VizConfigArguments) => {
    const form = useForm({
        initialValues: vizDto.getVizConfig(),
    });
    return (
        <form
            onSubmit={form.onSubmit((values) =>
                onChange({ ...vizDto.getVizConfig(), vizType: values.vizType }),
            )}
        >
            <Group>
                <Select
                    label="Your favorite type of chart"
                    placeholder="Pick one"
                    data={VizConfigDtoFactory.listVizConfigs()}
                    {...form.getInputProps('vizType')}
                />
                <Button type="submit" sx={{ alignSelf: 'flex-end' }}>
                    Apply
                </Button>
            </Group>
        </form>
    );
};

export default VizConfig;
