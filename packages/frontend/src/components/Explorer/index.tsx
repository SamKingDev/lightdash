import { FC, memo } from 'react';
import {
    ExploreMode,
    useExplorerContext,
} from '../../providers/ExplorerProvider';
import ExploreCreate from './ExploreCreate';
import ExploreIndex from './ExploreIndex';
import ExploreViewAndEdit from './ExploreViewAndEdit';

type Props = {
    hideHeader?: boolean;
};

const Explorer: FC<Props> = memo(({ hideHeader = false }) => {
    const mode = useExplorerContext((context) => context.state.mode);

    switch (mode) {
        case ExploreMode.INDEX:
            return <ExploreIndex />;
        case ExploreMode.VIEW:
        case ExploreMode.EDIT:
            return <ExploreViewAndEdit hideHeader={hideHeader} />;
        case ExploreMode.CREATE:
            return <ExploreCreate />;
    }
});

export default Explorer;
