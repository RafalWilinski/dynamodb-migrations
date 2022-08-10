const { FunctionlessProject } = require("@functionless/projen");
const project = new FunctionlessProject({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  devDeps: [
    "@functionless/projen",
    "@types/change-case",
    "@types/lodash.sortby",
  ],
  name: "dynamodb-mass-update",
  eslintOptions: {
    prettier: true,
    quotes: "double",
  },
  scripts: {
    "deploy-example":
      'cdk deploy --app "npx ts-node src/examples/test-stack.ts"',
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

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
