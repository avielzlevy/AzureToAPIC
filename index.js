const fs = require('fs');  // Import File System module

// Add this function to check if the directory exists and create it if it doesn't
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
    const apis = client.api.listByService(resourceGroupName, serviceName);
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
