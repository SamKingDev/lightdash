import { subject } from '@casl/ability';
import {
    ForbiddenError,
    MissingConfigError,
    ParameterError,
    SemanticLayerClientInfo,
    SemanticLayerField,
    SemanticLayerQuery,
    SemanticLayerQueryPayload,
    SemanticLayerResultRow,
    SemanticLayerView,
    SessionUser,
    type AbilityAction,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { S3Client } from '../../clients/Aws/s3';
import CubeClient from '../../clients/cube/CubeClient';
import DbtCloudGraphqlClient from '../../clients/dbtCloud/DbtCloudGraphqlClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { SavedSemanticViewerChartService } from '../SavedSemanticViewerChartService/SavedSemanticViewerChartService';
import { pivotResults } from './Pivoting';

type SearchServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    downloadFileModel: DownloadFileModel;
    // Clients
    schedulerClient: SchedulerClient;
    cubeClient: CubeClient;
    dbtCloudClient: DbtCloudGraphqlClient;
    s3Client: S3Client;
    // Services
    savedSemanticViewerChartService: SavedSemanticViewerChartService;
};

export class SemanticLayerService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly downloadFileModel: DownloadFileModel;

    private readonly schedulerClient: SchedulerClient;

    // Clients
    private readonly cubeClient: CubeClient;

    private readonly dbtCloudClient: DbtCloudGraphqlClient;

    private readonly s3Client: S3Client;

    // Services

    private readonly savedSemanticViewerChartService: SavedSemanticViewerChartService;

    constructor(args: SearchServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
        this.downloadFileModel = args.downloadFileModel;
        this.schedulerClient = args.schedulerClient;
        // Clients
        this.cubeClient = args.cubeClient;
        this.dbtCloudClient = args.dbtCloudClient;
        this.s3Client = args.s3Client;
        // Services
        this.savedSemanticViewerChartService =
            args.savedSemanticViewerChartService;
    }

    private validateQueryLimit(query: SemanticLayerQuery) {
        if (query.limit && query.limit > this.lightdashConfig.query.maxLimit) {
            throw new ParameterError(
                `Limit cannot be greater than ${this.lightdashConfig.query.maxLimit}`,
            );
        }
    }

    private async checkCanViewProject(user: SessionUser, projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return project;
    }

    private static async checkSemanticViewerAccess(
        action: AbilityAction,
        {
            user,
            projectUuid,
            organizationUuid,
        }: { user: SessionUser; projectUuid: string; organizationUuid: string },
    ) {
        if (
            user.ability.cannot(
                action,
                subject('SemanticViewer', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async getSemanticLayerClient(
        _projectUuid: string, // TODO: get different client based on project, right now we're only doing this based on config
    ): Promise<CubeClient | DbtCloudGraphqlClient> {
        if (
            !!this.lightdashConfig.dbtCloud.bearerToken &&
            !!this.lightdashConfig.dbtCloud.environmentId
        ) {
            return this.dbtCloudClient;
        }

        if (
            !!this.lightdashConfig.cube.token &&
            !!this.lightdashConfig.cube.domain
        ) {
            return this.cubeClient;
        }

        throw new MissingConfigError('No semantic layer available');
    }

    async getViews(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerView[]> {
        const { organizationUuid } = await this.checkCanViewProject(
            user,
            projectUuid,
        );

        await SemanticLayerService.checkSemanticViewerAccess('view', {
            user,
            projectUuid,
            organizationUuid,
        });

        return this.analytics.wrapEvent<any[]>(
            {
                event: 'semantic_layer.get_views', // started, completed, error suffix when using wrapEvent
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                },
            },
            async () => {
                const client = await this.getSemanticLayerClient(projectUuid);
                return client.getViews();
            },
            // Extra properties for analytic event after the function is executed
            (result) => ({
                viewCount: result.length,
            }),
        );
    }

    async getFields(
        user: SessionUser,
        projectUuid: string,
        view: string,
        selectedFields: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ): Promise<SemanticLayerField[]> {
        const { organizationUuid } = await this.checkCanViewProject(
            user,
            projectUuid,
        );

        await SemanticLayerService.checkSemanticViewerAccess('view', {
            user,
            projectUuid,
            organizationUuid,
        });

        const client = await this.getSemanticLayerClient(projectUuid);

        return client.getFields(view, selectedFields);
    }

    async getStreamingResults(
        user: SessionUser,
        projectUuid: string,
        query: SemanticLayerQuery,
    ) {
        this.validateQueryLimit(query);

        const { organizationUuid } = await this.checkCanViewProject(
            user,
            projectUuid,
        );

        await SemanticLayerService.checkSemanticViewerAccess('view', {
            user,
            projectUuid,
            organizationUuid,
        });

        await this.getSemanticLayerClient(projectUuid); // Check if client is available

        const jobId = await this.schedulerClient.semanticLayerStreamingResults({
            projectUuid,
            userUuid: user.userUuid,
            query,
            context: 'semanticViewer',
        });

        return { jobId };
    }

    async streamQueryIntoFile({
        userUuid,
        projectUuid,
        query,
        context,
    }: SemanticLayerQueryPayload): Promise<{
        fileUrl: string;
        columns: string[];
    }> {
        // TODO add analytics
        Logger.debug(`Streaming query into file for project ${projectUuid}`);
        const client = await this.getSemanticLayerClient(projectUuid);

        this.validateQueryLimit(query);

        let columns: string[] = [];

        // Default stream function, just streams results into a file
        let streamFunctionCallback: (
            writer: (data: SemanticLayerResultRow) => void,
        ) => Promise<void> = async (writer) => {
            await client.streamResults(projectUuid, query, async (rows) => {
                if (!columns.length) {
                    columns = Object.keys(rows[0]).map((col) => col);
                }

                rows.forEach(writer);
            });
        };

        // When pivot is present, we need to pivot the results
        // To do this we first need to fetch all the results and then pivot them
        if (query.pivot) {
            const results = [] as SemanticLayerResultRow[];

            const { pivot } = query;

            // Wait for all results to be fetched, edit the query so that it only fetches the columns we need
            await client.streamResults(
                projectUuid,
                {
                    ...query,
                    dimensions: query.dimensions.filter(
                        (dimension) =>
                            pivot.index.includes(dimension.name) ||
                            pivot.on.includes(dimension.name),
                    ),
                    timeDimensions: query.timeDimensions.filter(
                        (timeDimension) =>
                            pivot.index.includes(timeDimension.name) ||
                            pivot.on.includes(timeDimension.name),
                    ),
                    metrics: query.metrics.filter((metric) =>
                        pivot.values.includes(metric.name),
                    ),
                    sortBy: query.sortBy.filter(
                        (sortBy) =>
                            pivot.index.includes(sortBy.name) ||
                            pivot.values.includes(sortBy.name) ||
                            pivot.on.includes(sortBy.name),
                    ),
                },
                async (rows) => {
                    results.push(...rows);
                },
            );

            // Pivot results
            const pivotedResults =
                query.pivot.index.length === 0
                    ? results
                    : pivotResults(results, query.pivot);

            streamFunctionCallback = async (writer) => {
                pivotedResults.forEach(writer);
            };

            columns = Object.keys(pivotedResults[0] ?? {});
        }

        const fileUrl = await this.downloadFileModel.streamFunction(
            this.s3Client,
        )(
            `${this.lightdashConfig.siteUrl}/api/v2/projects/${projectUuid}/semantic-layer/results`,
            streamFunctionCallback,
            this.s3Client,
        );

        return {
            fileUrl,
            columns,
        };
    }

    async getSql(
        user: SessionUser,
        projectUuid: string,
        query: SemanticLayerQuery,
    ): Promise<string> {
        const { organizationUuid } = await this.checkCanViewProject(
            user,
            projectUuid,
        );

        await SemanticLayerService.checkSemanticViewerAccess('view', {
            user,
            projectUuid,
            organizationUuid,
        });

        const client = await this.getSemanticLayerClient(projectUuid);
        this.validateQueryLimit(query);

        return client.getSql(query);
    }

    async getSemanticLayerClientInfo(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerClientInfo> {
        const { organizationUuid } = await this.checkCanViewProject(
            user,
            projectUuid,
        );

        await SemanticLayerService.checkSemanticViewerAccess('view', {
            user,
            projectUuid,
            organizationUuid,
        });

        const client = await this.getSemanticLayerClient(projectUuid);
        return client.getClientInfo();
    }

    async getSemanticViewerChartResultJob(
        user: SessionUser,
        projectUuid: string,
        findBy: { slug?: string; uuid?: string },
    ): Promise<{ jobId: string }> {
        if (!findBy.uuid && !findBy.slug) {
            throw new ParameterError('uuid or slug is required');
        }

        const savedChart =
            await this.savedSemanticViewerChartService.getSemanticViewerChart(
                user,
                projectUuid,
                findBy,
            );

        await SemanticLayerService.checkSemanticViewerAccess('view', {
            user,
            projectUuid,
            organizationUuid: savedChart.organization.organizationUuid,
        });

        const { hasAccess: hasViewAccess } =
            await this.savedSemanticViewerChartService.hasSavedChartAccess(
                user,
                'view',
                savedChart,
            );

        if (!hasViewAccess) {
            throw new ForbiddenError("You don't have access to this chart");
        }

        const jobId = await this.schedulerClient.semanticLayerStreamingResults({
            context: 'semanticViewer',
            projectUuid,
            query: savedChart.semanticLayerQuery,
            userUuid: user.userUuid,
        });

        return {
            jobId,
        };
    }
}
