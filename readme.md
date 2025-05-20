# AzureToAPIC

This project exports APIs from Azure API Management and imports them into IBM API Connect.

## Features
- Exports all APIs from a specified Azure API Management service as OpenAPI (Swagger) definitions.
- Saves exported API definitions locally as JSON files.
- (Optional) Imports the exported APIs into IBM API Connect (import function included, but commented out by default).

## Prerequisites
- Node.js (v14 or higher recommended)
- Azure API Management account with appropriate permissions
- IBM API Connect account with API creation permissions

## Setup
1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.test` or `.env.prod` and fill in your credentials:
   ```bash
   cp .env.example .env.test
   # or for production
   cp .env.example .env.prod
   ```
4. Edit the `.env.test` or `.env.prod` file with your Azure and IBM API Connect credentials.

## Usage
Run the script with the desired environment (default is `test`):

```bash
node index.js --env=test
# or for production
node index.js --env=prod
```

You can also specify a service name:
```bash
node index.js --env=test --serviceName=datos
```

## Environment Variables
See `.env.example` for all required variables.

## Notes
- Exported Swagger files are saved in the `datos_documents/` directory by default.
- The import to IBM API Connect is included as a function but commented out. Uncomment the relevant line in `index.js` if you want to enable automatic import.
- The script disables SSL certificate validation for local development. For production, ensure proper certificate handling.

## License
MIT