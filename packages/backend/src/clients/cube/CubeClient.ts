import cube, { CubeApi, Query } from '@cubejs-client/core';
import {
    MissingConfigError,
    NotFoundError,
    SemanticLayerClient,
    SemanticLayerQuery,
    SemanticLayerResultRow,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import {
    cubeTransfomers,
    getCubeTimeDimensionGranularity,
} from './transformer';

type CubeArgs = {
    lightdashConfig: LightdashConfig;
};

export default class CubeClient implements SemanticLayerClient {
    // eslint-disable-next-line class-methods-use-this
    cubeApi?: CubeApi;

    transformers = cubeTransfomers;

    maxQueryLimit: number;

    maxPartialResultsLimit = 100;

    constructor({ lightdashConfig }: CubeArgs) {
        const { token, domain } = lightdashConfig.cube;
        this.maxQueryLimit = lightdashConfig.query.maxLimit;
        // In development mode, the token is not required for authorization

        if (domain === undefined) {
            console.warn(
                'Cube token and domain are not set, CubeClient will not be initialized',
            );
            return;
        }

        this.cubeApi = cube(token, { apiUrl: `${domain}/cubejs-api/v1` });
    }

    private async _getCubeViews() {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const meta = await this.cubeApi.meta();
        return meta.cubes.filter((c) => c.type === 'view');
    }

    async getViews() {
        const views = await this._getCubeViews();
        return this.transformers.viewsToSemanticLayerViews(views);
    }

    async getFields(
        viewName: string,
        selectedFields: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');

        const cubeMetaApi = await this.cubeApi.meta();
        const views = await this._getCubeViews();
        const view = views.find((v) => v.name === viewName);

        if (view === undefined) {
            throw new NotFoundError(`View ${viewName} not found`);
        }

        const { dimensions: allViewDimensions, measures: allViewMeasures } =
            view;

        if (
            selectedFields.dimensions.length === 0 &&
            selectedFields.timeDimensions.length === 0 &&
            selectedFields.metrics.length === 0
        ) {
            // if no fields are selected, return all fields
            return this.transformers.fieldsToSemanticLayerFields(
                allViewDimensions.map((d) => ({ ...d, visible: true })),
                allViewMeasures.map((m) => ({ ...m, visible: true })),
            );
        }

        const cubeQueryObject: Query = {
            dimensions: selectedFields.dimensions.map((d) => d.name),
            timeDimensions: selectedFields.timeDimensions.map((td) => ({
                dimension: td.name,
                granularity:
                    td.granularity &&
                    getCubeTimeDimensionGranularity(td.granularity),
            })),
            measures: selectedFields.metrics.map((m) => m.name),
        };

        const availableMetrics = cubeMetaApi.membersForQuery(
            cubeQueryObject,
            'measures',
        );

        const metrics = allViewMeasures.map((m) => ({
            ...m,
            visible: !!availableMetrics.find((am) => am.name === m.name),
        }));

        const availableDimensions = cubeMetaApi.membersForQuery(
            cubeQueryObject,
            'dimensions',
        );

        const dimensions = allViewDimensions.map((d) => ({
            ...d,
            visible: !!availableDimensions.find((ad) => ad.name === d.name),
        }));

        return this.transformers.fieldsToSemanticLayerFields(
            dimensions,
            metrics,
        );
    }

    async getResults(query: SemanticLayerQuery) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');

        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);
        const resultSet = await this.cubeApi.load(cubeQuery);

        const cubePivotConfig =
            this.transformers.semanticLayerPivotConfigToPivotConfig(
                query.pivotConfig,
            );

        const pivotedResults = resultSet.tablePivot(cubePivotConfig);

        return this.transformers.resultsToResultRows(pivotedResults);
    }

    async streamResults(
        _projectUuid: string,
        query: SemanticLayerQuery,
        callback: (results: SemanticLayerResultRow[]) => void,
    ): Promise<number> {
        // if the query limit is not set, use the default limit from the config (LIGHTDASH_QUERY_MAX_LIMIT || 5000)
        const queryLimit = Math.min(query.limit || 500, this.maxQueryLimit);

        // if the query limit is less than the max partial results limit, use the query limit as the partial results limit
        let partialResultsLimit = Math.min(
            this.maxPartialResultsLimit,
            queryLimit,
        );

        let prevPartialResultsLimit = partialResultsLimit;
        let offset = 0;
        let partialResults: SemanticLayerResultRow[] = [];

        do {
            /* eslint-disable-next-line no-await-in-loop */
            partialResults = await this.getResults({
                ...query,
                offset,
                limit: partialResultsLimit,
            });

            callback(partialResults);

            // update the offset
            offset += partialResults.length;

            // keep track of the previous partial results limit so that we can stop when result count is less than it
            prevPartialResultsLimit = partialResultsLimit;

            // decrease the amount of results to fetch if the limit is less than the query limit so that we don't fetch more than the query limit
            partialResultsLimit = Math.min(
                partialResultsLimit,
                queryLimit - offset,
            );
        } while (
            partialResults.length > 0 &&
            partialResults.length >= prevPartialResultsLimit &&
            offset < queryLimit
        );

        // return the total number of results
        return offset;
    }

    async getSql(query: SemanticLayerQuery) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);
        const sql = await this.cubeApi.sql(cubeQuery);
        return this.transformers.sqlToString(sql);
    }
}
