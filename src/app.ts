import { App, Stack } from "aws-cdk-lib";
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

const app = new App();
const stack = new Stack(app, "stack");

export type ScanTableOptions = {
  segments: number;
};

export type MigrationProps = {
  tableArn: string;
};

export type TransformFunctionType<T extends object> = (
  _table: ITable<T, any, any>,
  result: ScanOutput<any, any, any>
) => Promise<any>;

export class Migration<T extends object> extends Construct {
  public readonly table: ITable<T, any, any>;
  constructor(scope: Construct, id: string, props: MigrationProps) {
    super(scope, id);

    this.table = Table.fromTable(
      cdkTable.fromTableArn(stack, "SubjectTable", props.tableArn)
    );
  }

  public run(
    transformFn: TransformFunctionType<T>,
    options?: ScanTableOptions
  ) {
    const totalSegments = options?.segments ?? 10;
    const segments = Array.from({ length: totalSegments }, (_, i) => i);

    new StepFunction(stack, "MigrationStepFunction", async () => {
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
            stack,
            "MigrationCallbackFunction",
            await transformFn(this.table, result)
          );
        }
      });
    });

    return this;
  }
}
