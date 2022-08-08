import * as fs from "fs";
import * as path from "path";
import { aws_dynamodb, CustomResource } from "aws-cdk-lib";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { Table } from "functionless";
import CustomResourceMigrationsRunner from "./custom-resource-migrations-runner";
import { Migration } from "./migration";

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
    let migrationStacks: Migration<any>[] = [];

    for (const migrationFile of migrationFiles) {
      // Cannot use dynamic imports here due to synchronous nature of CDKs synthesis process
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const migrationStack = require(path.resolve(
        migrationsDir,
        migrationFile
      )).migration(this, migrationFile);

      console.log({ migrationFile, migrationStack });

      migrationStacks.push(migrationStack);
    }

    const onEventHandler = new CustomResourceMigrationsRunner(
      this,
      "MigrationsRunner",
      //todo: For some reason migrationStacks arent' passed properly.
      // consider passing just SFN ARNs and recreating them inside migrationsRunner ( need to add a cdk.output?)
      { migrationsHistoryTable, migrationFiles, migrationStacks }
    );

    const migrationsProvider = new Provider(this, "MigrationsProvider", {
      onEventHandler: onEventHandler.function.resource,
    });

    // Ensure migrations provider is ran after all nested stacks are created
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
