import * as fs from "fs";
import * as path from "path";
import { aws_dynamodb, CustomResource } from "aws-cdk-lib";
import { Provider } from "aws-cdk-lib/custom-resources";
import { CloudFormationCustomResourceEvent } from "aws-lambda";
import { Construct } from "constructs";
import { $AWS, Table, Function } from "functionless";

export type MigrationManagerProps = {
  /**
   * Custom name for the DynamoDB table storing migrations
   */
  tableName?: string;
  migrationsDir: string;
};

export type MigrationHistoryItem = {
  id: string;
  status: "success" | "in_progress" | "failure";
  startedAt: string;
  endedAt: string;
  segments: number;
  completedSegments?: number[];
};

export class MigrationsManager extends Construct {
  public readonly migrationsHistoryTable: Table<MigrationHistoryItem, "id">;

  constructor(scope: Construct, id: string, props: MigrationManagerProps) {
    super(scope, id);

    const migrationsHistoryTable = new Table<MigrationHistoryItem, "id">(
      scope,
      "MigrationsHistoryTable",
      {
        tableName: props.tableName,
        partitionKey: {
          name: "id",
          type: aws_dynamodb.AttributeType.STRING,
        },
        billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      }
    );
    this.migrationsHistoryTable = migrationsHistoryTable;

    const migrationsDir = path.resolve(props.migrationsDir);
    const migrationFiles = fs.readdirSync(migrationsDir);

    let migrationStacks = [];

    for (const migrationFile of migrationFiles) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const migrationStack = require(path.resolve(
        migrationsDir,
        migrationFile
      ));

      migrationStacks.push(migrationStack.migration(this, migrationFile));
    }

    const onEventHandler = new Function(
      this,
      "OnEventHandler",
      async (event: CloudFormationCustomResourceEvent) => {
        console.log(event);

        const migrations = await $AWS.DynamoDB.Scan({
          Table: migrationsHistoryTable,
        });

        console.log({ migrations });

        const migrationsToRun = migrationFiles.filter(
          (migrationFile) =>
            !(migrations.Items ?? []).find(
              (migration) => migration.id.S === migrationFile
            )
        );

        console.log({ migrationsToRun });

        // todo: Start the migrations
      }
    );

    const migrationsProvider = new Provider(this, "MigrationsProvider", {
      onEventHandler: onEventHandler.resource,
    });

    migrationStacks.map((stack) =>
      migrationsProvider.node.addDependency(stack)
    );

    new CustomResource(this, "MigrationsTrigger", {
      serviceToken: migrationsProvider.serviceToken,
      properties: {
        // Force re-running the migrations every time the stack is updated
        timestamp: Date.now(),
      },
    });
  }
}
