import { aws_dynamodb, Stack } from "aws-cdk-lib";
import { Table as cdkTable } from "aws-cdk-lib/aws-dynamodb";
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
  tableName: string;
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

    this.migrationsHistoryTable = new Table(scope, "MigrationsHistoryTable", {
      tableName: props.tableName,
      partitionKey: {
        name: "id",
        type: aws_dynamodb.AttributeType.STRING,
      },
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

    // todo: fetch migrations history table name
    // todo: add migration entry "in_progress"

    new StepFunction(this, "MigrationStepFunction", async () => {
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
