//SOAP (apiType field)
//SERVICEURL
//if not v3 then v2
//select environment
//make sure documents is being created

const { ApiManagementClient } = require("@azure/arm-apimanagement");
const { ClientSecretCredential } = require("@azure/identity");
const axios = require('axios');
const fs = require('fs');
const path = require('path');
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;  // Ignore SSL certificate errors
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const path = require("path");
const argv = yargs(hideBin(process.argv)).argv;
const env = argv.env || 'test';
console.log(`Environment: ${env}`);
const envFilePath = env === 'prod' ? '.env.prod' : '.env.test';
require('dotenv').config({ path: envFilePath });
let subscriptionId, resourceGroupName, serviceName
switch (serviceName) {
    case 'datos':
        subscriptionId = process.env["APIMANAGEMENT_SUBSCRIPTION_ID"]
        resourceGroupName = process.env["APIMANAGEMENT_RESOURCE_GROUP"]
        serviceName = process.env["APIMANAGEMENT_SERVICE_NAME"]
        break;
}
const apiConnectBaseUrl = process.env["API_CONNECT_BASE_URL"]
const apiConnectOrgName = process.env["API_CONNECT_ORG_NAME"]

function ensureDirectoryExistence(filePath) {
    const dirname = require('path').dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    try {
        fs.mkdirSync(filePath, { recursive: true });
    } catch (err) {
        console.log({ err })
    }
}

async function getAPI(client, apiId, version, apiType = undefined) {
    const format = version === 'v3' ? 'openapi+json-link' : 'swagger-link ';
    // const format = version === 'v3' ? 'openapi+json-link' : apiType === 'soap' ? 'wsdl-link' : 'swagger-link';
    console.log(`Exporting API: ${apiId}`);
    const result = await client.apiExport.get(
        resourceGroupName,
        serviceName,
        apiId,
        format,
        exportParam = "true"
    );
    const swaggerUrl = result.properties.value.link;
    return swaggerUrl;
}

// Updated exportAndImportAPIs function
async function exportAndImportAPIs() {
    const credential = new ClientSecretCredential(
        process.env["ARM_TENANT_ID"],
        process.env["ARM_TEST_CLIENT_ID"],
        process.env["ARM_TEST_CLIENT_SECRET"]
    );
    console.log({ credential })
    const client = new ApiManagementClient(credential, subscriptionId);

    // List all APIs in the API Management service
    const apis = new Array();
    for await (let item of client.api.listByService(resourceGroupName, serviceName)) {
        apis.push(item);
    }
    console.log({ apis })
    for (const api of apis) {
        const apiId = api.name;
        const apiType = api.apiType;
        const backendUrl = api.serviceUrl;
        const basePath = api.path;
        // Export API to a Swagger link
        try {
            let swaggerUrl = await getAPI(client, apiId, 'v3', apiType);
            // Fetch the Swagger JSON from the export link
            let swaggerResponse = await axios.get(swaggerUrl);
            if (![200, 304].includes(swaggerResponse.status)) {
                console.log(`Failed exporting as v3, trying v2`);
                swaggerUrl = await getAPI(client, apiId, 'v2', apiType);
                swaggerResponse = await axios.get(swaggerUrl);
            }
            const swaggerContent = swaggerResponse.data;

            // Ensure the directory exists
            ensureDirectoryExistence(`./${serviceName}_documents/`);

            // Write Swagger content to a file
            const filePath = `./${serviceName}_documents/${apiId}.json`;
            fs.writeFileSync(filePath, JSON.stringify(swaggerContent, null, 2));
            console.log(`Swagger file written to ${filePath}`);

            // Import the Swagger JSON to IBM API Connect
            // await importToAPIConnect(apiId, swaggerContent);
        } catch (error) {
            console.error(`Error exporting or importing API ${apiId}:`, error.message);
        }
    }
}


let tokenCache = {
    token: null,
    expiresAt: null
};
async function APIConnectAuthToken() {
    try {
        // Check if token is in cache and not expired
        if (tokenCache.token && tokenCache.expiresAt && new Date() < tokenCache.expiresAt) {
            return tokenCache.token;
        }

        // Token is expired or not available, fetch a new one
        const response = await axios.post(`${apiConnectBaseUrl}/api/token`, {
            grant_type: 'password',
            username: process.env["API_CONNECT_USERNAME"],
            password: process.env["API_CONNECT_PASSWORD"],
            realm: process.env["API_CONNECT_REALM"],
            client_id: process.env["API_CONNECT_CLIENT_ID"],
            client_secret: process.env["API_CONNECT_CLIENT_SECRET"]
        });

        if (!response.status.toString().startsWith('2')) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        // Store the token and its expiration time in the cache
        tokenCache.token = response.data.access_token;
        tokenCache.expiresAt = new Date(new Date().getTime() + (response.data.expires_in * 1000)); // Calculate expiration time

        return tokenCache.token;
    } catch (error) {
        console.error(`Error getting API Connect Auth Token:`, error.message);
    }
}

async function importToAPIConnect(swaggerContent) {
    const { title, version } = swaggerContent.info

    try {
        const response = await axios.post(`${apiConnectBaseUrl}/api/orgs/${apiConnectOrgName}/drafts/draft-apis`, swaggerContent, {
            headers: {
                'Authorization': `Bearer ${await APIConnectAuthToken()}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.status.toString().startsWith('2'))
            throw new Error(`${response.status} ${response.statusText}`);
        console.log(`Successfully imported API: ${title}:${version} to IBM API Connect`);
    } catch (error) {
        console.error(`Error importing API ${title}:${version} to IBM API Connect:`, error.message);
    }
}

// Start the export and import process
ensureDirectoryExistence(`./${serviceName}_documents/`);
// exportAndImportAPIs().catch(console.error);
