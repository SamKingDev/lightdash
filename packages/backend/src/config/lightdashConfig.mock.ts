import { LightdashMode } from '@lightdash/common';
import { LightdashConfig } from './parseConfig';

export const lightdashConfigMock: LightdashConfig = {
    allowMultiOrgs: false,
    auth: {
        disablePat: false,
        enableGroupSync: false,
        disablePasswordAuthentication: false,
        enableOidcLinking: false,
        google: {
            loginPath: '',
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            callbackPath: '',
            googleDriveApiKey: undefined,
            enabled: false,
        },
        okta: {
            loginPath: '',
            oauth2Issuer: undefined,
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            authorizationServerId: undefined,
            extraScopes: undefined,
            oktaDomain: undefined,
            callbackPath: '',
        },
        oneLogin: {
            oauth2Issuer: undefined,
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            callbackPath: '',
            loginPath: '',
        },
        azuread: {
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            oauth2TenantId: undefined,
            loginPath: '',
            callbackPath: '',
            x509PublicKeyCertPath: undefined,
            x509PublicKeyCert: undefined,
            privateKeyFilePath: undefined,
            privateKeyFile: undefined,
            openIdConnectMetadataEndpoint: undefined,
        },
        oidc: {
            authMethod: undefined,
            authSigningAlg: undefined,
            callbackPath: '',
            loginPath: '',
            clientId: undefined,
            clientSecret: undefined,
            metadataDocumentEndpoint: undefined,
            privateKeyFile: undefined,
            privateKeyFilePath: undefined,
            scopes: undefined,
            x509PublicKeyCert: undefined,
            x509PublicKeyCertPath: undefined,
        },
    },
    lightdashCloudInstance: 'test-instance',
    k8s: {
        podNamespace: undefined,
        podName: undefined,
        nodeName: undefined,
    },
    chart: { versionHistory: { daysLimit: 0 } },
    customVisualizations: { enabled: false },
    database: {
        connectionUri: undefined,
        maxConnections: undefined,
        minConnections: undefined,
    },
    intercom: {
        appId: '',
        apiBase: '',
    },
    pylon: {
        appId: '',
    },
    lightdashSecret: '',
    logging: {
        level: 'debug',
        format: 'pretty',
        outputs: [],
        consoleFormat: undefined,
        consoleLevel: undefined,
        fileFormat: undefined,
        fileLevel: undefined,
        filePath: '',
    },
    maxPayloadSize: '',
    pivotTable: { maxColumnLimit: 0 },
    posthog: {
        projectApiKey: '',
        apiHost: '',
    },
    resultsCache: { cacheStateTimeSeconds: 0, enabled: false, s3: {} },
    rudder: {
        writeKey: '',
        dataPlaneUrl: '',
    },
    scheduler: { concurrency: 0, enabled: false, jobTimeout: 0 },
    secureCookies: false,
    sentry: {
        backend: {
            dsn: '',
        },
        frontend: {
            dsn: '',
        },
        release: '',
        environment: '',
        anr: {
            enabled: false,
            captureStacktrace: false,
        },
    },
    staticIp: '',
    trustProxy: false,
    version: '1.0',
    mode: LightdashMode.DEFAULT,
    groups: {
        enabled: false,
    },
    extendedUsageAnalytics: {
        enabled: false,
    },
    smtp: undefined,
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 5000,
        csvCellsLimit: 100000,
        timezone: undefined,
    },
};
