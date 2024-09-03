const { ApiManagementClient } = require("@azure/arm-apimanagement");
const { DefaultAzureCredential } = require("@azure/identity");
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();  // To use environment variables from a .env file
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;  // Ignore SSL certificate errors

const subscriptionId = process.env["APIMANAGEMENT_SUBSCRIPTION_ID"] || "<YourAzureSubscriptionId>";
const resourceGroupName = process.env["APIMANAGEMENT_RESOURCE_GROUP"] || "<YourResourceGroupName>";
const serviceName = process.env["APIMANAGEMENT_SERVICE_NAME"] || "<YourAPIManagementServiceName>";
const apiConnectBaseUrl = process.env["API_CONNECT_BASE_URL"] || "<YourAPIConnectBaseUrl>";
const apiConnectOrgName = process.env["API_CONNECT_ORG_NAME"] || "<YourAPIConnectOrgName>";

function ensureDirectoryExistence(filePath) {
    const dirname = require('path').dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    fs.mkdirSync(dirname, { recursive: true });
}

// Updated exportAndImportAPIs function
async function exportAndImportAPIs() {
    const credential = new DefaultAzureCredential();
    const client = new ApiManagementClient(credential, subscriptionId);

    // List all APIs in the API Management service
    const apis = new Array();
    for await (let item of client.api.listByService(resourceGroupName, serviceName)) {
        apis.push(item);
    }
    for (const api of apis) {
        const apiId = api.name;
        const format = "swagger-link";
        const exportParam = "true";

        // Export API to a Swagger link
        try {
            console.log(`Exporting API: ${apiId}`);
            const result = await client.apiExport.get(
                resourceGroupName,
                serviceName,
                apiId,
                format,
                exportParam
            );
            const swaggerUrl = result.value.link;

            // Fetch the Swagger JSON from the export link
            const swaggerResponse = await axios.get(swaggerUrl);
            const swaggerContent = swaggerResponse.data;

            // Ensure the directory exists
            ensureDirectoryExistence('./documents/');

            // Write Swagger content to a file
            const filePath = `./documents/${apiId}.json`;
            fs.writeFileSync(filePath, JSON.stringify(swaggerContent, null, 2));
            console.log(`Swagger file written to ${filePath}`);

            // Import the Swagger JSON to IBM API Connect
            await importToAPIConnect(apiId, swaggerContent);
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
exportAndImportAPIs().catch(console.error);
