import { CfnOutput, NestedStack } from "aws-cdk-lib";
import { Table as cdkTable } from "aws-cdk-lib/aws-dynamodb";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { LogLevel } from "aws-cdk-lib/aws-stepfunctions";
import { camelCase } from "change-case";
import { Construct } from "constructs";
import {
  ITable,
  StepFunction,
  Table,
  Function,
  $AWS,
  $SFN,
} from "functionless";
import { ScanOutput } from "typesafe-dynamodb/lib/scan";

export type ScanTableOptions = {
  segments: number;
};

export type MigrationProps = {
  tableArn: string;
  migrationName: string;
};

export type TransformFunctionType<T extends object> = (input: {
  result: ScanOutput<T, any, any>;
}) => Promise<any>;

export class Migration<T extends object> extends NestedStack {
  public readonly table: ITable<T, any, any>;

  public readonly migrationName: string;

  public stateMachineArn?: CfnOutput;

  constructor(scope: Construct, id: string, props: MigrationProps) {
    super(scope, id);

    this.migrationName = camelCase(props.migrationName.split(".")[0]);
    this.table = Table.fromTable(
      cdkTable.fromTableArn(this, "SubjectTable", props.tableArn)
    );
  }

  // Creates a state machine scanning whole table in parallel and applying transform function to each item.
  public scan(
    _transformFn: TransformFunctionType<T>,
    options?: ScanTableOptions
  ) {
    const totalSegments = options?.segments ?? 10;
    const segments = Array.from({ length: totalSegments }, (_, i) => i);

    // "this" cannot be referenced in a Function.
    const table = this.table;

    const transformFunction = new Function(
      this,
      "MigrationCallbackFunction",
      _transformFn
    );

    const stateMachine = new StepFunction(
      this,
      "MigrationStateMachine",
      {
        stateMachineName: this.migrationName,
        logs: {
          destination: new LogGroup(this, "MigrationLogGroup", {
            retention: RetentionDays.ONE_WEEK,
          }),
          level: LogLevel.ALL,
        },
      },
      async () => {
        return $SFN.map(segments, async (_, index) => {
          let lastEvaluatedKey;
          let firstRun = true;

          while (firstRun || lastEvaluatedKey) {
            firstRun = false;

            const result = await $AWS.DynamoDB.Scan({
              Table: table,
              TotalSegments: totalSegments,
              Segment: index,
            });

            if (result.LastEvaluatedKey) {
              lastEvaluatedKey = result.LastEvaluatedKey;
            }

            await transformFunction({ result });
          }
        });
      }
    );

    console.log(this.migrationName);

    this.stateMachineArn = new CfnOutput(this, "StateMachineArn", {
      exportName: `${this.migrationName}StateMachineArn`,
      value: stateMachine.resource.stateMachineArn,
    });

    return stateMachine;
  }
}

export type MigrationFunction = (
  scope: Construct,
  id: string,
  props: MigrationProps
) => Migration<any>;
