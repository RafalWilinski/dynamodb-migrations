const { FunctionlessProject } = require("@functionless/projen");
const project = new FunctionlessProject({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  devDeps: [
    "@functionless/projen",
    "@types/change-case",
    "@types/lodash.sortby",
  ],
  package: true,
  appEntrypoint: "./src/index.ts",
  name: "dynamodb-mass-update",
  eslintOptions: {
    prettier: true,
    quotes: "double",
  },
  scripts: {
    "deploy-example":
      'cdk deploy --app "npx ts-node src/examples/test-stack.ts"',
    prerelease: "npm run prepare && npm run compile && npm run package",
  },
  description:
    "Functionless-based mini-framework for DynamoDB migrations in AWS CDK.",
  deps: [
    "@aws-sdk/client-sfn",
    "@types/aws-lambda",
    "change-case",
    "lodash.sortby",
  ],
  release: true,
  packageName: "@dynobase/dynamodb-migrations",
});

project.synth();
