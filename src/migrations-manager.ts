import * as fs from "fs";
import * as path from "path";
import { ExecutionStatus } from "@aws-sdk/client-sfn";
import { aws_dynamodb, CustomResource, Duration, Fn } from "aws-cdk-lib";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { Table } from "functionless";
import CustomResourceIsMigrationCompleteChecker from "./custom-resource-is-migration-complete";
import CustomResourceMigrationsRunner from "./custom-resource-migrations-runner";
import { Migration } from "./migration";

export type MigrationManagerProps = {
  /**
   * Custom name for the DynamoDB table storing migrations
   */
  tableName?: string;

  /**
   * Directory where migration files are stored
   */
  migrationsDir: string;

  /**
   * Maximum time that can be allocated for all migrations applied during one deployment.
   * Cannot exceed 2 hours, it's CloudFormation's hard limitation.
   *
   * @default Duration.hours(2)
   */
  totalMigrationsTimeout?: Duration;
};

export type MigrationHistoryItem = {
  id: string;
  status: ExecutionStatus;
  startedAt: string;
  executionArn: string;
  endedAt?: string;
};

export class MigrationsManager extends Construct {
  public readonly migrationsHistoryTable: Table<MigrationHistoryItem, "id">;

  public readonly totalMigrationsTimeout: Duration;

  constructor(scope: Construct, id: string, props: MigrationManagerProps) {
    super(scope, id);

    this.totalMigrationsTimeout =
      props.totalMigrationsTimeout ?? Duration.hours(2);

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
      try {
        // Cannot use dynamic imports here due to synchronous nature of CDKs synthesis process
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const migrationStack = require(path.resolve(
          migrationsDir,
          migrationFile
        )).migration(this, migrationFile);

        migrationStacks.push(migrationStack);
      } catch (e) {
        console.log({ e });
        throw new Error(`Error loading migration file ${migrationFile}: ${e}`);
      }
    }

    const migrationIdStateMachinePairs = migrationStacks.map((migration) => ({
      stateMachineArn: Fn.importValue(
        `${migration.migrationName}StateMachineArn`
      ).toString(),
      migrationId: migration.migrationName,
    }));

    const onEventHandler = new CustomResourceMigrationsRunner(
      this,
      "MigrationsRunner",
      {
        migrationsHistoryTable,
        migrationIdStateMachinePairs,
      }
    );

    const isCompleteHandler = new CustomResourceIsMigrationCompleteChecker(
      this,
      "MigrationsStatusChecker",
      {
        migrationsHistoryTable,
        migrationIdStateMachinePairs,
      }
    );

    const migrationsProvider = new Provider(this, "MigrationsProvider", {
      totalTimeout: this.totalMigrationsTimeout,
      queryInterval: Duration.seconds(10),
      onEventHandler: onEventHandler.function.resource,
      isCompleteHandler: isCompleteHandler.function.resource,
    });

    // Ensure migrations provider is ran after all nested stacks are created
    migrationStacks.map((stack) => {
      migrationsProvider.node.addDependency(stack);
    });

    new CustomResource(this, "MigrationsTrigger", {
      serviceToken: migrationsProvider.serviceToken,
      properties: {
        // Force re-running the migrations every time the stack is updated
        timestamp: Date.now(),
        migrationIdStateMachinePairs,
      },
    });
  }
}
