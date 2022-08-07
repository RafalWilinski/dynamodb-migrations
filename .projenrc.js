const { FunctionlessProject } = require("@functionless/projen");
const project = new FunctionlessProject({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  devDeps: ["@functionless/projen"],
  name: "dynamodb-mass-update",
  eslintOptions: {
    prettier: true,
    quotes: "double",
  },

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
