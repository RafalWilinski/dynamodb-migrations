import * as fs from "fs";
import * as path from "path";
import { aws_dynamodb, Stack } from "aws-cdk-lib";
import { Table as cdkTable } from "aws-cdk-lib/aws-dynamodb";
import { Provider } from "aws-cdk-lib/custom-resources";
import { CloudFormationCustomResourceEvent } from "aws-lambda";
import { Construct } from "constructs";
import {
  $AWS,
  $SFN,
  StepFunction,
  Table,
  Function,
  ITable,
} from "functionless";
import { ScanOutput } from "typesafe-dynamodb/lib/scan";

export type ScanTableOptions = {
  segments: number;
};

export type MigrationProps = {
  tableArn: string;
};

export type MigrationManagerProps = {
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

export type TransformFunctionType<T extends object> = (
  _table: ITable<T, any, any>,
  result: ScanOutput<any, any, any>
) => Promise<any>;

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

    console.log({ migrationFiles });

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
      }
    );

    new Provider(this, "MigrationsProvider", {
      onEventHandler: onEventHandler.resource,
    });
  }
}

export class Migration<T extends object> extends Stack {
  public readonly table: ITable<T, any, any>;

  constructor(scope: Construct, id: string, props: MigrationProps) {
    super(scope, id);

    this.table = Table.fromTable(
      cdkTable.fromTableArn(this, "SubjectTable", props.tableArn)
    );
  }

  public run(
    transformFn: TransformFunctionType<T>,
    options?: ScanTableOptions
  ) {
    const totalSegments = options?.segments ?? 10;
    const segments = Array.from({ length: totalSegments }, (_, i) => i);

    // todo: add migration entry "in_progress"

    new StepFunction(this, "MigrationStepFunction", {}, async () => {
      return $SFN.map(segments, async (_, index) => {
        let lastEvaluatedKey;
        let firstRun = true;

        while (firstRun || lastEvaluatedKey) {
          firstRun = false;

          const result = await $AWS.DynamoDB.Scan({
            Table: this.table,
            TotalSegments: totalSegments,
            Segment: index,
          });

          result.LastEvaluatedKey = result.LastEvaluatedKey;

          new Function(
            this,
            "MigrationCallbackFunction",
            await transformFn(this.table, result)
          );
        }

        // todo: add migration entry "completed" for some segment?
      });
    });

    return this;
  }
}
