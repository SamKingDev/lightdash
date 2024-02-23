import { ApiErrorPayload, Comment } from '@lightdash/common';
import {
    ApiCreateComment,
    ApiGetComments,
    ApiResolveComment,
} from '@lightdash/common/src/types/api/comments';
import {
    Body,
    Controller,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { dashboardService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/comments')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Comments')
export class CommentsController extends Controller {
    /**
     * Creates a comment on a dashboard tile
     * @param req express request
     * @param body the comment to create
     * @param dashboardUuid the uuid of the dashboard
     * @param dashboardTileUuid the uuid of the dashboard tile
     * @returns the id of the created comment
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dashboards/{dashboardUuid}/{dashboardTileUuid}')
    @OperationId('createComment')
    async createComment(
        @Path() dashboardUuid: string,
        @Path() dashboardTileUuid: string,
        @Request() req: express.Request,
        @Body() body: Pick<Comment, 'text' | 'replyTo' | 'mentions'>,
    ): Promise<ApiCreateComment> {
        const commentId = await dashboardService.createComment(
            req.user!,
            dashboardUuid,
            dashboardTileUuid,
            body.text,
            body.replyTo ?? null,
            body.mentions,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: commentId,
        };
    }

    /**
     * Gets all comments for a dashboard
     * @param req express request
     * @param dashboardUuid the uuid of the dashboard
     * @returns all comments for a dashboard
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dashboards/{dashboardUuid}')
    @OperationId('getComments')
    async getComments(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetComments> {
        const results = await dashboardService.findCommentsForDashboard(
            req.user!,
            dashboardUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Resolves a comment on a dashboard
     * @param req express request
     * @param dashboardUuid the uuid of the dashboard
     * @param commentId the uuid of the comment
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/dashboards/{dashboardUuid}/{commentId}')
    @OperationId('resolveComment')
    async resolveComment(
        @Path() dashboardUuid: string,
        @Path() commentId: string,
        @Request() req: express.Request,
    ): Promise<ApiResolveComment> {
        await dashboardService.resolveComment(
            req.user!,
            dashboardUuid,
            commentId,
        );
        this.setStatus(200);
        return {
            status: 'ok',
        };
    }

    /**
     * Deletes a comment on a dashboard
     * @param req express request
     * @param dashboardUuid the uuid of the dashboard
     * @param commentId the uuid of the comment
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/dashboards/{dashboardUuid}/{commentId}')
    @OperationId('deleteComment')
    async deleteComment(
        @Path() dashboardUuid: string,
        @Path() commentId: string,
        @Request() req: express.Request,
    ): Promise<ApiResolveComment> {
        await dashboardService.deleteComment(
            req.user!,
            dashboardUuid,
            commentId,
        );
        this.setStatus(200);
        return {
            status: 'ok',
        };
    }
}
