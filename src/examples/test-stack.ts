import { App, CfnOutput, Stack } from "aws-cdk-lib";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { MigrationsManager } from "../app";

const app = new App();

class TestStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    const table = new Table(this, "Table", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
    });

    new MigrationsManager(this, "MigrationsManager", {
      migrationsDir: "./src/examples/migrations",
    });

    new CfnOutput(this, "TableArn", {
      value: table.tableArn,
    });
  }
}

new TestStack(app, "TestStack");
